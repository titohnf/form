/**
 * Gambar stimulus sebuah soal, ditampilkan di atas prompt-nya.
 *
 * Dipakai bersama oleh halaman paket soal, latihan mandiri, dan pratinjau di bank
 * soal, supaya satu soal tampil sama di mana pun murid menemuinya — alasan yang
 * sama dengan QuestionInput.
 *
 * Sengaja memakai <img> biasa, bukan next/image: berkasnya di Supabase Storage
 * dengan dimensi yang tidak diketahui saat build, dan optimasi next/image butuh
 * host itu didaftarkan lebih dulu. Gambar TKA juga sudah berupa PNG siap pakai.
 */
export default function Stimulus({ images }: { images: string[] }) {
  if (images.length === 0) return null;

  return (
    <div className="mb-3 flex flex-col gap-2">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={images.length > 1 ? `Gambar soal ${i + 1}` : "Gambar soal"}
          className="max-w-full rounded border border-gray-200"
        />
      ))}
    </div>
  );
}
