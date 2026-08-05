"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Login murid, ditempel langsung di halaman asesmennya.
 *
 * Bukan halaman tersendiri: murid menerima satu tautan dari tutornya, dan
 * memantulkannya ke /login lalu kembali hanya menambah langkah yang bisa
 * tersesat. Setelah berhasil, halaman ini me-refresh dirinya dan server
 * component-nya mengambil alih.
 */
export default function StudentLogin({ title }: { title: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      // Pesan Supabase berbahasa Inggris dan menyebut "credentials"; murid SD
      // tidak akan menangkapnya.
      setError(
        error.message.toLowerCase().includes("invalid")
          ? "Email atau password salah. Coba cek lagi bersama tutormu."
          : error.message,
      );
      setBusy(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="mt-6 rounded border border-gray-200 p-4">
      <h2 className="text-sm font-medium">Masuk dulu untuk mengerjakan</h2>
      <p className="mt-1 text-sm text-gray-500">
        {title} hanya bisa dikerjakan oleh murid yang terdaftar di sesi ini. Kalau lupa email atau
        passwordnya, tanya tutormu.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300"
        >
          {busy ? "Masuk…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
