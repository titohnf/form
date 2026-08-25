import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { berandaUntuk } from "@/lib/beranda";

/**
 * Root Sora tidak punya isi sendiri; ia cuma menunjuk pintu yang benar.
 *
 * Dulu di sini ada etalase — judul, satu paragraf penjelasan, dua tombol. Itu
 * halaman untuk orang yang belum mengenal Sora, dan orang seperti itu tidak
 * pernah datang: yang mengetik alamat ini adalah admin yang mau masuk, dan yang
 * mengetuk kartu SORA di beranda Tera adalah keluarga yang sudah masuk. Bagi
 * keduanya, etalase itu satu ketukan yang menanyakan hal yang jawabannya sudah
 * diketahui.
 *
 * Murid pemegang kode tidak punya sesi dan karenanya ikut mendarat di /login —
 * jalurnya diteruskan oleh satu tautan di sana, sampai `/practice` pensiun dan
 * latihan sepenuhnya pindah ke Tera.
 */
export default async function Home() {
  const { role } = await getCurrentUser();
  redirect(berandaUntuk(role));
}
