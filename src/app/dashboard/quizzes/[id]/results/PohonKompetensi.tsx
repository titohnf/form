import type { Simpul } from "@/lib/analisis-kompetensi"

/**
 * Pohon kompetensi hasil try out: elemen → sub-elemen → kompetensi → indikator,
 * seperti halaman daya serap Pusmendik. Setiap baris: namanya, bilah capaian,
 * tanda capaian NASIONAL pada bilah yang sama, dan selisihnya.
 *
 * Bilah dan tanda berbagi satu sumbu 0–100, jadi jarak antara ujung bilah dan
 * tanda itulah selisihnya — terbaca tanpa menghitung. Warna selisih tidak
 * pernah satu-satunya pembawa arti: angkanya selalu bertanda + atau −.
 *
 * Tanpa JavaScript klien: lipatannya `<details>`, jadi sah dipakai di halaman
 * server mana pun (admin, keluarga) dan tetap bisa dibaca di ponsel.
 *
 * Berpasangan dengan `components/laporan/PohonKompetensi.tsx` di repo Tera.
 */

const fmt = (n: number) => n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const TINGKAT_JUDUL: Record<Simpul['tingkat'], string> = {
  elemen: 'Elemen',
  subelemen: 'Sub-elemen',
  kompetensi: 'Kompetensi',
  indikator: 'Indikator',
}

function Baris({ s, labelPembanding }: { s: Simpul; labelPembanding?: string }) {
  const selisih = s.persen !== null && s.nasional !== null ? s.persen - s.nasional : null
  const indent = { elemen: '', subelemen: 'pl-3', kompetensi: 'pl-6', indikator: 'pl-9' }[s.tingkat]
  return (
    <div className={`${indent} py-2`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${s.tingkat === 'elemen' ? 'text-base font-semibold text-gray-900' : s.tingkat === 'indikator' ? 'text-sm text-gray-700' : 'text-sm font-medium text-gray-800'}`}>
            {s.nama}
          </p>
          <p className="text-xs text-gray-400">
            {TINGKAT_JUDUL[s.tingkat]}
            {s.tingkat === 'indikator' && s.nomorSoal.length > 0 && ` · soal no. ${s.nomorSoal.join(', ')}`}
            {s.tingkat !== 'indikator' && ` · ${s.jumlahSoal} soal`}
          </p>
        </div>
        <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900">
          {s.persen === null ? '—' : `${fmt(s.persen)}%`}
        </p>
      </div>

      {/* Bilah capaian + tanda nasional pada sumbu yang sama. */}
      <div className="relative mt-1.5 h-2 rounded-full bg-gray-100" role="img" aria-label={`Capaian ${s.persen === null ? 'belum ada' : `${fmt(s.persen)} persen`}${s.nasional !== null ? `, nasional ${fmt(s.nasional)} persen` : ''}`}>
        {s.persen !== null && <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(0, Math.min(100, s.persen))}%` }} />}
        {s.nasional !== null && (
          <span
            className="absolute -top-1 h-4 w-0.5 rounded bg-gray-700"
            style={{ left: `calc(${Math.max(0, Math.min(100, s.nasional))}% - 1px)` }}
            title={`Nasional ${fmt(s.nasional)}%`}
          />
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-500">
        {s.nasional !== null && <span>Nasional {fmt(s.nasional)}%</span>}
        {selisih !== null && (
          <span className={`font-medium ${selisih >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {selisih >= 0 ? '+' : '−'}
            {fmt(Math.abs(selisih))} dari nasional
          </span>
        )}
        {labelPembanding && s.pembanding !== null && <span>{labelPembanding} {fmt(s.pembanding)}%</span>}
      </div>
    </div>
  )
}

function Cabang({ s, labelPembanding, buka }: { s: Simpul; labelPembanding?: string; buka: boolean }) {
  if (s.anak.length === 0) return <Baris s={s} labelPembanding={labelPembanding} />
  return (
    <details open={buka} className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start gap-1">
          <span className="mt-2.5 inline-block w-4 shrink-0 text-base leading-none text-gray-500 transition-transform group-open:rotate-90" aria-hidden="true">
            ▸
          </span>
          <div className="min-w-0 flex-1">
            <Baris s={s} labelPembanding={labelPembanding} />
          </div>
        </div>
      </summary>
      <div className="ml-1 border-l border-gray-100">
        {s.anak.map((a) => (
          <Cabang key={a.kunci} s={a} labelPembanding={labelPembanding} buka={false} />
        ))}
      </div>
    </details>
  )
}

export default function PohonKompetensi({
  pohon,
  labelPembanding,
}: {
  pohon: Simpul[]
  /** Nama pembanding tambahan yang disisipkan di `Simpul.pembanding`, mis. "Rata-rata kelas". */
  labelPembanding?: string
}) {
  if (pohon.length === 0) {
    return <p className="text-sm text-gray-500">Belum ada soal yang dipetakan ke kompetensi.</p>
  }
  return (
    <div className="divide-y divide-gray-100">
      {pohon.map((e) => (
        <Cabang key={e.kunci} s={e} labelPembanding={labelPembanding} buka />
      ))}
    </div>
  )
}
