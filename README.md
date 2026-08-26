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
- **Tiga menu, disusun menurut satuan bukan jenis** — **Bank Soal** (`/dashboard/bank`, admin saja)
  butiran soal per topik; **Asesmen** (`/dashboard/sesi`) daftar sesi Tera beserta keadaan soalnya,
  karena asesmen selalu lahir dari sesi; **Paket Soal** (`/dashboard/paket`) gudang semua paket.
  Remedial dan Try Out bukan menu — keduanya jenis paket (`quizzes.kind`, migrasi 079), dipakai
  sebagai label dan saringan di dalam Paket Soal, dan satu paket bisa dipindah antar jenis dari
  Pengaturan di halaman editnya. Jenis TIDAK sama dengan siapa yang boleh mengerjakan: itu tetap
  ditentukan penugasan ke sesi vs share code lepas, jadi try out pun boleh ditugaskan ke sesi
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
- **Menyunting soal bank tidak autosave**: suntingan hidup di halaman sampai tombol **Simpan
  perubahan** ditekan, jadi Simpan benar-benar menyimpan dan **Batal** benar-benar membatalkan
  (tidak ada lagi tulis-balik). Kepala kartu menyebut **"Terakhir disimpan …"**, dan berubah jadi
  **"Belum disimpan"** begitu ada ketikan yang belum mendarat. Kolom `question_bank_items.updated_at`
  datang dari migrasi **116** di repo Tera (diisi trigger); sebelum migrasi itu jalan, labelnya
  jatuh ke `created_at`. Editor paket soal **tetap autosave** — di sana satu halaman memuat banyak
  soal dan tidak ada tombol simpan per soal. Tombol **Hapus** pindah ke menu ⋯ di kepala kartu
- **Bank Soal**: korpus soal bersama yang ditandai ke topik kurikulum Tera, reusable di
  asesmen/remedial/try out mana pun. Halaman depannya **daftar TOPIK, bukan daftar soal** — satu
  baris satu topik, dengan kolom **Soal / Pembahasan** (`10/1` = sepuluh soal, satu di antaranya
  sudah punya pembahasan). Barisnya topik supaya topik yang belum punya soal ikut kelihatan;
  sebelumnya topik kosong tidak dirender sama sekali, padahal justru itu yang perlu diisi. Isinya
  dimuat di `[groupId]`, penyuntingan satu soal punya halamannya sendiri, ada impor CSV sekaligus,
  dan **"Belum ditandai topik"** menampung soal tanpa tag — soal seperti itu tidak akan pernah
  sampai ke murid. Kotak pencariannya mencari **tema**; mapel, kelas, dan keterisian punya
  saringannya sendiri
- **Murid berlatih di Tera, bukan di sini.** Latihan mandiri per topik beserta pembahasan instan
  dan ringkasan penguasaannya pindah ke `/belajar` di aplikasi Tera; `/practice` di Sora
  dipensiunkan. Sora tinggal jadi alat penyusun soal, dan satu-satunya halaman murid yang
  tersisa di sini adalah `/q/[code]`
- **Percabangan soal**: mode "satu soal per halaman" — soal berikutnya bisa beda tergantung
  jawaban (mcq/benar-salah)
- **Gamifikasi ringan**: leaderboard per paket soal, badge "Skor Sempurna" & "Tercepat" (dihitung saat
  render, tidak disimpan)
- **LaTeX/Math**: setiap kolom soal/jawaban punya toolbar simbol (pecahan, akar, pangkat, ×, ÷, ±,
  ≤, ≥, ≠, π, °, Σ) yang menyisipkan LaTeX di posisi kursor, plus pratinjau langsung di bawah
  kolom — tutor tidak perlu hafal sintaks. Bisa juga diketik manual: `$x^2$` (inline) atau
  `$$...$$` (satu baris sendiri). Dirender pakai KaTeX di sisi murid maupun di halaman tutor
  (hasil, koreksi, live monitoring, review draf AI)
