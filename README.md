# QuizCraft

Question Builder Engine untuk tutor — buat kuis, bagikan lewat link/kode, murid mengerjakan
sebagai guest (tanpa akun), dan sebagian besar tipe soal dinilai otomatis. Lihat
`PRD_Question_Builder_Engine.md` untuk spesifikasi lengkap.

Fase 1 (MVP core) diimplementasikan: auth tutor, question/quiz builder, publish,
pengerjaan kuis oleh murid tanpa akun, auto-grading, dan rekap hasil + koreksi manual esai.
Live monitoring, manajemen kelas, dan bank soal (Fase 2/3) belum termasuk.

## Setup

1. Buat project baru di [Supabase](https://supabase.com).
2. Di SQL editor Supabase, jalankan isi `supabase/migrations/0001_init.sql`.
3. Salin `.env.example` ke `.env.local` dan isi dengan URL & anon key project kamu
   (Project Settings → API).
4. Install dependency dan jalankan dev server:

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Struktur

- `src/app/(login|signup)` — auth tutor (Supabase Auth, email/password)
- `src/app/dashboard` — daftar kuis, quiz/question builder, hasil & koreksi manual
- `src/app/q/[code]` — halaman publik murid (guest, tanpa akun) untuk mengerjakan kuis
- `src/lib/grading.ts` — logika auto-grading
- `src/proxy.ts` — proteksi route `/dashboard/*` (Next.js 16 proxy convention, dulu disebut middleware)
- `supabase/migrations/0001_init.sql` — skema tabel + RLS policies
