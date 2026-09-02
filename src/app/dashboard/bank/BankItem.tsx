"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CurriculumTopicGroup, Question, QuestionBankItem, QuestionPatch } from "@/lib/types";
import { QUESTION_TYPE_LABEL } from "@/lib/types";
import { topicLabel } from "@/lib/curriculum";
import { bloomLabel } from "@/lib/bloom";
import { nowMs, relativeTime } from "@/lib/relative-time";
import { questionIssue } from "@/lib/question-validation";
import {
  ARTI_VERIFIKASI,
  LABEL_VERIFIKASI,
  transisiBoleh,
  type StatusVerifikasi,
} from "@/lib/verifikasi";
import type { MetadataPengukuran as Metadata } from "@/lib/metadata-pengukuran";
import QuestionEditor from "../quizzes/[id]/edit/QuestionEditor";
import QuestionPreview from "./QuestionPreview";
import MetadataPengukuran from "./MetadataPengukuran";
import {
  saveBankItem,
  deleteBankItem,
  toggleQuestionTopic,
  ubahStatusVerifikasi,
} from "./actions";

/**
 * Warna tiap tahap. Hijau hanya untuk `aktif` — satu-satunya tahap yang berarti
 * soalnya sampai ke murid; sisanya sengaja netral supaya "hampir selesai" tidak
 * terbaca seperti "sudah beres".
 */
const WARNA_STATUS: Record<StatusVerifikasi, string> = {
  draf: "bg-slate-100 text-slate-600",
  terverifikasi_matematis: "bg-indigo-50 text-indigo-700",
  direview_pedagogis: "bg-violet-50 text-violet-700",
  aktif: "bg-emerald-50 text-emerald-700",
  ditarik: "bg-rose-50 text-rose-700",
};

export interface SubjectTopics {
  subjectId: string;
  subjectName: string;
  groups: CurriculumTopicGroup[];
}

/**
 * Satu soal bank, dengan dua wajah: dibaca dan disunting.
 *
 * Bawaannya wajah baca — pertanyaan, pilihan jawaban, kuncinya, selesai. Dulu
 * tiap kartu adalah editor penuh yang selalu terbentang, jadi membuka satu
 * topik berarti menghadapi dua puluh field dikali sepuluh soal hanya untuk
 * memeriksa apakah soalnya sudah bagus. Yang paling sering dilakukan orang di
 * halaman ini adalah membaca; menyunting adalah kekecualian, dan sekarang
 * kekecualian itu yang harus diminta.
 *
 * Wajah suntingnya utuh, bukan versi ringkas: begitu terbuka, semua yang masih
 * jadi keputusan ada di sana, karena setengah editor hanya akan mengirim orang
 * mencari sisanya di tempat lain. Yang sudah diputuskan sebelum orangnya sampai
 * ke sini — topik, kalau ia masuk lewat topik — tidak ikut ditampilkan.
 *
 * Suntingannya tidak pergi ke mana-mana sampai "Simpan perubahan" ditekan.
 * Dulu tiap ketikan langsung ditulis ke database, dan akibatnya kedua tombol
 * di bawah kartu berbohong: yang bernama Simpan hanya menutup editor, dan yang
 * bernama Batal justru harus menulis lagi — memulihkan versi lama di atas
 * suntingan yang sudah terlanjur mendarat. Sekarang keduanya berarti persis
 * seperti namanya. Harganya: ketikan yang belum disimpan hilang kalau tabnya
 * ditutup, dan itu memang yang dijanjikan tombolnya.
 *
 * Tag topik pengecualian — ia menyimpan sendiri saat dicentang, karena ia soal
 * "di mana soal ini muncul", bukan isi soalnya.
 */
