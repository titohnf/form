import { signIn, signOut, signedInLearner, loadSubjects } from "./actions";
import PracticeRunner from "./PracticeRunner";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const learner = await signedInLearner();

  if (!learner) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16">
        <h1 className="text-2xl font-semibold">Latihan Mandiri</h1>
        <p className="mt-1 text-sm text-gray-500">
          Masukkan kode latihan dari tutormu. Kode ini diingat di perangkat ini, jadi kamu tidak
          perlu mengetiknya lagi nanti.
        </p>

        {error && (
          <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
            Kode tidak dikenali. Cek lagi ke tutormu.
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
      </div>
    );
  }

  const subjects = await loadSubjects();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Latihan Mandiri</h1>
          <p className="text-sm text-gray-500">{learner.learner_name}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="text-xs text-gray-500 underline">
            Keluar
          </button>
        </form>
      </div>

      <PracticeRunner subjects={subjects} />
    </div>
  );
}
