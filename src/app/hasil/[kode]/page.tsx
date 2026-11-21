import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PitaBiru from "@/app/q/[code]/PitaBiru";
import { NOMOR_WA_ADMIN } from "@/lib/kontak";
import {
  indikatorTerlemah,
  sisipkanPembanding,
  susunPohon,
  type PetaKompetensi,
  type Simpul,
  type SkorAnalisis,
  type SoalAnalisis,
} from "@/lib/analisis-kompetensi";

export const metadata = { title: "Hasil Try Out" };
export const dynamic = "force-dynamic";

interface SoalHasil {
  id: string;
  nomor: number;
  bobot: number;
  kompetensi: PetaKompetensi | null;
  skor: number;
  skor_rata: number | null;
}
interface PaketHasil {
  quiz_id: string;
  judul: string;
  dikirim: string;
  skor: number | null;
  jumlah_peserta: number;
  soal: SoalHasil[];
}
interface HasilPeserta {
  nama: string;
  paket: PaketHasil[];
  menunggu: { judul: string }[];
}

const MIN_PEMBANDING = 3;
const f = (n: number, d = 0) => n.toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Satu baris capaian: batang peserta, garis nasional, dan pembanding peserta lain. */
function Batang({ s }: { s: Simpul }) {
  const p = s.persen ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-gray-900">{s.nama}</p>
        <p className="text-sm font-semibold text-gray-900">{f(p)}%</p>
      </div>
      <div className="relative mt-1.5 h-3 rounded-full bg-gray-100">
        <div className="h-3 rounded-full bg-[#2a6ab5]" style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
        {s.nasional !== null && (
          <span
            className="absolute -top-1 h-5 w-0.5 bg-gray-900"
            style={{ left: `${Math.min(100, Math.max(0, s.nasional))}%` }}
            title={`Nasional ${f(s.nasional)}%`}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {s.jumlahSoal} soal
        {s.nasional !== null && <> · nasional {f(s.nasional)}%</>}
        {s.pembanding !== null && <> · rata-rata peserta {f(s.pembanding)}%</>}
      </p>
    </div>
  );
}

function KartuPaket({ p, nama, kode }: { p: PaketHasil; nama: string; kode: string }) {
  const soal: SoalAnalisis[] = p.soal.map((s) => ({ id: s.id, nomor: s.nomor, bobot: s.bobot, kompetensi: s.kompetensi }));
  const skorSaya: SkorAnalisis[] = p.soal.map((s) => ({ attemptId: "saya", questionId: s.id, skor: s.skor }));
  let pohon: Simpul[] = susunPohon(soal, skorSaya, ["saya"]);

  const bobotTotal = p.soal.reduce((a, s) => a + s.bobot, 0);
  const skor = p.skor ?? p.soal.reduce((a, s) => a + s.skor, 0);
  const nilai = bobotTotal > 0 ? (skor / bobotTotal) * 100 : 0;

  let rataNilai: number | null = null;
  if (p.jumlah_peserta >= MIN_PEMBANDING && p.soal.every((s) => s.skor_rata !== null)) {
    const skorRata: SkorAnalisis[] = p.soal.map((s) => ({ attemptId: "rata", questionId: s.id, skor: s.skor_rata as number }));
    pohon = sisipkanPembanding(pohon, susunPohon(soal, skorRata, ["rata"]));
    rataNilai = bobotTotal > 0 ? (p.soal.reduce((a, s) => a + (s.skor_rata as number), 0) / bobotTotal) * 100 : null;
  }

  const terlemah = indikatorTerlemah(pohon, 3);
  const pesanWa = encodeURIComponent(
    `Halo Bimbel Tera, saya orang tua ${nama} (kode peserta ${kode}). Setelah melihat hasil ${p.judul}, saya ingin tahu info berlangganan Tera untuk latihan yang sesuai.`,
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">{p.judul}</h2>

      <div className="rounded-lg bg-white p-6 text-center shadow">
        <p className="text-sm text-gray-500">Nilai {nama}</p>
        <p className="mt-1 text-5xl font-semibold text-[#1b4f94]">{f(nilai, 1)}</p>
        <p className="mt-1 text-sm text-gray-500">
          dari 100 · skor {f(skor, skor % 1 === 0 ? 0 : 1)} dari {f(bobotTotal)}
        </p>
        {rataNilai !== null && (
          <p className="mt-3 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-900">
            Rata-rata {p.jumlah_peserta} peserta: {f(rataNilai, 1)}
          </p>
        )}
      </div>

      {pohon.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-semibold text-gray-900">Capaian per bidang</h3>
          <p className="mt-1 text-xs text-gray-500">Batang biru = capaianmu. Garis hitam = capaian nasional.</p>
          <div className="mt-4 space-y-5">
            {pohon.map((s) => (
              <Batang key={s.kunci} s={s} />
            ))}
          </div>
        </div>
      )}

      {terlemah.length > 0 && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h3 className="text-sm font-semibold text-gray-900">Yang paling perlu diperkuat</h3>
          <ol className="mt-3 space-y-3">
            {terlemah.map((t, i) => (
              <li key={t.kunci} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                  {i + 1}
                </span>
                <span className="text-gray-800">
                  {t.nama}
                  <span className="block text-xs text-gray-500">
                    capaian {f(t.persen ?? 0)}% · soal no. {t.nomorSoal.join(", ")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="rounded-lg border border-[#2a6ab5]/30 bg-gradient-to-br from-blue-50 to-white p-6 shadow">
        <h3 className="text-base font-semibold text-[#1b4f94]">Mau lebih siap menghadapi TKA?</h3>
        <p className="mt-2 text-sm text-gray-700">
          Hasil di atas menunjukkan bagian mana yang masih bisa dinaikkan. Dengan berlangganan Tera, {nama} bisa berlatih
          soal dan membuka materi belajar sesuai bidang yang masih lemah, lengkap dengan laporan kemajuannya. Semua
          riwayat try out ini ikut tersimpan di akun.
        </p>
        <a
          href={`https://wa.me/${NOMOR_WA_ADMIN}?text=${pesanWa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-block rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
        >
          Tanya info berlangganan lewat WhatsApp
        </a>
      </div>
    </section>
  );
}

export default async function HasilKodePage({ params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("hasil_peserta_tryout", { p_kode: decodeURIComponent(kode) });
  const hasil = (data as HasilPeserta | null) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-[#eef3f8]">
      <PitaBiru subjudul="HASIL TRY OUT" kanan={hasil ? <span className="text-sm font-medium">{hasil.nama}</span> : undefined} />
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 p-4 py-8">
        {!hasil ? (
          <div className="rounded-lg bg-white p-6 text-center shadow">
            <p className="font-medium text-gray-900">Kode tidak dikenal.</p>
            <p className="mt-1 text-sm text-gray-500">Periksa lagi kodenya, atau tanya tutor.</p>
            <Link href="/hasil" className="mt-4 inline-block text-sm font-medium text-[#1b4f94] underline">
              Coba lagi
            </Link>
          </div>
        ) : hasil.paket.length === 0 ? (
          <div className="rounded-lg bg-white p-6 text-center shadow">
            <p className="font-medium text-gray-900">Halo, {hasil.nama}!</p>
            <p className="mt-2 text-sm text-gray-600">
              {hasil.menunggu.length > 0
                ? "Jawabanmu sudah kami terima. Hasil akan dibuka setelah seluruh sesi try out selesai. Simpan kode pesertamu dan buka halaman ini lagi nanti."
                : "Belum ada try out yang selesai dikerjakan dengan kode ini."}
            </p>
          </div>
        ) : (
          hasil.paket.map((p) => <KartuPaket key={p.quiz_id} p={p} nama={hasil.nama} kode={decodeURIComponent(kode).toUpperCase()} />)
        )}
      </main>
      <footer className="pb-4 text-center">
        <span className="rounded-full bg-white px-4 py-1.5 text-xs text-gray-600 shadow">© Bimbel Tera</span>
      </footer>
    </div>
  );
}
