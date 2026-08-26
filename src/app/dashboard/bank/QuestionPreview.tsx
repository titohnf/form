import type {
  MatchingOptions,
  McqOptions,
  OrderingOptions,
  Question,
  StatementGridAnswer,
  StatementGridOptions,
} from "@/lib/types";
import { MathText } from "@/lib/latex";
import IsiSoal from "@/lib/isi-soal";

/**
 * Soal sebagaimana dibaca, bukan sebagaimana disunting: pertanyaan, pilihan
 * jawaban, dan kunci yang sudah ditandai. Tidak ada satu pun field di sini.
 *
 * Inilah bentuk baku sebuah kartu di bank soal. Editor penuh baru dibuka kalau
 * seseorang memang hendak mengubah sesuatu — membentangkan dua puluh field
 * untuk tiap soal membuat topik berisi sepuluh soal jadi halaman yang harus
 * digulung berkali-kali hanya untuk membacanya, dan membaca justru yang paling
 * sering dilakukan orang di sini.
 *
 * Kunci jawaban tampil terbuka: yang membuka halaman ini tutor, bukan murid.
 */
export default function QuestionPreview({ question }: { question: Question }) {
  return (
    // 16px: seukuran kotak isian di mode sunting dan seukuran soal yang sampai
    // ke murid, jadi satu soal tampak sama besar di ketiga tempat.
    <div className="text-base">
      {question.prompt.trim() ? (
        // `leading-relaxed` hanya di sini dan di pernyataan: baris yang lebih
        // longgar melegakan teks panjang, tapi di daftar pilihan ia menggeser
        // pusat baris dan kotak radionya ikut meleset.
        <IsiSoal text={question.prompt} className="leading-relaxed text-gray-900" />
      ) : (
        <p className="text-gray-400 italic">Pertanyaan masih kosong</p>
      )}

      <Answers question={question} />
    </div>
  );
}

