import type { NextConfig } from "next";

/**
 * Alamat Tera, tempat Sora dipasang di bawah `/tryout` (multi-zone): orang
 * melihat satu alamat dan satu sesi login. Pengalihan di bawah membawa tautan
 * lama (sora-bimbeltera.vercel.app/q/...) ke alamat satu-satunya.
 */
const TERA = (process.env.TERA_URL ?? "https://bimbeltera.vercel.app").replace(/\/$/, "");
const TERA_HOST = new URL(TERA).host;

const nextConfig: NextConfig = {
  basePath: "/tryout",
  env: { NEXT_PUBLIC_BASE_PATH: "/tryout" },
  experimental: {
    // Permintaan aksi server datang dengan Origin alamat Tera, sedangkan Host-nya
    // alamat Sora di balik rewrite; tanpa daftar ini Next menolaknya sebagai CSRF.
    serverActions: { allowedOrigins: [TERA_HOST, "bimbeltera.vercel.app", "app.bimbeltera.com"] },
  },
  async redirects() {
    return [
      { source: "/q/:path*", destination: `${TERA}/tryout/q/:path*`, basePath: false, permanent: false },
      { source: "/hasil", destination: `${TERA}/tryout/hasil`, basePath: false, permanent: false },
      { source: "/hasil/:path*", destination: `${TERA}/tryout/hasil/:path*`, basePath: false, permanent: false },
      { source: "/dashboard/:path*", destination: `${TERA}/tryout/dashboard/:path*`, basePath: false, permanent: false },
    ];
  },
  /**
   * Noindex untuk seluruh app. Halaman murid memang publik dalam arti siapa pun
   * yang memegang kode bisa membukanya, tapi tidak ada gunanya kode asesmen
   * muncul di hasil pencarian.
   *
   * Dikirim dari sini, bukan `netlify.toml`: `[[headers]]` Netlify hanya kena ke
   * berkas statis, sementara hampir semua halaman di sini dirender di server.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
