"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Sidebar dashboard, mengikuti bahasa visual `AdminSidebar` di Tera supaya
 * pindah antar dua aplikasi tidak terasa seperti pindah produk: lebar 60,
 * permukaan putih di atas latar slate, item aktif biru muda.
 *
 * Ikonnya SVG inline, bukan paket ikon — Sora tidak memakai `lucide-react`
 * seperti Tera, dan menariknya hanya demi dua ikon tidak sepadan.
 */
interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Kategori paket soal yang diwakili item ini, dicocokkan dengan `?dari=` di editor. */
  kind?: "asesmen" | "remedial" | "tryout";
}

export default function DashboardSidebar({ isTutor }: { isTutor: boolean }) {
  const pathname = usePathname();
  // Editor semua kategori berbagi satu rute (/dashboard/quizzes/[id]/edit), jadi
  // rutenya sendiri tidak bisa memberi tahu menu mana yang harus menyala.
  // Daftar paket menyisipkan asalnya sebagai `?dari=`; pola yang sama dipakai
  // AdminSidebar di Tera untuk membedakan halaman yang berbagi rute.
  const from = useSearchParams().get("dari");

  const nav: NavItem[] = [
    {
      href: "/dashboard",
      label: "Asesmen",
      kind: "asesmen",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
    },
    {
      href: "/dashboard/remedial",
      label: "Remedial",
      kind: "remedial",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M16.023 9.348h4.992V4.356m-.001 9.667a8.25 8.25 0 01-15.357 2.062m-.243-6.096a8.25 8.25 0 0115.357-2.062M2.985 19.644V14.65h4.992"
          />
        </svg>
      ),
    },
    {
      href: "/dashboard/tryout",
      label: "Try Out",
      kind: "tryout",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 6v6l3.75 1.875M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      ),
    },
    // Bank soal admin-only di RLS; menampilkannya ke tutor hanya akan
    // mengantar mereka ke halaman kosong.
    ...(isTutor
      ? []
      : [
          {
            href: "/dashboard/bank",
            label: "Latihan Soal",
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            ),
          },
        ]),
  ];

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            S
          </span>
          <span className="text-lg font-bold text-gray-900">Sora</span>
        </div>
        <p className="mt-0.5 text-xs text-gray-400">{isTutor ? "Panel Tutor" : "Panel Admin"}</p>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {nav.map(({ href, label, icon, kind }) => {
          // Di dalam editor, yang menentukan adalah asalnya. Tanpa `?dari=`
          // (mis. tautan langsung) sengaja tidak ada yang menyala — lebih baik
          // daripada menyalakan menu yang keliru.
          const inEditor = pathname.startsWith("/dashboard/quizzes");
          const isActive = inEditor
            ? !!kind && kind === from
            : href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-blue-50/50"
              }`}
            >
              {icon}
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <p className="px-3 text-[10px] leading-relaxed text-gray-400">
          Kelas, murid, dan jadwal dikelola di Tera. Sora hanya membacanya.
        </p>
      </div>
    </aside>
  );
}
