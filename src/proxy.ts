import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * `/practice` dan `/` ikut dilewatkan bukan untuk dijaga — `updateSession` hanya
 * memulangkan pengunjung di jalur /dashboard — melainkan supaya token sesi
 * keluarga ikut disegarkan di sana. Tanpa ini sesi keluarga mati diam-diam saat
 * token kedaluwarsa, dan yang muncul justru formulir kode di `/practice` atau
 * etalase di `/`: seolah akunnya tidak pernah sah. Pemegang kode tidak punya
 * sesi Supabase sama sekali, jadi baginya jalur ini tidak berubah apa pun.
 */
export const config = {
  matcher: ["/", "/dashboard/:path*", "/practice/:path*"],
};
