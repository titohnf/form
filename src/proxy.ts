import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * `/` ikut dilewatkan bukan untuk dijaga — `updateSession` hanya memulangkan
 * pengunjung di jalur /dashboard — melainkan supaya tokennya disegarkan sebelum
 * root memutuskan pintu mana yang benar. Tanpa itu, sesi yang tinggal
 * kedaluwarsa terbaca anonim dan admin dilempar ke formulir masuk yang tidak ia
 * butuhkan.
 *
 * `/practice` dulu ada di sini dengan alasan yang sama untuk sesi keluarga.
 * Rutenya sudah tidak ada.
 */
export const config = {
  matcher: ["/", "/dashboard/:path*"],
};
