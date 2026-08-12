import {
  signIn,
  signOut,
  switchChild,
  chooseChild,
  signedInLearner,
  loadChildren,
  loadSubjects,
} from "./actions";
import PracticeRunner from "./PracticeRunner";
import { getCurrentUser } from "@/lib/current-user";

const errorMessage: Record<string, string> = {
  "1": "Kode tidak dikenali. Cek lagi ke tutormu.",
  child: "Gagal menyiapkan latihan untuk anak itu. Coba lagi, atau hubungi admin Tera.",
};

/**
 * Halaman latihan punya dua pintu masuk, dan urutan pemeriksaannya penting.
 *
 * Identitas yang sudah jadi selalu menang: kalau kode atau anak terpilih sudah
 * ada di cookie, langsung berlatih. Baru sesudah itu kita tanya apakah yang
 * membuka halaman ini sebuah akun keluarga — kalau ya, tawarkan anaknya alih-alih
 * meminta kode yang memang tidak dia punya.
 *
 * Formulir kode tetap jadi jatuh tempo terakhir: ia melayani murid luar Tera dan
 * anak yang berlatih di perangkat tutor saat les.
 */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const learner = await signedInLearner();

  if (!learner) {
    const { role } = await getCurrentUser();
    const children = role === "parent" ? await loadChildren() : [];

    if (children.length > 0) {
      return (
        <div className="mx-auto max-w-sm px-4 py-16">
          <h1 className="text-2xl font-semibold">Latihan Mandiri</h1>
          <p className="mt-1 text-sm text-gray-500">
            Siapa yang mau berlatih? Hasilnya masuk ke catatan penguasaan anak itu.
          </p>

          {error && (
            <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
              {errorMessage[error] ?? error}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            {children.map((child) => (
              <form key={child.student_id} action={chooseChild}>
                <input type="hidden" name="studentId" value={child.student_id} />
                <button
                  type="submit"
                  className="w-full rounded border border-gray-300 px-4 py-3 text-left text-sm font-medium hover:bg-gray-50"
                >
                  {child.student_name}
                </button>
              </form>
            ))}
          </div>

          <p className="mt-6 text-xs text-gray-400">
            Berlatih di perangkat tutor? Pakai kode latihan saja — jangan masuk dengan akun
            keluarga di perangkat orang lain.
          </p>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-semibold">Latihan Mandiri</h1>
        <p className="mt-1 text-sm text-gray-500">
          Masukkan kode latihan dari tutormu. Kode ini diingat di perangkat ini, jadi kamu tidak
          perlu mengetiknya lagi nanti.
        </p>

        {error && (
          <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {errorMessage[error] ?? error}
          </p>
        )}

        <form action={signIn} className="mt-6 flex flex-col gap-3">
          <input
            name="code"
            required
            autoFocus
            autoCapitalize="characters"
            placeholder="Kode latihan"
            className="rounded border border-gray-300 px-3 py-3 text-center text-lg font-medium tracking-widest uppercase"
          />
          <button
            type="submit"
            className="rounded bg-black px-4 py-3 text-sm font-medium text-white hover:bg-gray-800"
          >
            Mulai
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-400">
          Orang tua murid Tera bisa{" "}
          <a href="/login" className="underline">
            masuk dengan akun keluarga
          </a>{" "}
          dan memilih anaknya, tanpa kode.
        </p>
      </div>
    );
  }

  const subjects = await loadSubjects();
  // Keluarga boleh berpindah anak tanpa keluar dari akunnya — kakak-adik memakai
  // satu perangkat yang sama. Pemegang kode tidak punya anak lain untuk dipilih,
  // jadi baginya yang masuk akal cuma "Keluar".
  const isFamilySession = (await getCurrentUser()).role === "parent";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Latihan Mandiri</h1>
          <p className="text-sm text-gray-500">{learner.learner_name}</p>
        </div>
        <div className="flex gap-3">
          {isFamilySession && (
            <form action={switchChild}>
              <button type="submit" className="text-xs text-gray-500 underline">
                Ganti anak
              </button>
            </form>
          )}
          <form action={signOut}>
            <button type="submit" className="text-xs text-gray-500 underline">
              Keluar
            </button>
          </form>
        </div>
      </div>

      <PracticeRunner subjects={subjects} />
    </div>
  );
}
