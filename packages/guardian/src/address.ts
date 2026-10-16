export interface ParsedAddress {
  host: string;
  path: string;
  isHttps: boolean;
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
      path: u.pathname.toLowerCase().replace(/\/+$/, ""),
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