- **Isi soal: gambar & tabel di posisi mana pun** — kolom Pertanyaan bukan kotak teks, melainkan
  tumpukan blok yang tampil sebagaimana nanti dilihat murid: gambar sebagai gambar, tabel sebagai
  tabel, rumus sebagai rumus (dirender `IsiSoal`, komponen yang sama dengan halaman murid — jadi
  kolomnya sendiri sudah menjadi pratinjaunya, tidak ada lagi kotak pratinjau terpisah). Satu
  tombol **⋯ Sisipkan** di bawahnya membuka daftar jenis isi — Rumus, Tabel, Gambar — dan tiap
  pilihan membuka dialognya sendiri (papan simbol + pratinjau + pilihan sebaris/di baris sendiri
  untuk rumus, kisi baris × kolom untuk tabel, unggah/URL untuk gambar). Hasilnya mendarat di posisi kursor; kalau kursornya
  di tengah paragraf, paragrafnya dibelah. Tiap blok punya ↑ ↓ Kiri Tengah Sunting Hapus saat
  kursor lewat — perataan disimpan sebagai baris `[rata: tengah]` tepat di atas bloknya, dan hanya
  ditulis kalau beda dari bawaannya (rumus blok memang sudah di tengah, gambar & tabel di kiri),
  jadi soal lama tidak berubah sedikit pun.
  Satu tombol, bukan sederet, supaya jenis isi berikutnya cukup menambah baris di menu.
  Paragraf yang memuat rumus tampil sudah dirender selama tidak sedang diketik, dan kembali jadi
  teks mentah begitu diklik — `$\frac{1}{2}$` hanya bisa dibetulkan kalau sumbernya kelihatan.
  **Pembahasan dan tiap pilihan jawaban memakai editor blok yang sama** — pilihan jawaban TKA kerap
  berupa gambar atau potongan tabel, dan pembahasan yang bagus kerap butuh tabel langkah. Di
  pilihan jawaban tombol ⋯ baru muncul saat kolomnya disentuh, supaya empat tombol tidak menganggur
  di bawah empat pilihan. Kolom kunci/daftar (isian singkat, menjodohkan, mengurutkan, pernyataan)
  tetap `MathField` biasa dengan palet simbolnya. Sintaksnya tetap teks biasa di kolom `prompt`:
  `[gambar: https://…]` dan baris pipa ala Markdown (`| Tahun | Panen |`), lihat
  `src/lib/isi-soal.tsx`. Kolom **`stimulus_images` sudah pensiun** — datanya dipindahkan ke dalam
  `prompt` oleh `npm run migrate:gambar`, dan renderernya punya kembaran di
  `tera/components/belajar/IsiSoal.tsx` yang harus tetap sepakat, sama seperti `latex.tsx`
- **Generate Soal dengan AI**: tutor paste materi teks atau upload PDF di halaman edit paket soal, AI
  bikin draf soal pilihan ganda untuk direview sebelum ditambahkan — **butuh `ANTHROPIC_API_KEY`
  milik sendiri**, lihat Setup

Sengaja tidak dikerjakan: proctoring/deteksi kecurangan via kamera (isu privasi terhadap murid
SD-SMA), kolaborasi multi-tutor, integrasi LMS pihak ketiga, marketplace bank soal antar tutor.

## Hubungannya dengan Tera

Sora **berbagi database dengan Tera** (sistem manajemen bimbel di repo `tera`) dan tidak
lagi berdiri sendiri. Konsekuensinya:

- **Skemanya ada di repo Tera**, bukan di sini: `tera/supabase/migrations/060`–`116`. Direktori
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
- **Latihan mandiri murid ada di Tera**, di `/belajar` — bukan lagi di Sora. Yang disusun di sini
  dikerjakan di sana; `curriculum_topic_groups` adalah kunci yang menyambungkan keduanya.

## Setup

1. Jalankan migration Tera sampai `116` (lihat `tera/supabase/migrations/`). Nama filenya masih memakai
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
  (`/q`) sengaja tidak memakai kerangka ini. `/dashboard` sendiri cuma mengalihkan ke
  `/dashboard/sesi`
- `src/app/dashboard/sesi` — menu Asesmen: daftar sesi Tera beserta keadaan soalnya (`lib/coverage.ts`),
  arahnya kebalikan dari editor — pertanyaannya "sesi ini punya soal atau tidak", satu-satunya cara
  sesi yang terlewat bisa kelihatan
- `src/app/dashboard/paket` — menu Paket Soal: seluruh paket apa pun jenisnya, dengan jenis sebagai
  label dan saringan
- `src/app/dashboard/generate` — route handler AI generate soal (PDF via
  `pdf-parse`, panggil Anthropic Messages API langsung lewat `fetch`)
- `src/app/dashboard/quizzes/[id]/live` — dashboard real-time (Supabase Realtime channel per quiz)
- `src/app/dashboard/bank` — Bank Soal: halaman depannya tabel TOPIK (`TopicTable.tsx`), isinya di
  `[groupId]`, satu soal disunting di `soal/[itemId]` dan ditulis di `soal/baru`, soal tanpa tag
  ditampung di `tanpa-topik`. Satu soal bisa muncul di beberapa topik karena penandaannya
  many-to-many. Penyuntingannya memakai `QuestionEditor` yang sama dengan editor paket soal
