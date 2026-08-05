# Sora

Mesin soal untuk bimbel — buat paket soal, bagikan lewat link/kode/QR, pantau progres murid secara
real-time, dan sebagian besar tipe soal dinilai otomatis. Berbagi database dengan **Tera**
(sistem manajemen bimbel); lihat bagian "Hubungannya dengan Tera" di bawah.

Sudah diimplementasikan:

- Question/quiz builder dengan 10 tipe soal (pilihan ganda satu/banyak jawaban, benar/salah,
  isian singkat, esai, menjodohkan, mengurutkan, mengisi bagian kosong, upload gambar/file,
  grid pernyataan), pengaturan paket soal (batas waktu, acak soal/pilihan, show-score, max attempt,
  jadwal buka/tutup), publish via link/kode/QR
- Murid mengerjakan sebagai guest (atau pilih nama dari roster kelas Tera), auto-grading, koreksi
  manual untuk esai/upload
- **Tiga menu paket soal** — Asesmen, Remedial, Try Out — dibedakan `quizzes.kind` (migrasi 079).
  Satu paket bisa dipindah antar kategori dari Pengaturan di halaman editnya. Kategori TIDAK sama
  dengan siapa yang boleh mengerjakan: itu tetap ditentukan penugasan ke sesi vs share code lepas,
  jadi try out pun boleh ditugaskan ke sesi
- **Daftar paket soal**: tiap baris menampilkan kapan terakhir diperbarui, siapa pembuatnya
  (Admin/Tutor), tipe (**Privat** = terikat sesi Tera, hanya murid kelas sesi itu, nilainya masuk
  ke Tera; **Publik** = kode lepas, siapa pun yang punya link bisa mengerjakan tanpa akun), dan
  berapa murid yang sudah selesai / sedang mengerjakan. Ada pencarian judul, saringan tipe &
  sumber, dan urutan (terakhir diperbarui / terbaru dibuat / judul A–Z) — semuanya di klien karena
  daftarnya sudah dimuat utuh. Aksi per baris: buka halaman murid, salin link, duplikat (soal ikut
  disalin, percabangan dipetakan ulang ke id soal baru), hapus
- **Penugasan ke sesi**: admin menugaskan satu paket soal ke satu atau beberapa sesi Tera dari
  halaman edit paket soal. Tiap penugasan punya kode/link sendiri, memakai daftar murid kelas
  sesi itu, dan nilainya masuk ke sesi itu sebagai `assessment_results`
- **Live Monitoring**: dashboard real-time progres murid (Supabase Realtime), live feed jawaban
  per soal, feedback langsung dari tutor, highlight murid idle
- **Latihan Soal** (dulu "Bank Soal"): korpus soal bersama yang dikelompokkan per topik kurikulum
  Tera, reusable di asesmen/remedial/try out mana pun, plus export hasil ke CSV dan analitik
  akurasi per soal
- **Latihan Mandiri**: murid berlatih kapan saja per topik, feedback + pembahasan instan,
  ringkasan penguasaan per topik dengan label rubrik
- **Percabangan soal**: mode "satu soal per halaman" — soal berikutnya bisa beda tergantung
  jawaban (mcq/benar-salah)
- **Gamifikasi ringan**: leaderboard per paket soal, badge "Skor Sempurna" & "Tercepat" (dihitung saat
  render, tidak disimpan)
- **LaTeX/Math**: setiap kolom soal/jawaban punya toolbar simbol (pecahan, akar, pangkat, ×, ÷, ±,
  ≤, ≥, ≠, π, °, Σ) yang menyisipkan LaTeX di posisi kursor, plus pratinjau langsung di bawah
  kolom — tutor tidak perlu hafal sintaks. Bisa juga diketik manual: `$x^2$` (inline) atau
  `$$...$$` (satu baris sendiri). Dirender pakai KaTeX di sisi murid maupun di halaman tutor
  (hasil, koreksi, live monitoring, review draf AI)
- **Generate Soal dengan AI**: tutor paste materi teks atau upload PDF di halaman edit paket soal, AI
  bikin draf soal pilihan ganda untuk direview sebelum ditambahkan — **butuh `ANTHROPIC_API_KEY`
  milik sendiri**, lihat Setup

Sengaja tidak dikerjakan: proctoring/deteksi kecurangan via kamera (isu privasi terhadap murid
SD-SMA), kolaborasi multi-tutor, integrasi LMS pihak ketiga, marketplace bank soal antar tutor.