function Answers({ question }: { question: Question }) {
  switch (question.type) {
    case "mcq_single":
    case "mcq_multi": {
      const choices = (question.options as McqOptions | null)?.choices ?? [];
      // Kunci ganda dan kunci tunggal disamakan jadi satu himpunan supaya
      // penandaannya satu jalan, bukan dua cabang yang harus dijaga sejalan.
      const keys = new Set(
        Array.isArray(question.correct_answer)
          ? (question.correct_answer as string[])
          : typeof question.correct_answer === "string" && question.correct_answer
            ? [question.correct_answer]
            : [],
      );
      if (choices.length === 0) return <Kosong>Belum ada pilihan jawaban.</Kosong>;

      // Kontrol sungguhan, sebentuk dengan mode sunting dan dengan layar murid:
      // radio untuk pilihan tunggal, checkbox untuk MCMA. Bentuk kontrolnya
      // sendiri yang memberi tahu berapa jawaban yang boleh dipilih — huruf
      // A/B/C/D dulu menutupi perbedaan itu, dan glif ☑/☐ tak pernah sama besar
      // dengan kotak di sebelahnya saat kartunya dibuka untuk disunting.
      const kompleks = question.type === "mcq_multi";

      return (
        <ul className="mt-4 flex flex-col gap-2">
          {choices.map((choice, i) => {
            const benar = keys.has(choice);
            return (
              // `relative` bukan hiasan: label `sr-only` di bawah dipasang
              // `position: absolute` oleh Tailwind, dan tanpa induk yang
              // berposisi ia berpaut pada dokumen — lolos dari kotak gulung
              // halaman dan memanjangkan JENDELA sepanjang daftar soal. Itu
              // yang dulu membuat bar kepala halaman melayang lepas dari bar
              // atas begitu halaman digulung.
              <li key={`${choice}-${i}`} className="relative flex gap-2 text-gray-600">
                {/* Mati sungguhan: kartu ini bacaan, dan kontrol yang bisa
                    diklik tapi tidak menyimpan apa-apa hanya menjanjikan
                    penyuntingan yang tidak ada. Menandai kunci baru mungkin
                    setelah Edit ditekan. */}
                <input
                  type={kompleks ? "checkbox" : "radio"}
                  checked={benar}
                  disabled
                  readOnly
                  aria-hidden
                  tabIndex={-1}
                  // Kotak 16px di tengah baris teks 24px: (24−16)/2 = 4px.
                  // Tanpa hitungan itu kotaknya menggantung di atas hurufnya.
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <IsiSoal text={choice} />
                {/* Teksnya sewarna pilihan lain: yang menandai kunci di sini
                    kontrol yang tercentang, bukan warna hurufnya. Pembaca layar
                    tidak melihat kontrol yang aria-hidden, jadi label inilah
                    yang menyebutkannya. */}
                {benar && <span className="sr-only">kunci jawaban</span>}
              </li>
            );
          })}
        </ul>
      );
    }

    case "true_false":
      // Yang belum ditandai jangan ikut hijau: hijau di sini berarti "ini
      // kuncinya", dan kunci yang belum ada bukan kunci.
      if (question.correct_answer !== "true" && question.correct_answer !== "false") {
        return <Kosong>Kunci jawaban belum ditandai.</Kosong>;
      }
      return <Kunci>{question.correct_answer === "true" ? "Benar" : "Salah"}</Kunci>;

    case "short_answer":
    case "fill_blank": {
      const keys = Array.isArray(question.correct_answer)
        ? (question.correct_answer as string[])
        : [];
      if (keys.length === 0) return <Kosong>Kunci jawaban belum diisi.</Kosong>;
      return <Kunci>{keys.join(" · ")}</Kunci>;
    }

    case "matching": {
      const pairs = (question.options as MatchingOptions | null)?.pairs ?? [];
      if (pairs.length === 0) return <Kosong>Pasangan jawaban belum diisi.</Kosong>;
      return (
        <ul className="mt-4 flex flex-col gap-2 text-gray-600">
          {pairs.map((pair, i) => (
            <li key={i}>
              <MathText text={pair.left} /> <span className="text-gray-400">=</span>{" "}
              <MathText text={pair.right} />
            </li>
          ))}
        </ul>
      );
    }

    case "ordering": {
      const items = (question.options as OrderingOptions | null)?.items ?? [];
      if (items.length === 0) return <Kosong>Belum ada item untuk diurutkan.</Kosong>;
      // Urutan tampilnya adalah urutan yang benar — di layar murid item-item ini
      // teracak, dan yang perlu dibaca tutor justru urutan seharusnya.
      return (
        <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-gray-600">
          {items.map((item, i) => (
            <li key={i}>
              <MathText text={item} />
            </li>
          ))}
        </ol>
      );
    }

    case "statement_grid": {
      const options = question.options as StatementGridOptions | null;
      const statements = options?.statements ?? [];
      const [benar, salah] = options?.answer_labels ?? ["Benar", "Salah"];
      const judulBaris = options?.statement_label?.trim();
      const key = (question.correct_answer ?? {}) as Partial<StatementGridAnswer>;
      const answers = Array.isArray(key.answers) ? key.answers : [];
      if (statements.length === 0) return <Kosong>Belum ada pernyataan.</Kosong>;

      return (
        // Tabel sungguhan, bukan daftar: pernyataan dan kategorinya adalah dua
        // sumbu, dan itulah persis bentuk yang dilihat murid saat mengerjakan —
        // membacanya dalam bentuk lain berarti memeriksa soal yang berbeda dari
        // yang disajikan. Bisa menggeser sendiri di layar sempit supaya
        // kolomnya tidak menghimpit.
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-gray-600">
                {/* Sudut kiri atas bergaris hanya kalau penyusunnya memberi
                    judul; tanpa itu tidak ada yang dinamainya — judul barisnya
                    adalah pernyataannya sendiri. */}
                {judulBaris ? (
                  <th scope="col" className="w-1/2 border border-slate-200 px-4 py-2 font-normal">
                    <MathText text={judulBaris} />
                  </th>
                ) : (
                  <th className="w-1/2" />
                )}
                {[benar, salah].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="border border-slate-200 px-4 py-2 font-normal"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statements.map((statement, i) => (
                <tr key={i} className="text-gray-600">
                  <th
                    scope="row"
                    className="border border-slate-200 px-4 py-4 leading-relaxed font-normal"
                  >
                    <MathText text={statement} />
                    {/* Baris tanpa kunci tidak bisa dikenali dari dua lingkaran
                        yang sama-sama kosong kalau tidak dikatakan. */}
                    {typeof answers[i] !== "boolean" && (
                      <span className="ml-2 text-xs text-amber-600">belum ditandai</span>
                    )}
                  </th>
                  {([true, false] as const).map((pilihan) => (
                    <td
                      key={String(pilihan)}
                      className="border border-slate-200 px-4 py-4 text-center"
                    >
                      <input
                        type="radio"
                        name={`kunci_${question.id}_${i}`}
                        checked={answers[i] === pilihan}
                        disabled
                        readOnly
                        aria-label={pilihan ? benar : salah}
                        className="h-4 w-4"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "essay":
    case "upload_file":
      // Keduanya memang tidak punya kunci; mengatakannya sekali lebih baik
      // daripada ruang kosong yang terbaca sebagai soal yang belum selesai.
      return <Kosong>Dinilai manual, tanpa kunci jawaban.</Kosong>;
  }
}

function Kunci({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-gray-600">
      <span className="text-xs text-gray-400">Kunci: </span>
      <span className="font-semibold text-green-800">{children}</span>
    </p>
  );
}

function Kosong({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-xs text-gray-400">{children}</p>;
}