export default function BankItem({
  item,
  subjects,
  initialTaggedIds,
  editHref,
  selesai,
  topikDariAsal,
  judul,
  ringkas = false,
}: {
  item: QuestionBankItem;
  subjects: SubjectTopics[];
  initialTaggedIds: string[];
  /**
   * Alamat halaman satu-soal. Diisi daftar: di sana "Edit" berarti pindah ke
   * layar sendiri, bukan membentangkan editor setinggi dua puluh field di
   * tengah daftar yang sedang dibaca.
   */
  editHref?: string;
  /**
   * Alamat tujuan setelah selesai menyunting. Diisi halaman satu-soal, tempat
   * kartu ini sendirian di layar: di sana "selesai" berarti kembali ke
   * daftarnya, bukan melipat editor menjadi pratinjau yang berdiri sendiri di
   * halaman kosong.
   */
  selesai?: string;
  /**
   * Menyembunyikan daftar tag topik. Diisi halaman satu-soal yang dibuka dari
   * sebuah topik: topiknya sudah ditentukan oleh pintu yang dipakai orang
   * masuk, jadi menampilkannya lagi hanya menyodorkan keputusan yang sudah
   * diambil — sama seperti halaman soal baru, yang juga tidak menanyakannya.
   *
   * Tidak diisi kalau pintunya bukan topik ("Belum ditandai topik", atau bank
   * soal secara keseluruhan): di sana justru menandai topik yang jadi
   * pekerjaannya, dan tanpa daftar ini soalnya tidak punya jalan keluar dari
   * keadaan tanpa topik.
   */
  topikDariAsal?: boolean;
  /**
   * Kepala kartu saat disunting. Diisi halaman satu-soal dengan kelas, tema,
   * dan topik asalnya: di layar yang isinya cuma satu soal, "Soal Latihan"
   * tidak memberi tahu apa pun yang belum jelas — yang justru perlu ada di
   * depan mata adalah untuk siapa soal ini ditulis.
   */
  judul?: string;
  /**
   * Mulai terlipat: cuma pertanyaannya, tanpa pilihan jawaban, kunci, maupun
   * lencana apa pun. Sekali diketuk, kartunya terbuka utuh.
   *
   * Diisi daftar yang panjang. Satu topik pengukuran membawa lima puluh empat
   * butir, dan kartu yang membentang penuh membuat halamannya belasan layar —
   * yang paling sering dilakukan orang di sana adalah MENELUSURI ("mana soal
   * tentang kapal selam?"), dan menelusuri lima puluh empat pertanyaan jauh
   * lebih cepat daripada menelusuri lima puluh empat pertanyaan yang
   * masing-masing membawa empat pilihan jawaban dan tiga lencana.
   *
   * Tidak dipakai halaman satu-soal maupun daftar topik kurikulum: di sana
   * kartunya memang sudah sedikit, dan melipatnya cuma menambah satu ketukan
   * sebelum apa pun bisa dibaca.
   */
  ringkas?: boolean;
}) {
  const router = useRouter();
  const [tagged, setTagged] = useState<string[]>(initialTaggedIds);
  // Soal yang baru dibuat lahir kosong dan langsung dituju lewat #soal-<id>;
  // menyambutnya dengan "Pertanyaan masih kosong" dan tombol Edit menaruh satu
  // klik di antara orang dan satu-satunya hal yang bisa dia lakukan di sana.
  const [editing, setEditing] = useState(!item.prompt.trim() || Boolean(selesai));
  const [confirmHapus, setConfirmHapus] = useState(false);
  // Terbuka sejak awal kecuali kartunya memang diminta ringkas.
  const [terbuka, setTerbuka] = useState(!ringkas);
  // Status verifikasi hidup terpisah dari `isi`: ia menyimpan seketika saat
  // ditekan, bukan ikut antre sampai "Simpan perubahan". Lihat
  // `ubahStatusVerifikasi` di actions.ts.
  //
  // Bawaannya `draf` kalau kolomnya belum ada (migrasi 141 belum jalan di
  // lingkungan ini) — bukan `aktif`, karena menebak ke arah yang lebih longgar
  // berarti menampilkan soal yang belum diperiksa sebagai sudah siap.
  const [status, setStatus] = useState<StatusVerifikasi>(item.status_verifikasi ?? "draf");
  const [galatStatus, setGalatStatus] = useState<string | null>(null);
  // Metadata pengukuran, sebaliknya, MENUMPANG tombol Simpan milik editor —
  // ia bagian dari menulis butir, bukan pernyataan tentang butir. Karena itu ia
  // ikut menandai kartu "kotor" saat diubah.
  const metaAwal: Metadata = {
    topik_id: item.topik_id ?? null,
    penjelasan_per_opsi: item.penjelasan_per_opsi ?? null,
    pola_solo: item.pola_solo ?? null,
    elemen_proses: item.elemen_proses ?? null,
    tag_konteks_pisa: item.tag_konteks_pisa ?? null,
    sumber_pembuatan: item.sumber_pembuatan ?? "manual",
  };
  const [meta, setMeta] = useState<Metadata>(metaAwal);
  const metaRef = useRef(metaAwal);
  // Suntingan hidup di sini dulu, tidak di server: yang menulis ke database
  // hanya tombol "Simpan perubahan". Autosave dulu membuat kedua tombol di
  // bawah berbohong — yang bernama Simpan tidak menyimpan apa pun, dan yang
  // bernama Batal harus menulis balik versi lama untuk membatalkan sesuatu
  // yang sudah terlanjur tersimpan.
  const [isi, setIsi] = useState(item);
  // Kembaran `isi` yang selalu mutakhir seketika. `setIsi` baru terlihat di
  // render berikutnya, sementara "Simpan perubahan" menulis di tik yang sama
  // dengan ketikan terakhir yang baru saja dibilas dari editor.
  const isiRef = useRef(item);
  const [menyimpan, setMenyimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  // Ada suntingan yang belum pergi ke database. Ini yang menjawab pertanyaan
  // yang lahir begitu autosave dilepas: "yang barusan saya ketik sudah aman
  // atau belum?"
  const [kotor, setKotor] = useState(false);
  const [disimpanPada, setDisimpanPada] = useState<string | null>(
    item.updated_at ?? item.created_at ?? null,
  );
  // Detak untuk menyegarkan "3 menit lalu" tanpa menunggu render lain datang.
  const [detak, setDetak] = useState(() => nowMs());
  useEffect(() => {
    const timer = setInterval(() => setDetak(nowMs()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // Diisi QuestionEditor; menuliskan suntingan yang masih mengantre di dalamnya,
  // sekarang juga. Ketikan terakhir bisa saja baru berumur seperempat detik.
  const tulisSekarang = useRef<(() => Promise<void>) | null>(null);

  // A bank item has no quiz, order, or branching — the editor treats those as
  // optional, so a minimal Question shape is enough to drive it.
  const asQuestion: Question = {
    id: isi.id,
    quiz_id: "",
    type: isi.type,
    prompt: isi.prompt,
    options: isi.options,
    correct_answer: isi.correct_answer,
    weight: isi.weight,
    order_index: 0,
    branching: null,
    explanation: isi.explanation,
    bloom_level: isi.bloom_level,
    stimulus_images: isi.stimulus_images ?? [],
  };

  /**
   * Menampung suntingan dari editor — di ingatan halaman ini saja.
   *
   * `branching` dibuang seperti di server: soal bank tidak punya sesama soal.
   */
  function simpan({ branching: _branching, ...content }: QuestionPatch) {
    void _branching;
    isiRef.current = { ...isiRef.current, ...content };
    setIsi(isiRef.current);
    return Promise.resolve();
  }

  function mulaiMenyunting() {
    isiRef.current = isi;
    setEditing(true);
  }

  /** Satu-satunya yang menulis ke database. */
  async function simpanPerubahan() {
    setGalat(null);
    // Ketikan terakhir mungkin masih mengantre di dalam editor; tanpa ini yang
    // tersimpan versi sebelumnya.
    await tulisSekarang.current?.();
    setMenyimpan(true);
    const kini = isiRef.current;
    try {
      await saveBankItem(
        item.id,
        {
          type: kini.type,
          prompt: kini.prompt,
          weight: kini.weight,
          options: kini.options,
          correct_answer: kini.correct_answer,
          explanation: kini.explanation,
          bloom_level: kini.bloom_level ?? null,
          branching: null,
        },
        metaRef.current,
      );
    } catch (e) {
      setGalat(e instanceof Error ? e.message : "Gagal menyimpan soal.");
      setMenyimpan(false);
      return;
    }
    setMenyimpan(false);
    setKotor(false);
    setDisimpanPada(new Date().toISOString());
    tutup();
  }

  /** Tidak ada yang perlu ditulis balik: suntingannya memang belum pernah pergi. */
  function batal() {
    isiRef.current = item;
    setIsi(item);
    metaRef.current = metaAwal;
    setMeta(metaAwal);
    setKotor(false);
    tutup();
  }

  /** Metadata berubah: tampung di ingatan halaman, dan tandai kartunya kotor. */
  function ubahMeta(next: Metadata) {
    metaRef.current = next;
    setMeta(next);
    setKotor(true);
  }

  /** Menutup editor — melipatnya, atau pulang kalau kartunya sendirian. */
  function tutup() {
    if (selesai) router.push(selesai);
    else setEditing(false);
  }

  /**
   * Menghapus soal. Di halaman satu-soal, yang tersisa sesudahnya adalah
   * halaman tentang baris yang sudah tidak ada — jadi orangnya dipulangkan.
   */
  async function hapus() {
    await deleteBankItem(item.id);
    if (selesai) router.push(selesai);
  }

  function toggle(topicId: string) {
    const next = tagged.includes(topicId);
    setTagged(next ? tagged.filter((id) => id !== topicId) : [...tagged, topicId]);
    toggleQuestionTopic(item.id, topicId, !next);
  }

  /**
   * Memindahkan tahap verifikasi. Optimistis, lalu dipulihkan kalau server
   * menolak — yang paling mungkin menolak adalah trigger yang menjaga urutan
   * tahap, dan pesannya lebih berguna daripada tombol yang diam saja.
   */
  async function pindahkanStatus(ke: StatusVerifikasi) {
    const sebelum = status;
    setStatus(ke);
    setGalatStatus(null);
    try {
      await ubahStatusVerifikasi(item.id, ke);
    } catch (e) {
      setStatus(sebelum);
      setGalatStatus(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  }

  if (!editing && ringkas && !terbuka) {
    return (
      <button
        type="button"
        onClick={() => setTerbuka(true)}
        aria-expanded={false}
        className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
      >
        {/* Pertanyaannya saja. Yang disembunyikan bukan cuma jawabannya
            melainkan seluruh lencana — tipe, level, status — karena di sebuah
            daftar yang sudah dikelompokkan menurut kolam dan level, ketiganya
            mengulang apa yang sudah tertulis di kepala kelompoknya. */}
        <span className="min-w-0 flex-1 text-sm leading-relaxed text-gray-800">
          {isi.prompt.trim() || (
            <span className="text-amber-600">Pertanyaan masih kosong</span>
          )}
        </span>
        <span aria-hidden className="mt-0.5 shrink-0 text-gray-300">
          ▾
        </span>
      </button>
    );
  }

  if (!editing) {
    const issue = questionIssue(asQuestion);
    const bloom = bloomLabel(isi.bloom_level);

    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-gray-500">{QUESTION_TYPE_LABEL[isi.type]}</span>
          {bloom && <span className="text-xs text-gray-400">{bloom}</span>}
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${WARNA_STATUS[status]}`}
            title={ARTI_VERIFIKASI[status]}
          >
            {LABEL_VERIFIKASI[status]}
          </span>
          {/* Peringatan ini menanyakan BAB kurikulum, jadi ia tidak berlaku
              untuk butir yang ditandai ke peta kompetensi: butir ber-`topik_id`
              justru DILARANG punya tag bab oleh trigger migrasi tera 148, dan
              memperingatkannya berarti menuduh keadaan yang benar. Tanpa baris
              ini, kelima puluh empat butir pengukuran memasang lencana oranye
              yang tidak satu pun bisa dibereskan. */}
          {tagged.length === 0 && !item.topik_id && (
            <span className="text-xs text-amber-600">Belum ditandai topik</span>
          )}
          {issue && <span className="text-xs text-amber-600">Belum lengkap — {issue}</span>}

          <div className="ml-auto flex items-center gap-3">
            {editHref ? (
              <Link href={editHref} className="text-xs font-medium text-blue-600 hover:underline">
                Edit
              </Link>
            ) : (
              <button
                type="button"
                onClick={mulaiMenyunting}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Edit
              </button>
            )}
            {/* Konfirmasinya di tempat, bukan dialog: menghapus soal bank tidak
                bisa dibatalkan, dan window.confirm membekukan seluruh halaman
                demi satu pertanyaan sebaris. */}
            {confirmHapus ? (
              <>
                <span className="text-xs text-gray-500">Hapus soal ini?</span>
                <button
                  type="button"
                  onClick={hapus}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Ya, hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmHapus(false)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Batal
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmHapus(true)}
                className="text-xs text-gray-400 hover:text-red-600 hover:underline"
              >
                Hapus
              </button>
            )}
          </div>
        </div>

        {/* Tahap verifikasi: satu baris, di atas soalnya.
            Yang ditawarkan hanya langkah yang memang diizinkan dari tahap
            sekarang — tombol "Aktifkan" tidak muncul untuk butir yang masih
            draf, karena menawarkannya berarti menjanjikan sesuatu yang pasti
            ditolak trigger di database. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-slate-100 py-2">
          <span className="text-xs text-gray-500">{ARTI_VERIFIKASI[status]}</span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {transisiBoleh(status).map((ke) => (
              <button
                key={ke}
                type="button"
                onClick={() => pindahkanStatus(ke)}
                className={`text-xs font-medium hover:underline ${
                  ke === "ditarik" ? "text-gray-400 hover:text-red-600" : "text-blue-600"
                }`}
              >
                {ke === "ditarik" ? "Tarik" : `→ ${LABEL_VERIFIKASI[ke]}`}
              </button>
            ))}
          </div>
          {galatStatus && <p className="w-full text-xs text-red-600">{galatStatus}</p>}
        </div>

        <QuestionPreview question={asQuestion} />

        {/* Hanya untuk kartu yang memang bisa dilipat. Tanpa jalan menutup,
            membuka sepuluh kartu berarti halaman yang tidak bisa dikembalikan
            ke bentuk yang mudah ditelusuri tanpa memuat ulang. */}
        {ringkas && (
          <button
            type="button"
            onClick={() => setTerbuka(false)}
            aria-expanded
            className="mt-4 text-xs font-medium text-gray-400 hover:text-gray-700 hover:underline"
          >
            ▴ Tutup
          </button>
        )}
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <QuestionEditor
        question={asQuestion}
        label={judul ?? "Soal Latihan"}
        save={simpan}
        onDelete={hapus}
        flushRef={tulisSekarang}
        tanpaBobot
        tanpaPenandaSimpan
        onPerubahan={setKotor}
        catatan={
          kotor ? (
            <span className="text-xs text-amber-600">Belum disimpan</span>
          ) : (
            <span className="text-xs text-gray-400">
              {disimpanPada ? `Terakhir disimpan ${relativeTime(disimpanPada, detak)}` : ""}
            </span>
          )
        }
      />

      {/* Di bawah editornya, bukan di dalamnya: `QuestionEditor` dipakai bersama
          oleh editor paket, sementara kolom-kolom ini cuma ada di bank. */}
      <MetadataPengukuran
        tipe={isi.type}
        opsi={isi.options}
        bloomLevel={isi.bloom_level}
        nilai={meta}
        onChange={ubahMeta}
      />

      {/* Butir yang diukur lewat peta kompetensi tidak ditandai ke bab
          kurikulum: peta adalah satu-satunya jalur penyajiannya, dan tag bab
          justru yang akan menyeretnya kembali ke latihan bebas. Database
          menolaknya sejak migrasi tera 148 — di sini daftarnya diganti
          keterangan, supaya penolakan itu tidak ditemui sebagai galat. */}
      {!topikDariAsal && meta.topik_id && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-500">
          Diukur sebagai <span className="font-medium text-slate-700">{meta.topik_id}</span>, jadi
          soal ini disajikan lewat peta kompetensi — bukan lewat topik kurikulum. Kosongkan
          &ldquo;Diukur sebagai&rdquo; di atas kalau memang mau ditandai ke bab.
        </p>
      )}

      {!topikDariAsal && !meta.topik_id && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs text-gray-500">
            Topik{" "}
            {tagged.length === 0 ? (
              <span className="text-amber-600">— belum ditandai, tidak akan muncul di latihan</span>
            ) : (
              `(${tagged.length})`
            )}
          </summary>

          {subjects.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              Belum ada topik kurikulum. Susun dulu di Tera → Kurikulum.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-3">
              {subjects.map((subject) => (
                <div key={subject.subjectId}>
                  <p className="text-xs font-medium text-gray-500">{subject.subjectName}</p>
                  <div className="mt-1 flex flex-col gap-1">
                    {subject.groups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={tagged.includes(group.id)}
                          onChange={() => toggle(group.id)}
                        />
                        {topicLabel(group)}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </details>
      )}

      {galat && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{galat}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={simpanPerubahan}
          disabled={menyimpan}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {menyimpan ? "Menyimpan…" : "Simpan perubahan"}
        </button>
        <button
          type="button"
          onClick={batal}
          disabled={menyimpan}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
