# QuizCraft

Question Builder Engine untuk tutor — buat kuis, bagikan lewat link/kode/QR, pantau progres murid
secara real-time, dan sebagian besar tipe soal dinilai otomatis. Lihat
`PRD_Question_Builder_Engine.md` untuk spesifikasi lengkap.

Sudah diimplementasikan (Fase 1 MVP + Fase 2 + Fase 3):

- Auth tutor, question/quiz builder dengan 9 tipe soal (pilihan ganda satu/banyak jawaban,
  benar/salah, isian singkat, esai, menjodohkan, mengurutkan, mengisi bagian kosong, upload
  gambar/file), pengaturan kuis (batas waktu, acak soal/pilihan, show-score, max attempt, jadwal
  buka/tutup), publish via link/kode/QR
- Murid mengerjakan sebagai guest (atau pilih nama dari roster kelas), auto-grading, koreksi
  manual untuk esai/upload
- **Live Monitoring**: dashboard real-time progres murid (Supabase Realtime), live feed jawaban
  per soal, feedback langsung dari tutor, highlight murid idle
- **Kelas & Bank Soal**: manajemen kelas + roster murid + riwayat skor, bank soal reusable antar
  kuis, export hasil ke CSV, analitik akurasi per soal

Belum termasuk (Fase 4 / nice-to-have di PRD): logic percabangan soal, gamifikasi, AI generate
soal dari PDF, LaTeX/MathJax, kolaborasi multi-tutor, marketplace bank soal, integrasi LMS,
proctoring.

## Setup

1. Buat project baru di [Supabase](https://supabase.com).
2. Di SQL editor Supabase, jalankan **secara berurutan**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_phase2_3.sql`
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
- `src/app/dashboard` — daftar kuis, quiz/question builder, hasil, live monitoring, kelas
- `src/app/dashboard/quizzes/[id]/live` — dashboard real-time (Supabase Realtime channel per quiz)
- `src/app/dashboard/classes` — kelas & roster murid
- `src/app/q/[code]` — halaman publik murid (guest atau pilih dari roster kelas), autosave per
  jawaban lewat `startAttempt`/`saveAnswer`/`finalizeAttempt`
- `src/lib/grading.ts` — logika auto-grading untuk semua tipe soal
- `src/proxy.ts` — proteksi route `/dashboard/*` (Next.js 16 proxy convention, dulu disebut middleware)
- `supabase/migrations/0001_init.sql` — skema inti (quizzes/questions/attempts/answers) + RLS
- `supabase/migrations/0002_phase2_3.sql` — quiz settings, tipe soal tambahan, live monitoring
  (kolom progres + Realtime publication), kelas, bank soal, storage bucket `quiz-uploads`

## Catatan implementasi

- Guest mode tidak punya session resume: reload halaman murid di tengah pengerjaan akan memulai
  attempt baru.
- Highlight "murid kesulitan" di Live Monitoring adalah heuristik sederhana (idle > 2 menit tanpa
  aktivitas), bukan analisis pola jawaban salah.
- `max_attempts` dibatasi longgar berdasarkan `guest_name` (bukan identitas terverifikasi),
  konsekuensi dari guest mode tanpa akun.
