/**
 * Kerangka isi halaman selagi server merender.
 *
 * Kuncinya bukan animasinya, tapi keberadaan `loading.tsx` itu sendiri: dengan
 * batas Suspense, Next berpindah halaman seketika — sidebar dan judul menu
 * langsung berganti — lalu mengisi kontennya begitu server selesai. Tanpa itu,
 * klik menu terasa menggantung sampai seluruh halaman jadi.
 *
 * Bentuknya sengaja meniru tata letak halaman aslinya (tinggi baris, kartu
 * bulat 2xl, toolbar) supaya tidak ada lompatan saat isi sungguhan datang.
 * `animate-pulse` mengikuti panel admin Tera, bukan kilau bergerak, supaya dua
 * aplikasi ini terasa satu keluarga.
 */
export function QuizListSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
        </div>
        <div className="h-10 w-36 shrink-0 rounded-lg bg-gray-200" />
      </div>

      <div className="h-16 rounded-2xl border border-slate-200 bg-white" />

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-5 w-5 shrink-0 rounded bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200" />
              <div className="h-3 w-1/4 rounded bg-gray-100" />
            </div>
            <div className="h-6 w-16 shrink-0 rounded-full bg-gray-100" />
            <div className="h-6 w-16 shrink-0 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TopicListSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-6 w-40 rounded bg-gray-200" />
        <div className="h-10 w-28 rounded-lg bg-gray-200" />
      </div>
      <div className="h-4 w-2/3 rounded bg-gray-100" />
      <div className="h-16 rounded-2xl border border-slate-200 bg-white" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-4 w-40 rounded bg-gray-100" />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="h-4 w-32 rounded bg-gray-100" />
        <div className="h-11 rounded-lg bg-gray-200" />
        <div className="h-4 w-24 rounded bg-gray-100" />
        <div className="h-16 rounded-lg bg-gray-100" />
        <div className="h-10 w-44 rounded-lg bg-gray-200" />
      </div>
      <div className="h-32 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-14 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-14 rounded-2xl border border-slate-200 bg-white" />
      <div className="h-96 rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