## Hubungannya dengan Tera

Sora **berbagi database dengan Tera** (sistem manajemen bimbel di repo `tera`) dan tidak
lagi berdiri sendiri. Konsekuensinya:

- **Skemanya ada di repo Tera**, bukan di sini: `tera/supabase/migrations/060`–`079`. Direktori
  `supabase/` milik Sora sudah dihapus supaya tidak ada dua sumber kebenaran; versi lamanya
  masih bisa dilihat di riwayat git.
- **Kelas, murid, mapel, dan kurikulum dimiliki Tera.** Sora hanya membacanya. Soal ditandai
  ke topik kurikulum Tera lewat `curriculum_topic_groups`.
- **Hanya admin** yang menyusun soal — sesuai kebijakan Tera, tutor tidak membuat soal. Tutor
  hanya bisa membaca hasil murid di kelasnya.
- **Dua sumbu yang berbeda** (migrasi 071 vs 074): `quizzes.session_id` adalah sumbu
  KEPEMILIKAN — sesi tempat paket soal disusun, yang menentukan siapa boleh menyuntingnya. Paket
  soal induk buatan admin bernilai null di sana supaya tidak bisa diubah tutor. `assessments`
  adalah sumbu PENUGASAN — di sesi mana paket itu dipakai, satu baris per sesi, masing-masing
  dengan share code dan hasilnya sendiri. Share code penugasan mengalahkan share code paket:
  `assessment_entry()` dicoba dulu di `/q/[code]`.
- **Akun dikelola di Tera.** Tidak ada pendaftaran mandiri di Sora; masuk pakai akun admin
  yang sama.
- **Kode latihan mandiri diterbitkan di Tera**, di Admin → Latihan Mandiri. Murid yang belum
  terdaftar di Tera juga bisa diberi kode dari sana.

## Setup

1. Jalankan migration Tera sampai `079` (lihat `tera/supabase/migrations/`). Nama filenya masih memakai
   nama lama `quizcraft` — file migrasi tidak diganti nama karena sudah tercatat sebagai sudah
   dijalankan di database.
2. Salin `.env.example` ke `.env.local` dan isi dengan URL & anon key **project Supabase Tera** —
   sama persis dengan yang dipakai repo `tera`.
