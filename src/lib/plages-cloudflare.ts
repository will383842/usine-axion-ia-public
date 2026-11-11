/**
 * Plages d'adresses publiées par Cloudflare, d'où viennent ses requêtes vers le serveur d'origine.
 * Source : https://www.cloudflare.com/ips-v4 et https://www.cloudflare.com/ips-v6 (liste inchangée depuis 2023),
 * recopiée le 14/10/2026. Si Cloudflare la change, la mettre à jour ici.
 */
export const PLAGES_CLOUDFLARE_V4 = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

export const PLAGES_CLOUDFLARE_V6 = [
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

/** Une adresse lue : sa famille et sa valeur entière, ou null si elle est illisible. */
export interface AdresseLue {
  famille: 4 | 6;
  valeur: bigint;
}

function lireV4(texte: string): bigint | null {
  const parts = texte.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => (acc << 8n) | BigInt(Number(p)), 0n);
}

function lireV6(texte: string): bigint | null {
  let t = texte.toLowerCase().split("%")[0];
  // Fin en IPv4 (::ffff:192.0.2.1) : deux groupes de 16 bits.
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (v4) {
    const n = lireV4(v4[1]);
    if (n === null) return null;
    t = t.slice(0, -v4[1].length) + `${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`;
  }
  const morceaux = t.split("::");
  if (morceaux.length > 2) return null;
  const groupes = (s: string) => (s ? s.split(":") : []);
  const debut = groupes(morceaux[0]);
  const fin = morceaux.length === 2 ? groupes(morceaux[1]) : [];
  const manque = 8 - debut.length - fin.length;
  if (morceaux.length === 1 ? manque !== 0 : manque < 1) return null;
  const tous = [...debut, ...Array<string>(morceaux.length === 2 ? manque : 0).fill("0"), ...fin];
  if (tous.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return tous.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n);
}

/** Lit une adresse IPv4 ou IPv6. Une IPv6 qui enveloppe une IPv4 (`::ffff:a.b.c.d`) est rendue en IPv4. */
export function lireAdresse(texte: string): AdresseLue | null {
  const t = texte.trim().replace(/^\[|\]$/g, "");
  if (!t.includes(":")) {
    const v = lireV4(t);
    return v === null ? null : { famille: 4, valeur: v };
  }
  const v = lireV6(t);
  if (v === null) return null;
  if (v >> 32n === 0xffffn) return { famille: 4, valeur: v & 0xffffffffn };
  return { famille: 6, valeur: v };
}

/** Vrai si l'adresse appartient à la plage (`base/longueur`). Plage ou adresse illisible : faux (échec fermé). */
export function dansPlage(texte: string, plage: string): boolean {
  const a = lireAdresse(texte);
  const [base, longueur, ...reste] = plage.split("/");
  const b = lireAdresse(base);
  if (!a || !b || b.famille !== a.famille || reste.length || !/^\d{1,3}$/.test(longueur ?? "")) return false;
  const bits = a.famille === 4 ? 32n : 128n;
  const n = BigInt(longueur);
  if (n > bits) return false;
  return a.valeur >> (bits - n) === b.valeur >> (bits - n);
}

/** Vrai si l'adresse appartient à une plage publiée de Cloudflare. */
export function dansPlagesCloudflare(texte: string): boolean {
  const a = lireAdresse(texte);
  if (!a) return false;
  return (a.famille === 4 ? PLAGES_CLOUDFLARE_V4 : PLAGES_CLOUDFLARE_V6).some((p) => dansPlage(texte, p));
}

/** Ce que la limite d'essais compte : une IPv4 telle quelle, une IPv6 par son /64 (un ordinateur en a 2⁶⁴). */
export function cleAdresse(texte: string): string {
  const a = lireAdresse(texte);
  if (!a) return texte.trim();
  if (a.famille === 4) return [24n, 16n, 8n, 0n].map((d) => ((a.valeur >> d) & 0xffn).toString()).join(".");
  const prefixe = a.valeur >> 64n;
  return `${[48n, 32n, 16n, 0n].map((d) => ((prefixe >> d) & 0xffffn).toString(16)).join(":")}::/64`;
}
