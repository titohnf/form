# QuizCraft

Question Builder Engine untuk tutor — buat kuis, bagikan lewat link/kode/QR, pantau progres murid
secara real-time, dan sebagian besar tipe soal dinilai otomatis. Lihat
`PRD_Question_Builder_Engine.md` untuk spesifikasi lengkap.

Sudah diimplementasikan (Fase 1 MVP + Fase 2 + Fase 3 + sebagian Fase 4):

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
- **Percabangan soal**: mode "satu soal per halaman" — soal berikutnya bisa beda tergantung
  jawaban (mcq/benar-salah)
- **Gamifikasi ringan**: leaderboard per kuis, badge "Skor Sempurna" & "Tercepat" (dihitung saat
  render, tidak disimpan)
- **LaTeX/Math**: setiap kolom soal/jawaban punya toolbar simbol (pecahan, akar, pangkat, ×, ÷, ±,
  ≤, ≥, ≠, π, °, Σ) yang menyisipkan LaTeX di posisi kursor, plus pratinjau langsung di bawah
  kolom — tutor tidak perlu hafal sintaks. Bisa juga diketik manual: `$x^2$` (inline) atau
  `$$...$$` (satu baris sendiri). Dirender pakai KaTeX di sisi murid maupun di halaman tutor
  (hasil, koreksi, live monitoring, review draf AI)
- **Generate Soal dengan AI**: tutor paste materi teks atau upload PDF di halaman edit kuis, AI
  bikin draf soal pilihan ganda untuk direview sebelum ditambahkan — **butuh `ANTHROPIC_API_KEY`
  milik sendiri**, lihat Setup

Sengaja tidak dikerjakan: proctoring/deteksi kecurangan via kamera (isu privasi terhadap murid
SD-SMA), kolaborasi multi-tutor, integrasi LMS pihak ketiga, marketplace bank soal antar tutor.

## Setup

1. Buat project baru di [Supabase](https://supabase.com).
2. Di SQL editor Supabase, jalankan **secara berurutan**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_phase2_3.sql`
   - `supabase/migrations/0003_phase4.sql`
3. Salin `.env.example` ke `.env.local` dan isi dengan URL & anon key project kamu
   (Project Settings → API).
4. **Opsional** — untuk fitur "Generate Soal dengan AI": isi `ANTHROPIC_API_KEY` di `.env.local`
   dengan API key kamu sendiri dari [console.anthropic.com](https://console.anthropic.com/settings/keys).
   Tanpa ini, fitur lain tetap jalan normal — panel AI akan menampilkan pesan error yang jelas.
5. Install dependency dan jalankan dev server:

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Struktur

- `src/app/(login|signup)` — auth tutor (Supabase Auth, email/password)
- `src/app/dashboard` — daftar kuis, quiz/question builder, hasil, live monitoring, kelas
- `src/app/dashboard/quizzes/[id]/edit/generate` — route handler AI generate soal (PDF via
  `pdf-parse`, panggil Anthropic Messages API langsung lewat `fetch`)
- `src/app/dashboard/quizzes/[id]/live` — dashboard real-time (Supabase Realtime channel per quiz)
- `src/app/dashboard/classes` — kelas & roster murid
- `src/app/q/[code]` — halaman publik murid (guest atau pilih dari roster kelas), autosave per
  jawaban lewat `startAttempt`/`saveAnswer`/`finalizeAttempt`, mendukung mode sequential +
  percabangan
- `src/lib/grading.ts` — logika auto-grading untuk semua tipe soal
- `src/lib/gamification.ts` — leaderboard & badge (dihitung, tidak disimpan di DB)
- `src/lib/latex.tsx` — komponen `MathText` (render KaTeX dari delimiter `$...$`/`$$...$$`)
- `src/proxy.ts` — proteksi route `/dashboard/*` (Next.js 16 proxy convention, dulu disebut
  middleware) — otomatis melindungi route generate AI juga
- `supabase/migrations/0001_init.sql` — skema inti (quizzes/questions/attempts/answers) + RLS
- `supabase/migrations/0002_phase2_3.sql` — quiz settings, tipe soal tambahan, live monitoring
  (kolom progres + Realtime publication), kelas, bank soal, storage bucket `quiz-uploads`
- `supabase/migrations/0003_phase4.sql` — kolom `questions.branching` untuk percabangan soal

## Catatan implementasi

- Guest mode tidak punya session resume: reload halaman murid di tengah pengerjaan akan memulai
  attempt baru.
- Highlight "murid kesulitan" di Live Monitoring adalah heuristik sederhana (idle > 2 menit tanpa
  aktivitas), bukan analisis pola jawaban salah.
- `max_attempts` dibatasi longgar berdasarkan `guest_name` (bukan identitas terverifikasi),
  konsekuensi dari guest mode tanpa akun.
- Percabangan soal butuh mode "satu soal per halaman" (`sequential_mode`) aktif di Pengaturan
  Kuis; kalau tidak aktif, semua soal tampil di satu halaman seperti biasa dan percabangan
  diabaikan. Acak urutan soal (`shuffle_questions`) otomatis dinonaktifkan saat sequential mode
  aktif karena bisa merusak alur percabangan.
- Draf soal dari AI generate tidak disimpan ke database sampai tutor klik "Tambah ke Kuis" —
  kalau dibatalkan, tidak ada data sisa.
