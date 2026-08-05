# PRD Addendum: Topic Taxonomy, Mastery Rubric & Practice Mode

**Status:** Draft untuk mulai development
**Melengkapi:** `PRD_Question_Builder_Engine.md` (Sora core)
**Konteks pemicu:** Kebutuhan latihan mandiri untuk siswa TKA (Tes Kemampuan Akademik), dimulai
dari kelas TKA Matematika SMP — tapi fitur ini dirancang generic untuk semua kelas di Sora.

---

## 1. Latar Belakang

Sora saat ini (Fase 1–4 dari PRD sebelumnya) adalah mesin kuis: tutor buat kuis, publish,
siswa kerjakan sebagai guest, live monitoring, auto-grading. Ini cocok untuk sesi terjadwal
(try out, kuis kelas), tapi belum mendukung dua kebutuhan yang muncul dari pengalaman menjalankan
persiapan TKA secara manual sebelumnya (Google Classroom + Google Forms + Google Sheets):

1. **Latihan mandiri di luar sesi terjadwal** — siswa perlu bisa berlatih kapan saja tanpa
   menunggu tutor publish kuis, memilih topik yang mau difokuskan sendiri.
2. **Pelacakan penguasaan per topik lintas waktu** — sebelumnya dikerjakan manual di Google
   Sheets (rekap skor per sub-kompetensi, dikategorikan Kurang/Memadai/Baik/Istimewa). Ini perlu
   otomatis di dalam sistem, supaya spreadsheet terpisah tidak lagi diperlukan sebagai sumber data.

## 2. Tujuan

1. Siswa bisa berlatih soal secara mandiri, kapan saja, difilter per topik
2. Sistem otomatis menghitung & menampilkan tingkat penguasaan per topik, menggantikan proses
   manual di spreadsheet
3. Semua fitur di atas **generic terhadap mapel/kelas** — TKA Matematika SMP adalah kelas
   pertama yang memakainya, tapi kelas non-TKA di masa depan harus bisa pakai fitur yang sama
   tanpa modifikasi kode
4. Menambah satu tipe soal baru (`statement_grid`) yang dibutuhkan untuk mereplikasi bentuk
   soal "beberapa pernyataan, masing-masing dijawab Benar/Salah" — pola ini juga umum dipakai
   di luar konteks TKA

## 3. Non-Tujuan (Out of Scope untuk iterasi ini)

- ❌ Modul materi/konten (bacaan, video pembahasan) — tetap di Google Classroom, tidak
  direplikasi ke Sora
- ❌ Dashboard rekap kelas untuk tutor (versi digital dari "Db Nilai") — dicatat sebagai
  kandidat iterasi berikutnya, setelah practice mode berjalan beberapa minggu (lihat bagian 9)
- ❌ Konten soal Bahasa Indonesia — fokus dulu ke Matematika sebagai kelas percontohan
- ❌ Migrasi otomatis data lama dari Google Sheets/Forms ke Sora — data lama tetap
  jadi arsip, tidak perlu diimpor

## 4. Prinsip Desain (Wajib Dipatuhi)

**Semua yang dibangun di sini harus netral terhadap mapel.** Sora akan dipakai untuk
kelas-kelas lain di luar TKA. Konsekuensinya:

| Elemen | Salah (❌ TKA-spesifik) | Benar (✅ generic) |
|---|---|---|
| Taksonomi topik | Tabel `elemen`/`sub_kompetensi` | Tabel `topics` generic, self-referencing hierarchy, per `class_id` |
| Rubrik penguasaan | Label "Kurang/Memadai/Baik/Istimewa" hardcoded di kode | Disimpan sebagai data (`classes.mastery_rubric`), TKA cuma salah satu preset |
| Practice mode | Fitur khusus tipe kelas "TKA" | Fitur level-kelas yang menyala untuk kelas mana pun |
| Tipe soal baru | Dinamai `pgk_kategori` | Dinamai `statement_grid` (deskriptif, tidak terikat istilah TKA) |

## 5. User Stories

1. **Sebagai tutor**, saya bisa membuat struktur topik (2 level: topik utama → sub-topik) untuk
   kelas saya, bebas sesuai kebutuhan mapel masing-masing.
2. **Sebagai tutor**, saya bisa menandai soal di bank soal dengan satu atau lebih topik.
3. **Sebagai tutor**, saya bisa (opsional) menentukan rubrik penguasaan untuk kelas saya —
   atau membiarkannya default (skor mentah tanpa label kategori).
4. **Sebagai siswa**, saya bisa masuk dengan identitas persisten (bukan guest sekali pakai)
   supaya progres saya tersimpan lintas sesi.
