import { NextResponse } from "next/server";

/**
 * Merakit soal dari materi (teks atau PDF) — dipakai bersama oleh editor paket
 * dan Bank Soal.
 *
 * Dulu route ini duduk di `quizzes/[id]/edit/generate` padahal tidak pernah
 * menyentuh `id`-nya: masukannya cuma materi dan jumlah, keluarannya soal
 * lepas. Bank Soal butuh yang sama persis, dan menaruhnya di bawah satu
 * paket berarti pemanggil kedua harus mengarang id paket yang tidak ada
 * hubungannya.
 */

export interface GeneratedQuestion {
  prompt: string;
  choices: string[];
  correct_answer: string;
  weight: number;
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY belum diset di .env.local — fitur ini butuh API key Anthropic milik kamu sendiri." },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const textInput = String(formData.get("text") ?? "").trim();
  const file = formData.get("file") as File | null;
  const count = Math.min(Math.max(Number(formData.get("count")) || 5, 1), 10);
  // Opsional: dipakai Bank Soal, yang selalu merakit di dalam satu topik.
  // Editor paket tidak mengirimnya — di sana materinya sendiri yang jadi batas.
  const topic = String(formData.get("topic") ?? "").trim();

  let material = textInput;
  if (file && file.size > 0) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      material = parsed.text;
      await parser.destroy();
    } catch {
      return NextResponse.json({ error: "Gagal membaca file PDF." }, { status: 400 });
    }
  }

  if (!material) {
    return NextResponse.json({ error: "Materi (teks atau PDF) belum diisi." }, { status: 400 });
  }

  const prompt = `Buat ${count} soal pilihan ganda (satu jawaban benar) berbahasa Indonesia berdasarkan materi di bawah ini.${
    topic ? ` Semua soal harus berada di dalam topik "${topic}"; abaikan bagian materi yang di luar topik itu.` : ""
  } Balas HANYA dengan JSON array valid, tanpa teks lain, format persis:
[{"prompt": "...", "choices": ["...", "...", "...", "..."], "correct_answer": "...", "weight": 1}]
"correct_answer" harus sama persis (character-for-character) dengan salah satu isi "choices".

Materi:
"""
${material.slice(0, 12000)}
"""`;

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Gagal menghubungi Anthropic API." }, { status: 502 });
  }

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json({ error: `Anthropic API error: ${errText.slice(0, 300)}` }, { status: 502 });
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "Gagal membaca hasil dari AI." }, { status: 502 });
  }

  try {
    const questions = JSON.parse(jsonMatch[0]) as GeneratedQuestion[];
    return NextResponse.json({ questions });
  } catch {
    return NextResponse.json({ error: "Gagal membaca hasil dari AI." }, { status: 502 });
  }
}
