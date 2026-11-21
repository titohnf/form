import PitaBiru from "@/app/q/[code]/PitaBiru";
import FormKode from "./FormKode";

export const metadata = { title: "Hasil Try Out" };

export default function HasilPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#eef3f8]">
      <PitaBiru subjudul="HASIL TRY OUT" />
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl sm:p-8">
          <h1 className="text-center text-xl font-semibold text-gray-900">Lihat Hasil Try Out</h1>
          <p className="mt-1 text-center text-sm text-gray-500">
            Masukkan kode peserta yang dikirim tutor lewat WhatsApp.
          </p>
          <FormKode />
        </div>
      </main>
    </div>
  );
}