5. **Sebagai siswa**, saya bisa memilih kelas → topik → mulai latihan, dapat soal acak dari
   bank yang ditag topik tersebut.
6. **Sebagai siswa**, saya dapat feedback instan + pembahasan tiap soal saat latihan mandiri.
7. **Sebagai siswa**, saya lihat ringkasan hasil latihan dengan breakdown per topik, dengan
   label penguasaan kalau kelasnya punya rubrik.
8. **Sebagai tutor**, saya bisa membuat soal tipe `statement_grid` (beberapa pernyataan +
   Benar/Salah) di question builder yang sudah ada, dan mengatur cara penilaiannya
   (proporsional atau all-or-nothing).

## 6. Data Model (Perluasan dari skema Sora yang sudah ada)

```sql
create table topics (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  parent_id uuid references topics(id) on delete cascade,
  name text not null,
  code text,
  order_index integer not null default 0
);

create table question_topics (
  question_bank_item_id uuid not null references question_bank_items(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  primary key (question_bank_item_id, topic_id)
);

alter table classes add column if not exists mastery_rubric jsonb default null;
-- contoh isi untuk kelas TKA:
-- [{"label":"Kurang","min":0},{"label":"Memadai","min":50},
--   {"label":"Baik","min":70},{"label":"Istimewa","min":85}]

create table practice_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  question_bank_item_id uuid not null references question_bank_items(id) on delete cascade,
  response jsonb,
  is_correct boolean,
  answered_at timestamptz not null default now()
);
```

Detail tipe soal baru `statement_grid` — struktur `options`:
```json
{ "statements": ["Pernyataan A", "Pernyataan B", "Pernyataan C"], "answer_labels": ["Benar", "Salah"] }
```
struktur `correct_answer`:
```json
{ "answers": [true, false, true], "grading_mode": "proportional" }
```
(`grading_mode`: `"proportional"` atau `"all_or_nothing"`)

**Perlu diputuskan saat implementasi** (bukan diasumsikan di PRD ini): apakah tabel `students`
yang sudah ada (saat ini untuk roster dropdown di kuis) cukup dipakai langsung untuk practice
mode, atau perlu kolom identitas tambahan (misal `access_code` unique) supaya siswa bisa
"login" dan progresnya konsisten lintas sesi tanpa guest re-entry.

## 7. Functional Requirements

- Tutor dapat CRUD `topics` per kelas (2 level hierarki)
- Tutor dapat tag/untag soal di bank soal ke satu atau lebih topik, dari UI question bank
  yang sudah ada
- Tutor dapat set `mastery_rubric` per kelas (opsional; kalau kosong, tampilkan skor mentah saja)
- Siswa dapat memilih kelas + topik (atau "acak semua topik") untuk memulai sesi latihan mandiri
- Sistem mengambil soal secara acak dari `question_bank_items` yang ditag topik terpilih
- Setiap jawaban dicatat ke `practice_attempts` dengan auto-grading langsung
- Ringkasan akhir sesi menghitung skor per topik dari akumulasi `practice_attempts`, dikonversi
  ke label rubrik bila kelas punya `mastery_rubric`
- Question builder mendukung tipe `statement_grid`, termasuk render sisi tutor (buat/edit) dan
  sisi siswa (kerjakan), plus logika grading proporsional & all-or-nothing

## 8. Non-Functional Requirements

Mengikuti standar Sora yang sudah ada (RLS per tutor/kelas, mobile-responsive, dsb).
Tidak ada requirement performa/skala baru — skala tetap kecil (< 20 siswa per kelas).

## 9. Roadmap Setelah Iterasi Ini

| Iterasi | Fokus |
|---|---|
| **Sekarang** | Topic taxonomy, mastery rubric, practice mode, tipe soal `statement_grid` — kelas contoh: TKA Matematika SMP |
| Berikutnya (setelah dipakai beberapa minggu) | Dashboard rekap tutor: lihat penguasaan seluruh kelas per topik dalam satu layar — versi digital dari "Db Nilai" lama, tapi generic untuk semua kelas |
| Nanti | Konten TKA Bahasa Indonesia (isi data, bukan ubah struktur) |

## 10. Pertanyaan Terbuka

1. Identitas siswa untuk practice mode — pakai tabel `students` yang ada + kolom baru, atau
   desain terpisah? (lihat catatan di bagian 6)
2. Berapa jumlah soal default per sesi latihan mandiri (misal 10? 15? bisa diatur siswa)?
3. Apakah siswa boleh mengerjakan ulang soal yang sama, atau sistem harus menghindari
   pengulangan dalam periode tertentu?
