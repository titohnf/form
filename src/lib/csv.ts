/**
 * Pembaca CSV kecil, cukup untuk berkas yang dikeluarkan Excel dan Google
 * Sheets: tanda kutip, koma di dalam kutip, baris baru di dalam kutip, dan
 * kutip ganda ("") sebagai kutip harfiah.
 *
 * Ditulis sendiri alih-alih menambah pustaka: yang dibaca di sini berkas
 * buatan orang yang menyimpan dari Excel, bukan CSV liar dari internet, dan
 * aturan di atas sudah mencakup seluruhnya. Pemisahnya dideteksi — Excel
 * berbahasa Indonesia menyimpan dengan titik koma karena koma dipakai sebagai
 * pemisah desimal, dan berkas itu akan terbaca sebagai satu kolom raksasa
 * kalau koma dipaksakan.
 */
export function parseCsv(text: string): string[][] {
  // BOM dari Excel ikut terbaca sebagai bagian dari judul kolom pertama.
  const isi = text.replace(/^﻿/, "");
  const pemisah = tebakPemisah(isi);

  const baris: string[][] = [];
  let sel = "";
  let kolom: string[] = [];
  let dalamKutip = false;

  for (let i = 0; i < isi.length; i += 1) {
    const c = isi[i];

    if (dalamKutip) {
      if (c === '"') {
        if (isi[i + 1] === '"') {
          sel += '"';
          i += 1;
        } else {
          dalamKutip = false;
        }
      } else {
        sel += c;
      }
      continue;
    }

    if (c === '"') dalamKutip = true;
    else if (c === pemisah) {
      kolom.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      // \r\n dihitung satu akhir baris, bukan dua.
      if (c === "\r" && isi[i + 1] === "\n") i += 1;
      kolom.push(sel);
      baris.push(kolom);
      kolom = [];
      sel = "";
    } else sel += c;
  }

  if (sel || kolom.length > 0) {
    kolom.push(sel);
    baris.push(kolom);
  }

  // Baris yang seluruh selnya kosong bukan data — Excel gemar menitipkan
  // beberapa di ujung berkas.
  return baris.filter((r) => r.some((sel) => sel.trim() !== ""));
}

function tebakPemisah(isi: string): string {
  const kepala = isi.slice(0, isi.indexOf("\n") === -1 ? isi.length : isi.indexOf("\n"));
  const koma = (kepala.match(/,/g) ?? []).length;
  const titikKoma = (kepala.match(/;/g) ?? []).length;
  const tab = (kepala.match(/\t/g) ?? []).length;
  if (tab > koma && tab > titikKoma) return "\t";
  return titikKoma > koma ? ";" : ",";
}
