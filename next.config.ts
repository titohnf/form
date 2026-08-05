import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