- `src/app/q/[code]` — halaman publik murid (guest atau pilih dari roster kelas), autosave per
  jawaban lewat `startAttempt`/`saveAnswer`/`finalizeAttempt`, mendukung mode sequential +
  percabangan
- `src/lib/grading.ts` — logika auto-grading untuk semua tipe soal
- `src/lib/curriculum.ts` — label & pengelompokan topik kurikulum Tera
- `src/lib/QuestionInput.tsx` — render widget jawaban tiap tipe soal
- `src/lib/isi-soal.tsx` — format isi soal: satu string teks biasa dengan penanda `[gambar: …]`,
  baris pipa ala Markdown untuk tabel, dan `[rata: tengah]`. **Punya kembaran di
  `tera/components/belajar/IsiSoal.tsx` yang harus tetap sepakat** — soal disusun di sini dan
  dibaca murid di sana, jadi penanda yang cuma dikenal satu sisi tampil sebagai kurung siku
  di tengah pertanyaan
- `src/lib/paginate.ts` — `fetchAllPages`, karena PostgREST diam-diam berhenti di baris ke-1000;
  `truncated` yang dipulangkannya wajib tampil di layar
- `src/lib/SearchFilter.tsx` — kotak cari & saringan yang dipakai bersama daftar-daftar
- `src/lib/question-import.ts` + `src/lib/csv.ts` — impor soal dari CSV
- `src/lib/coverage.ts` — klasifikasi cakupan soal per sesi, murni data supaya bisa diperiksa
  tanpa Supabase
- `src/lib/gamification.ts` — leaderboard & badge (dihitung, tidak disimpan di DB)
- `src/lib/latex.tsx` — komponen `MathText` (render KaTeX dari delimiter `$...$`/`$$...$$`)
- `src/proxy.ts` — proteksi route `/dashboard/*` (Next.js 16 proxy convention, dulu disebut
  middleware) — memeriksa `profiles.role = 'admin'`, otomatis melindungi route generate AI juga

Skemanya di repo Tera:

- `tera/supabase/migrations/060_curriculum_topic_groups.sql` — id stabil untuk topik kurikulum
- `tera/supabase/migrations/061_quizcraft.sql` — seluruh tabel Sora, `learners`,
  `mastery_rubrics`, RLS `is_admin()` + tutor read-only, dan fungsi `security definer`
  `practice_*`/`quiz_roster` sebagai satu-satunya jalur baca bank soal dari sisi murid. RPC
  `practice_*` sekarang dipanggil dari `/belajar` di Tera, bukan lagi dari Sora
- `tera/supabase/migrations/062_seed_tka_matematika_smp.sql` — kurikulum TKA + 14 soal contoh
- `tera/supabase/migrations/079_quiz_kind.sql` — `quizzes.kind` (asesmen/remedial/tryout), label
  dan saringan di Paket Soal. **Belum dijalankan?** Semua paket tampil sebagai Asesmen dan membuat
  Remedial/Try Out gagal dengan pesan yang menyebut migrasi ini — bukan diam-diam salah jenis
- `tera/supabase/migrations/078_quiz_updated_at.sql` — `quizzes.updated_at` + trigger, termasuk
  trigger di `questions` yang menaikkan stempel induknya. **Belum dijalankan?** Daftar paket soal
  tetap tampil, hanya "Diperbarui …" yang jatuh ke `created_at` — halaman sengaja memakai
  `select("*")` supaya kolom yang belum ada tidak menggagalkan query
- `tera/supabase/migrations/110_public_question_bank.sql` — `question_bank_items.is_public`, penanda
  soal yang boleh dikerjakan pelanggan langganan Tera
- `tera/supabase/migrations/116_kapan_soal_terakhir_disunting.sql` — kolom
  `question_bank_items.updated_at` beserta trigger pengisinya. **Belum dijalankan?** Label
  "Terakhir disimpan …" jatuh ke `created_at`

## Catatan implementasi

- Guest mode tidak punya session resume: reload halaman murid di tengah pengerjaan akan memulai
  attempt baru.
- Bank soal adalah satu korpus bersama: murid yang berlatih di Tera bisa mendapat soal dari mapel
  mana pun yang ada isinya, bukan hanya mapel kelasnya. Konsekuensi dari kurikulum yang berporos
  mapel, bukan kelas.
- Soal yang belum ditandai topik tidak akan pernah sampai ke murid — penarikannya selalu lewat
  topik. Karena itu jumlahnya dipasang sebagai spanduk di halaman depan Bank Soal, bukan disimpan
  di halaman terpisah yang harus dicari.
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
