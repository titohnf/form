import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Jalur yang tetap tertutup untuk tutor. Bank soal adalah korpus bersama yang
 * dipakai lintas kelas dan jadi sumber latihan mandiri — penyusunannya tetap di
 * tangan admin. Yang dibuka untuk tutor adalah soal milik paket soal sesinya sendiri
 * (lihat policy di migrasi 071), bukan korpus ini.
 */
const ADMIN_ONLY_PATHS = ["/dashboard/bank"];

/**
 * Kode alasan kalau akses ditolak, atau null kalau boleh lewat.
 *
 * RLS sudah menolak tulisan yang tidak berhak; gerbang ini ada supaya yang
 * tidak berhak tidak sampai ke layar berisi tabel kosong dan kegagalan tanpa
 * penjelasan. Keduanya harus sejalan — kalau salah satu diubah, yang lain ikut.
 */
export function dashboardDenial(role: string | undefined, pathname: string): string | null {
  if (role === "admin") return null;
  if (role === "tutor") {
    return ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p)) ? "bank-admin-only" : null;
  }
  return "staff-only";
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const denied = dashboardDenial(profile?.role, request.nextUrl.pathname);
    if (denied) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", denied);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
