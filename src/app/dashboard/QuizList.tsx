"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { QUIZ_KIND_LABEL, type QuizKind, type QuizStatus } from "@/lib/types";
import { relativeTime } from "@/lib/relative-time";
import { FilterBar, SearchInput, FilterSelect } from "@/lib/SearchFilter";
import { duplicateQuiz, deleteQuiz } from "./actions";

/**
 * `privat` = terikat ke sesi Tera (lewat `quizzes.session_id` atau baris
 * `assessments`): murid harus login dan terdaftar di kelas sesi itu, dan
 * nilainya mengalir ke Tera. `publik` = kode lepas yang bisa dikerjakan siapa
 * saja yang memegangnya, tanpa akun.
 */
export type QuizAudience = "privat" | "publik";

/** Peran pembuatnya. `null` kalau profilnya tidak terbaca — RLS Tera hanya membuka profil sendiri untuk tutor. */
export type QuizSource = "admin" | "tutor" | null;

export interface QuizListItem {
  id: string;
  title: string;
  status: QuizStatus;
  kind: QuizKind;
  shareCode: string | null;
  /** `quizzes.updated_at` kalau migrasi 078 sudah jalan, kalau belum `created_at`. */
  updatedAt: string;
  createdAt: string;
  audience: QuizAudience;
  source: QuizSource;
  /** Attempt yang sudah disubmit. */
  done: number;
  /** Attempt yang dibuka tapi belum disubmit. */
  inProgress: number;
}

type SortKey = "updated" | "created" | "name";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Terakhir diperbarui",
  created: "Terbaru dibuat",
  name: "Judul A–Z",
};

const audienceLabel: Record<QuizAudience, string> = {
  privat: "Privat",
  publik: "Publik",
};

const audienceHint: Record<QuizAudience, string> = {
  privat: "Terikat sesi Tera — hanya murid kelas sesi itu yang bisa mengerjakan, nilainya masuk ke Tera",
  publik: "Kode lepas — siapa pun yang punya link bisa mengerjakan, tanpa akun",
};

const audienceColor: Record<QuizAudience, string> = {
  privat: "bg-indigo-50 text-indigo-700",
  publik: "bg-sky-50 text-sky-700",
};

/**
 * Jenis paket dulunya tiga menu terpisah. Dilebur jadi satu gudang, jenisnya
 * turun pangkat: tetap istilah produk yang dipakai sehari-hari, tapi jadi label
 * dan saringan, bukan alamat.
 */
const kindColor: Record<QuizKind, string> = {
  asesmen: "bg-blue-50 text-blue-700",
  remedial: "bg-purple-50 text-purple-700",
  tryout: "bg-teal-50 text-teal-700",
};

const sourceLabel: Record<"admin" | "tutor", string> = {
  admin: "Admin",
  tutor: "Tutor",
};

const statusLabel: Record<QuizStatus, string> = {
  draft: "Draf",
  published: "Terbit",
  closed: "Ditutup",
};

const statusColor: Record<QuizStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  published: "bg-green-100 text-green-700",
  closed: "bg-yellow-100 text-yellow-700",
};

