export interface ParsedAddress {
  host: string;
  path: string;
  isHttps: boolean;
}

/** URL codifica los caracteres no ASCII (%D0%B5); se decodifican para poder normalizarlos. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Acepta URLs completas, direcciones de pago con "$" (se resuelven por https)
 * y direcciones sin esquema (se asume https). Nunca lanza: si no se puede
 * interpretar, devuelve host vacío y el texto en minúsculas como path.
 */
export function parseAddress(url: string): ParsedAddress {
  const raw = url.trim();
  let candidate = raw;
  if (candidate.startsWith("$")) candidate = "https://" + candidate.slice(1);
  else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = "https://" + candidate;

  try {
    const u = new URL(candidate);
    return {
      host: u.host.toLowerCase(),
      path: safeDecode(u.pathname).toLowerCase().replace(/\/+$/, ""),
      isHttps: u.protocol === "https:",
    };
  } catch {
    return { host: "", path: raw.toLowerCase().replace(/\/+$/, ""), isHttps: false };
  }
}

/** Distancia de Levenshtein entre dos textos. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

const CYRILLIC_HOMOGLYPHS: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
};

const CONFUSIONS: Array<[RegExp, string]> = [
  [/rn/g, "m"],
  [/vv/g, "w"],
  [/1/g, "l"],
  [/0/g, "o"],
  [/5/g, "s"],
  [/3/g, "e"],
  [/\|/g, "l"],
];

/**
 * Lleva un handle a una forma comparable: lo que se ve igual a simple vista
 * queda igual. Orden: NFKC, minúsculas, sin tildes, homóglifos cirílicos,
 * confusiones visuales y separadores (_ . -) unificados en "-".
 */
export function normalizeHandle(s: string): string {
  let out = s.normalize("NFKC").toLowerCase();
  out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
  out = out.replace(/[аеорсх]/g, (c) => CYRILLIC_HOMOGLYPHS[c]);
  for (const [pattern, replacement] of CONFUSIONS) out = out.replace(pattern, replacement);
  return out.replace(/[_.-]+/g, "-");
}

export type HandleComparison = "same" | "lookalike" | "different";

export interface ComparisonDetail {
  result: HandleComparison;
  /** Una línea legible que dice qué regla disparó. */
  reason: string;
}

/** Mismo largo y las únicas diferencias son un dígito por otro dígito. */
function onlyDigitSwaps(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && !(/\d/.test(a[i]) && /\d/.test(b[i]))) return false;
  }
  return true;
}

const name = (path: string) => path.replace(/^\//, "");

/**
 * Compara un destino candidato con uno conocido y explica por qué.
 * - same: host y path idénticos.
 * - lookalike: mismo path con otro host, igual tras normalizar pero distinto
 *   en crudo, o distancia ≤ 2 sobre lo normalizado con longitud ≥ 8.
 * - La excepción de dígitos (hermano_1 vs hermano_2) solo aplica a la regla
 *   de distancia.
 */
export function explainComparison(candidate: string, known: string): ComparisonDetail {
  const a = parseAddress(candidate);
  const b = parseAddress(known);

  if (a.host === b.host && a.path === b.path) {
    return { result: "same", reason: `${a.host}${a.path} es idéntico al destino conocido` };
  }
  if (a.host !== b.host && a.path !== "" && a.path === b.path) {
    return {
      result: "lookalike",
      reason: `mismo nombre en otro servidor: ${a.host} vs ${b.host}`,
    };
  }

  const na = normalizeHandle(a.path);
  const nb = normalizeHandle(b.path);
  if (na === nb) {
    return {
      result: "lookalike",
      reason: `${name(a.path)} ≈ ${name(b.path)} (iguales tras normalizar)`,
    };
  }

  if (Math.min(na.length, nb.length) >= 8) {
    const distance = editDistance(na, nb);
    if (distance <= 2) {
      if (onlyDigitSwaps(a.path, b.path)) {
        return { result: "different", reason: `${name(a.path)} y ${name(b.path)} solo cambian dígitos` };
      }
      return {
        result: "lookalike",
        reason: `${name(a.path)} ≈ ${name(b.path)} (distancia de edición ${distance})`,
      };
    }
  }
  return { result: "different", reason: `${name(a.path)} no se parece a ${name(b.path)}` };
}

export function compareHandles(candidate: string, known: string): HandleComparison {
  return explainComparison(candidate, known).result;
}