3. **Opsional** — untuk fitur "Generate Soal dengan AI": isi `ANTHROPIC_API_KEY` di `.env.local`
   dengan API key kamu sendiri dari [console.anthropic.com](https://console.anthropic.com/settings/keys).
   Tanpa ini, fitur lain tetap jalan normal — panel AI akan menampilkan pesan error yang jelas.
4. Install dependency dan jalankan dev server:

```bash
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Struktur

- `src/app/login` — masuk sebagai admin (akun Tera, Supabase Auth)
- `src/app/dashboard` — daftar paket soal, quiz/question builder, hasil, live monitoring.
  `layout.tsx` + `DashboardSidebar.tsx` adalah kerangka sidebar/header yang meniru
  `tera/app/admin/layout.tsx` — latar `slate-100`, kartu `rounded-2xl border-slate-200`, primary
  `blue-600` — supaya pindah dari Tera ke sini tidak terasa seperti pindah produk. Halaman murid
  (`/q`, `/practice`) sengaja tidak memakai kerangka ini
- `src/app/dashboard/quizzes/[id]/edit/generate` — route handler AI generate soal (PDF via
  `pdf-parse`, panggil Anthropic Messages API langsung lewat `fetch`)
- `src/app/dashboard/quizzes/[id]/live` — dashboard real-time (Supabase Realtime channel per quiz)
- `src/app/dashboard/bank` — Latihan Soal: dikelompokkan per topik kurikulum Tera (satu soal bisa
  muncul di beberapa topik karena penandaannya many-to-many), filter topik, edit penuh
  (memakai `QuestionEditor` yang sama dengan editor paket soal), tag topik, pembahasan
- `src/app/q/[code]` — halaman publik murid (guest atau pilih dari roster kelas), autosave per
  jawaban lewat `startAttempt`/`saveAnswer`/`finalizeAttempt`, mendukung mode sequential +
  percabangan
- `src/app/practice` — latihan mandiri murid: masuk pakai kode dari admin (disimpan di cookie),
  pilih mapel → topik, kerjakan satu per satu dengan feedback + pembahasan instan, ringkasan
  per topik
- `src/lib/grading.ts` — logika auto-grading untuk semua tipe soal (dipakai paket soal & latihan)
- `src/lib/curriculum.ts` — label & pengelompokan topik kurikulum Tera
- `src/lib/mastery.ts` — konversi skor → label rubrik (murni data, tidak ada label hardcoded)
- `src/lib/QuestionInput.tsx` — render widget jawaban tiap tipe soal, dipakai halaman paket soal
  maupun latihan mandiri
- `src/lib/gamification.ts` — leaderboard & badge (dihitung, tidak disimpan di DB)
- `src/lib/latex.tsx` — komponen `MathText` (render KaTeX dari delimiter `$...$`/`$$...$$`)
- `src/proxy.ts` — proteksi route `/dashboard/*` (Next.js 16 proxy convention, dulu disebut
  middleware) — memeriksa `profiles.role = 'admin'`, otomatis melindungi route generate AI juga

Skemanya di repo Tera:

- `tera/supabase/migrations/060_curriculum_topic_groups.sql` — id stabil untuk topik kurikulum
- `tera/supabase/migrations/061_quizcraft.sql` — seluruh tabel Sora, `learners`,
  `mastery_rubrics`, RLS `is_admin()` + tutor read-only, dan fungsi `security definer`
  `practice_*`/`quiz_roster` sebagai satu-satunya jalur baca bank soal dari sisi murid
- `tera/supabase/migrations/062_seed_tka_matematika_smp.sql` — kurikulum TKA + 14 soal contoh
- `tera/supabase/migrations/079_quiz_kind.sql` — `quizzes.kind` (asesmen/remedial/tryout), penanda
  menu. **Belum dijalankan?** Semua paket tampil di menu Asesmen dan membuat Remedial/Try Out gagal
  dengan pesan yang menyebut migrasi ini — bukan diam-diam salah kategori
- `tera/supabase/migrations/078_quiz_updated_at.sql` — `quizzes.updated_at` + trigger, termasuk
  trigger di `questions` yang menaikkan stempel induknya. **Belum dijalankan?** Daftar paket soal
  tetap tampil, hanya "Diperbarui …" yang jatuh ke `created_at` — halaman sengaja memakai
  `select("*")` supaya kolom yang belum ada tidak menggagalkan query

## Catatan implementasi

- Guest mode tidak punya session resume: reload halaman murid di tengah pengerjaan akan memulai
  attempt baru. Hal yang sama berlaku di latihan mandiri — reload di tengah sesi berarti sesi itu
  ditinggalkan (jawaban yang sudah dikirim tetap tercatat, tapi ringkasannya tidak muncul).
- Kode latihan mandiri (`learners.access_code`) adalah kredensial ringan, bukan login: siapa pun
  yang memegang kode itu bisa berlatih atas nama murid tersebut. Dipilih karena catatan latihan
  bukan nilai resmi, dan supaya murid tidak perlu punya akun.
- `learners.name` disalin dari `profiles.full_name` saat kode diterbitkan; kalau nama murid
  diperbaiki di Tera setelahnya, nama di halaman latihan tetap yang lama.
- Bank soal adalah satu korpus bersama: murid mana pun yang punya kode bisa mendapat soal dari
  mapel mana pun yang ada isinya, bukan hanya mapel kelasnya. Konsekuensi dari kurikulum yang
  berporos mapel, bukan kelas.
- Font memakai system stack, bukan `next/font/google`, supaya build tidak bergantung pada akses
  ke `fonts.gstatic.com`.
- Highlight "murid kesulitan" di Live Monitoring adalah heuristik sederhana (idle > 2 menit tanpa
  aktivitas), bukan analisis pola jawaban salah.
- `max_attempts` dibatasi longgar berdasarkan `guest_name` (bukan identitas terverifikasi),
  konsekuensi dari guest mode tanpa akun.
- Percabangan soal butuh mode "satu soal per halaman" (`sequential_mode`) aktif di Pengaturan
  Paket Soal; kalau tidak aktif, semua soal tampil di satu halaman seperti biasa dan percabangan
  diabaikan. Acak urutan soal (`shuffle_questions`) otomatis dinonaktifkan saat sequential mode
  aktif karena bisa merusak alur percabangan.
- Draf soal dari AI generate tidak disimpan ke database sampai tutor klik "Tambah ke Paket Soal" —
  kalau dibatalkan, tidak ada data sisa.
