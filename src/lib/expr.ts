/**
 * Evaluator aritmetika kecil untuk soal berparameter.
 *
 * Ditulis sendiri, bukan `eval` atau `new Function`, karena rumus ini datang
 * dari kolom database yang disunting lewat browser. Sekali jalur itu terbuka,
 * siapa pun yang bisa menulis soal bisa menjalankan kode di server. Parser ini
 * hanya mengenal angka, nama parameter, dan sejumlah fungsi — tidak ada cara
 * menyentuh apa pun di luar itu.
 *
 * `gcd` dan `lcm` ada sejak awal karena justru itu yang dibutuhkan: soal KPK
 * dan FPB tidak bisa memakai angka acak, angkanya harus dibangkitkan supaya
 * hasilnya bulat.
 */

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sqrt: Math.sqrt,
  gcd: (...a) => a.reduce((x, y) => gcd2(x, y)),
  lcm: (...a) => a.reduce((x, y) => (x * y) / gcd2(x, y)),
};

function gcd2(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

type Token = { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

const OPERATORS = ["<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "^", "(", ")", ","];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j])) j += 1;
      const value = Number(source.slice(i, j));
      if (!Number.isFinite(value)) throw new Error(`Angka tidak sah: ${source.slice(i, j)}`);
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(char)) {
      let j = i;
      while (j < source.length && /[a-zA-Z0-9_]/.test(source[j])) j += 1;
      tokens.push({ kind: "name", value: source.slice(i, j) });
      i = j;
      continue;
    }

    const operator = OPERATORS.find((op) => source.startsWith(op, i));
    if (!operator) throw new Error(`Tanda tidak dikenal: ${char}`);
    tokens.push({ kind: "op", value: operator });
    i += operator.length;
  }

  return tokens;
}

/**
 * Menghitung satu rumus terhadap nilai parameter yang diberikan.
 *
 * Perbandingan menghasilkan 1 atau 0, jadi satu evaluator yang sama melayani
 * rumus jawaban ("a * b") maupun syarat ("a < b").
 */
export function evaluate(source: string, scope: Record<string, number>): number {
  if (source.length > 500) throw new Error("Rumus terlalu panjang");
  const tokens = tokenize(source);
  let position = 0;

  const peek = () => tokens[position];
  const eat = (value: string) => {
    const token = peek();
    if (token?.kind === "op" && token.value === value) {
      position += 1;
      return true;
    }
    return false;
  };

  function comparison(): number {
    let left = sum();
    for (const op of ["<=", ">=", "==", "!=", "<", ">"]) {
      if (eat(op)) {
        const right = sum();
        const result =
          op === "<=" ? left <= right
          : op === ">=" ? left >= right
          : op === "==" ? left === right
          : op === "!=" ? left !== right
          : op === "<" ? left < right
          : left > right;
        left = result ? 1 : 0;
        break;
      }
    }
    return left;
  }

  function sum(): number {
    let left = product();
    for (;;) {
      if (eat("+")) left += product();
      else if (eat("-")) left -= product();
      else return left;
    }
  }

  function product(): number {
    let left = unary();
    for (;;) {
      if (eat("*")) left *= unary();
      else if (eat("/")) {
        const right = unary();
        if (right === 0) throw new Error("Pembagian dengan nol");
        left /= right;
      } else if (eat("%")) {
        const right = unary();
        if (right === 0) throw new Error("Sisa bagi dengan nol");
        left %= right;
      } else return left;
    }
  }

  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }

  function power(): number {
    const base = atom();
    // Kanan-asosiatif, dan pangkat dibatasi supaya satu rumus tidak bisa
    // membekukan server dengan 9^9^9.
    if (eat("^")) {
      const exponent = unary();
      if (Math.abs(exponent) > 32) throw new Error("Pangkat terlalu besar");
      return base ** exponent;
    }
    return base;
  }

  function atom(): number {
    const token = peek();
    if (!token) throw new Error("Rumus terpotong");

    if (token.kind === "num") {
      position += 1;
      return token.value;
    }

    if (token.kind === "name") {
      position += 1;
      if (eat("(")) {
        const args: number[] = [];
        if (!eat(")")) {
          do {
            args.push(comparison());
          } while (eat(","));
          if (!eat(")")) throw new Error("Kurung tutup hilang");
        }
        const fn = FUNCTIONS[token.value];
        if (!fn) throw new Error(`Fungsi tidak dikenal: ${token.value}`);
        return fn(...args);
      }
      if (!(token.value in scope)) throw new Error(`Parameter tidak dikenal: ${token.value}`);
      return scope[token.value];
    }

    if (eat("(")) {
      const value = comparison();
      if (!eat(")")) throw new Error("Kurung tutup hilang");
      return value;
    }

    throw new Error(`Tidak terduga: ${token.value}`);
  }

  const result = comparison();
  if (position < tokens.length) throw new Error("Ada sisa yang tidak terbaca di rumus");
  if (!Number.isFinite(result)) throw new Error("Hasilnya bukan angka");
  return result;
}

/** Nama fungsi yang tersedia, untuk ditampilkan sebagai petunjuk di editor. */
export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