export default function QuizList({
  items,
  renderedAt,
}: {
  items: QuizListItem[];
  renderedAt: number;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [kind, setKind] = useState<QuizKind | "">("");
  const [audience, setAudience] = useState<QuizAudience | "">("");
  const [source, setSource] = useState<"admin" | "tutor" | "">("");

  // Disaring & diurutkan di klien: daftarnya sudah dimuat utuh (belum ada
  // paginasi), jadi menyaring di server hanya menambah bolak-balik tanpa
  // menghemat apa pun — dan pencarian jadi terasa seketika.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter(
      (item) =>
        (!needle || item.title.toLowerCase().includes(needle)) &&
        (!kind || item.kind === kind) &&
        (!audience || item.audience === audience) &&
        (!source || item.source === source),
    );
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title, "id");
      const key = sort === "created" ? "createdAt" : "updatedAt";
      return new Date(b[key]).getTime() - new Date(a[key]).getTime();
    });
  }, [items, query, sort, kind, audience, source]);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
        Belum ada paket soal. Buat yang pertama!
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Cari judul paket soal…"
          label="Cari paket soal"
        />

        <FilterSelect value={kind} onChange={setKind} label="Saring jenis">
          <option value="">Semua jenis</option>
          {(Object.keys(QUIZ_KIND_LABEL) as QuizKind[]).map((k) => (
            <option key={k} value={k}>
              {QUIZ_KIND_LABEL[k]}
            </option>
          ))}
        </FilterSelect>

        <FilterSelect value={audience} onChange={setAudience} label="Saring tipe">
          <option value="">Semua tipe</option>
          <option value="privat">Privat</option>
          <option value="publik">Publik</option>
        </FilterSelect>

        <FilterSelect value={source} onChange={setSource} label="Saring sumber">
          <option value="">Semua sumber</option>
          <option value="admin">Admin</option>
          <option value="tutor">Tutor</option>
        </FilterSelect>

        <FilterSelect value={sort} onChange={setSort} label="Urutkan">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              Urutkan: {SORT_LABEL[key]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-gray-500">
          Tidak ada paket soal yang cocok dengan saringan itu.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {visible.map((item) => (
            <Row key={item.id} item={item} renderedAt={renderedAt} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ item, renderedAt }: { item: QuizListItem; renderedAt: number }) {
  const [pending, startTransition] = useTransition();
  // Konfirmasi hapus ditahan di state, bukan `confirm()`: dialog bawaan
  // browser memblokir seluruh halaman dan tidak bisa ditata.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function share() {
    if (!item.shareCode) return;
    const url = `${window.location.origin}/q/${item.shareCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link tersalin");
    } catch {
      // Clipboard bisa ditolak (halaman tidak fokus, izin dicabut). Kodenya
      // tetap ditunjukkan supaya masih bisa disalin manual.
      setShareNote(item.shareCode);
    }
    setTimeout(() => setShareNote(null), 2500);
  }

  return (
    <div className={`flex items-center gap-4 p-4 transition-colors hover:bg-slate-50 ${pending ? "opacity-50" : ""}`}>
      <span className="shrink-0 text-gray-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/quizzes/${item.id}/edit?dari=paket`}
          className="block truncate font-medium text-gray-900 hover:underline"
        >
          {item.title}
        </Link>
        <p className="truncate text-sm text-gray-500">
          Diperbarui {relativeTime(item.updatedAt, renderedAt)}
          {item.source && ` · Dibuat ${sourceLabel[item.source]}`}
        </p>
      </div>

      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${kindColor[item.kind]}`}
      >
        {QUIZ_KIND_LABEL[item.kind]}
      </span>

      <span
        title={audienceHint[item.audience]}
        className={`hidden shrink-0 rounded-full px-3 py-1 text-xs font-medium sm:inline ${audienceColor[item.audience]}`}
      >
        {audienceLabel[item.audience]}
      </span>

      {/* Dua angka, bukan satu: "sedang mengerjakan" itu yang membuat halaman
          ini berguna saat asesmen sedang berlangsung. */}
      <div className="hidden shrink-0 items-center gap-3 text-sm sm:flex">
        <span className="flex items-center gap-1 text-gray-600" title="Sudah selesai mengerjakan">
          <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {item.done}
        </span>
        <span className="flex items-center gap-1 text-gray-600" title="Sedang mengerjakan">
          <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {item.inProgress}
        </span>
      </div>

      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${statusColor[item.status]}`}>
        {statusLabel[item.status]}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <IconButton
          href={item.shareCode ? `/q/${item.shareCode}` : undefined}
          label={item.shareCode ? "Buka halaman murid" : "Belum diterbitkan"}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </IconButton>

        <IconButton
          label={shareNote ?? (item.shareCode ? "Salin link" : "Terbitkan dulu untuk dapat link")}
          onClick={share}
          disabled={!item.shareCode}
          active={!!shareNote}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
            />
          </svg>
        </IconButton>

        <IconButton
          label="Duplikat"
          onClick={() => startTransition(() => duplicateQuiz(item.id))}
          disabled={pending}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </IconButton>

        {confirmingDelete ? (
          <button
            type="button"
            onClick={() => startTransition(() => deleteQuiz(item.id))}
            onBlur={() => setConfirmingDelete(false)}
            disabled={pending}
            autoFocus
            className="rounded-lg bg-red-600 px-2 py-1.5 text-xs font-medium whitespace-nowrap text-white transition-colors hover:bg-red-700"
          >
            Hapus?
          </button>
        ) : (
          <IconButton label="Hapus" onClick={() => setConfirmingDelete(true)} danger>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0115.916 21.75H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
              />
            </svg>
          </IconButton>
        )}
      </div>
    </div>
  );
}

/** Tombol ikon kotak; jadi `Link` kalau diberi `href`, tombol kalau diberi `onClick`. */
function IconButton({
  children,
  label,
  href,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  const className = `rounded-lg p-1.5 transition-colors ${
    danger
      ? "text-gray-400 hover:bg-red-50 hover:text-red-600"
      : active
        ? "bg-blue-50 text-blue-700"
        : "text-gray-400 hover:bg-slate-100 hover:text-gray-700"
  } ${disabled ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-gray-400" : ""}`;

  if (href && !disabled) {
    return (
      <Link href={href} target="_blank" title={label} aria-label={label} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={label}
      aria-label={label}
      className={className}
    >
      {children}
    </button>
  );
}
