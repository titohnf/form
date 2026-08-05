"use client";

import { useFormStatus } from "react-dom";

/**
 * Tombol submit yang tahu formnya sedang diproses.
 *
 * Ada karena server action tidak memberi umpan balik apa pun secara bawaan:
 * tombol biasa tetap terlihat utuh selama aksinya berjalan, jadi pengguna
 * mengira kliknya tidak masuk lalu mengklik lagi. Di produksi jeda itu nyata —
 * cold start fungsi Netlify plus perjalanan ke Supabase — dan paling terasa di
 * halaman login, di mana layar tidak berubah sedikit pun sampai dashboard-nya
 * jadi.
 *
 * `useFormStatus` hanya membaca form terdekat di atasnya, jadi komponen ini
 * wajib dipakai DI DALAM `<form>`, bukan sebagai pembungkusnya.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className,
  disabled,
  title,
}: {
  children: React.ReactNode;
  /** Teks selama diproses. Menjelaskan apa yang ditunggu, bukan sekadar "Loading". */
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      // Dinonaktifkan selama diproses: submit kedua akan membuat paket soal
      // dobel atau mengirim login dua kali.
      disabled={pending || disabled}
      title={title}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
