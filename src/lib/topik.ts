"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Topik pengukuran dari peta kompetensi (Learning Progression Matematika).
 *
 * Berbeda dari topik kurikulum (`curriculum_topic_groups`) yang menjawab "di
 * bab mana soal ini disodorkan". Yang ini menjawab "butir ini mengukur
 * kemampuan apa" — lepas dari program les, berurut menurut prasyarat, dan
 * stabil meski silabus bimbelnya berganti.
 */
export interface Topik {
  id: string;
  nama: string;
  elemen: string;
  jenjang_kelas: string;
  aktif: boolean;
}

export const LABEL_ELEMEN: Record<string, string> = {
  bilangan: "Bilangan",
  aljabar: "Aljabar",
  geometri_pengukuran: "Geometri & Pengukuran",
  data_peluang: "Data & Peluang",
};

/**
 * Membaca peta topik dari browser.
 *
 * Dibaca di klien, bukan diturunkan sebagai prop dari halaman: empat halaman
 * bank soal merender kartu yang membutuhkannya, dan menambah satu kueri ke
 * masing-masing hanya untuk daftar sependek ini menukar satu perjalanan
 * jaringan dengan empat tempat yang bisa lupa diperbarui.
 *
 * `belum` menandai keadaan yang sah, bukan galat: sebelum migrasi 143 jalan,
 * tabelnya kosong atau belum ada. Pemanggilnya menyembunyikan pemilih topik
 * alih-alih menampilkan dropdown kosong yang tidak bisa dijelaskan.
 */
export function useTopik(): { topik: Topik[]; memuat: boolean; belum: boolean } {
  const [topik, setTopik] = useState<Topik[]>([]);
  const [memuat, setMemuat] = useState(true);

  useEffect(() => {
    let hidup = true;
    createClient()
      .from("topik")
      .select("id, nama, elemen, jenjang_kelas, aktif")
      .order("urutan")
      .then(({ data }) => {
        if (!hidup) return;
        setTopik((data as Topik[] | null) ?? []);
        setMemuat(false);
      });
    return () => {
      hidup = false;
    };
  }, []);

  return { topik, memuat, belum: !memuat && topik.length === 0 };
}

/** "D-01 — Bilangan Bulat: operasi & sifat dasar" */
export function labelTopik(t: Topik): string {
  return `${t.id} — ${t.nama}`;
}
