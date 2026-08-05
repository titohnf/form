import { createClient } from "@/lib/supabase/server";
import DashboardSidebar from "./DashboardSidebar";
import { logout } from "./actions";

/**
 * Kerangka dashboard: sidebar + header, meniru `app/admin/layout.tsx` di Tera.
 *
 * Peran dibaca sekali di sini dan hanya untuk memilih isi menu — penjaga akses
 * yang sebenarnya tetap `src/proxy.ts`, jadi tidak ada keputusan keamanan yang
 * bergantung pada layout.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user?.id ?? "")
    .single();

  const isTutor = profile?.role === "tutor";
  const name = profile?.full_name || user?.email || "Pengguna";

  return (
    <div className="flex h-screen bg-slate-100">
      <DashboardSidebar isTutor={isTutor} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-gray-100 bg-white px-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {name.charAt(0).toUpperCase()}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-medium text-gray-800">{name}</p>
              {user?.email && name !== user.email && (
                <p className="text-xs text-gray-400">{user.email}</p>
              )}
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-slate-50"
            >
              Keluar
            </button>
          </form>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
