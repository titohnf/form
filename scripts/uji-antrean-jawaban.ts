// Uji antrean jawaban tanpa jaringan dan tanpa database: `npx tsx scripts/uji-antrean-jawaban.ts`
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AntreanJawaban } from '../src/lib/antrean-jawaban'

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('jawaban yang gagal dikirim tetap di antrean, lalu terkirim saat jaringan kembali', async () => {
  let online = false
  const diterima: Record<string, unknown> = {}
  const a = new AntreanJawaban(async (id, j) => {
    if (!online) throw new Error('fetch failed')
    diterima[id] = j
  })
  a.tambah('s1', 'A', 0)
  a.tambah('s2', 'B', 1)
  await a.siramkan()
  assert.equal(a.jumlah, 2, 'offline: dua jawaban masih tertunda')
  assert.deepEqual(diterima, {})
  online = true
  await a.siramkan()
  assert.equal(a.jumlah, 0)
  assert.deepEqual(diterima, { s1: 'A', s2: 'B' })
})

test('jawaban lebih baru untuk soal yang sama menimpa yang lama, bahkan saat yang lama sedang dikirim', async () => {
  const diterima: unknown[] = []
  const a = new AntreanJawaban(async (_id, j) => {
    await tidur(10)
    diterima.push(j)
  })
  a.tambah('s1', 'A', 0)
  await tidur(2) // 'A' sedang dalam perjalanan
  a.tambah('s1', 'C', 0)
  await a.siramkan()
  assert.equal(a.jumlah, 0)
  assert.equal(diterima.at(-1), 'C', 'yang terakhir tiba di server haruslah jawaban terbaru')
})

test('hasil permanen dibuang agar antrean tidak macet', async () => {
  const a = new AntreanJawaban(async (id) => (id === 'rusak' ? { permanen: true } : undefined))
  a.tambah('rusak', 'X', 0)
  a.tambah('ok', 'Y', 1)
  await a.siramkan()
  assert.equal(a.jumlah, 0)
})

test('waktu habis menurut server mengosongkan antrean dan menandainya', async () => {
  const a = new AntreanJawaban(async () => ({ expired: true }))
  a.tambah('s1', 'A', 0)
  a.tambah('s2', 'B', 1)
  await a.siramkan()
  assert.equal(a.habis, true)
  assert.equal(a.jumlah, 0)
})

test('pulihkan mengisi antrean dari salinan perangkat tanpa menimpa yang baru', async () => {
  const dikirim: string[] = []
  const a = new AntreanJawaban(async (id) => {
    dikirim.push(id)
  })
  a.pulihkan({ s1: { jawaban: 'lama', indeks: 0 }, s2: { jawaban: 'B', indeks: 1 } })
  assert.equal(a.jumlah, 2)
  await a.siramkan()
  assert.deepEqual(dikirim.sort(), ['s1', 's2'])
  assert.equal(a.jumlah, 0)
})

test('perubahan isi dilaporkan untuk disalin ke penyimpanan perangkat', async () => {
  const salinan: number[] = []
  const a = new AntreanJawaban(async () => {}, (isi) => salinan.push(Object.keys(isi).length))
  a.tambah('s1', 'A', 0)
  await a.siramkan()
  assert.equal(salinan.at(-1), 0)
  assert.ok(salinan.includes(1))
})
