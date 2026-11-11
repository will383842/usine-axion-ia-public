/** L0-09 · La garde sortante lit la syntaxe (compilateur TypeScript) et échoue fermé : tout accès réseau hors de src/passerelles/ est refusé. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fautesSortantes } from "../scripts/garde-sortante.mjs";

const refuse = (f: string, t: string) => expect(fautesSortantes(f, t).length, `${f}\n${t}`).toBeGreaterThan(0);
const laisse = (f: string, t: string) => expect(fautesSortantes(f, t)).toEqual([]);

// Les mots à interdire sont assemblés ici pour que ce fichier, lu lui aussi par la garde, n'en contienne aucun.
const F = ["fe", "tch"].join("");
const ZERNIO = ["zer", "nio"].join("");
const WAALAXY = ["waa", "laxy"].join("");
const APPEL = `await ${F}("https://example.com/a");`;
const STUDIO = `export const HOTE = "https://studio.axion-ia.com";\nawait ${F}(HOTE, { redirect: "error" });\n`;
const studio = (corps: string) => `export const HOTE = "https://studio.axion-ia.com";\n${corps}\n`;

describe("seconde relecture : la garde lit la syntaxe", () => {
  it("1 · les fichiers d'essai sont lus comme les autres", () => {
    refuse("src/lots/a.test.ts", APPEL);
    refuse("tests/a.test.ts", APPEL);
    refuse("tests/a.spec.mts", `import axios from "axios";`);
    refuse("src/lots/a.test.tsx", `const f = ${F};`);
  });

  it("2 · un import relatif ne sort ni du dépôt, ni vers node_modules, ni vers un fichier non lu", () => {
    refuse("src/lots/a.ts", `import c from "../../node_modules/undici/index.js";`);
    refuse("src/lots/a.ts", `import c from "../../../hors-depot/client";`);
    refuse("src/lots/a.ts", `import c from "./natif.node";`);
    refuse("src/lots/a.ts", `import c from "#interne";`);
    refuse("src/lots/a.ts", `const c = await import("../../node_modules/got");`);
    laisse("src/lots/a.ts", `import { a } from "./b";\nimport c from "../lib/c.js";\nimport d from "@/lib/d";\nimport e from "./e.json";`);
  });

  it("3 · les fichiers hors de src/ sont lus aussi", () => {
    for (const f of ["scripts/a.mjs", "tests/a.ts", "outil.js", "app/a.cjs", "vitest.config.mts", ".github/a.mjs", "docs/a.jsx"]) refuse(f, APPEL);
    refuse("scripts/a.mjs", `import https from "node:https";`);
    refuse("scripts/a.mjs", `import { execSync } from "node:child_process";`);
    laisse("scripts/garde.mjs", `import { execFileSync } from "node:child_process";`);
    laisse("scripts/a.mjs", `import { readFileSync } from "node:fs";`);
  });

  it("4 · un import sur plusieurs lignes est refusé ; un commentaire qui cite import ( ne l'est pas", () => {
    refuse("src/lots/a.ts", `import {\n  a,\n  b,\n} from\n  "undici";`);
    refuse("src/lots/a.ts", `import type {\n  A\n} from "@anthropic-ai/sdk";`);
    refuse("src/lots/a.ts", `export {\n  a\n}\nfrom "node:net";`);
    refuse("src/lots/a.ts", `const h = await import(\n  "node:https"\n);`);
    refuse("src/lots/a.ts", `import x = require("node:http");`);
    refuse("src/lots/a.ts", `type T = import("undici").Client;`);
    refuse("src/lots/a.ts", `import(\`node:\${n}\`);`);
    laisse("src/lots/a.ts", `// import ( "undici" )\n/* import ( x ) */\nexport const a = 1;`);
    laisse("src/lots/a.ts", `const texte = "pas de import ( ici";`);
  });

  it("5 · l'appel d'une passerelle vise la constante d'hôte, jamais une chaîne libre", () => {
    laisse("src/passerelles/studio.ts", STUDIO);
    laisse("src/passerelles/studio.ts", studio(`await ${F}(\`\${HOTE}/api/x\`, { redirect: "error" });`));
    laisse("src/passerelles/studio.ts", studio(`await ${F}(HOTE + "/api/x", { method: "GET", redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}("https://studio.axion-ia.com/x", { redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(url, { redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(\`\${HOTE}@autre.example.com\`, { redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(\`\${base}/x\`, { redirect: "error" });\nconst base = HOTE;`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(new URL(chemin, HOTE), { redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`function f(HOTE: string) { return ${F}(HOTE, { redirect: "error" }); }`));
    refuse("src/passerelles/studio.ts", `export const HOTE = "https://autre.example.com";\nawait ${F}(HOTE, { redirect: "error" });`);
    refuse("src/passerelles/studio.ts", `export const HOTE = "https://studio.axion-ia.com/chemin";\nawait ${F}(HOTE, { redirect: "error" });`);
    refuse("src/passerelles/studio.ts", `const HOTE = "https://studio.axion-ia.com";\nawait ${F}(HOTE, { redirect: "error" });`);
    refuse("src/passerelles/studio.ts", `await ${F}(HOTE, { redirect: "error" });`);
  });

  it("6 · chaque appel porte redirect: \"error\" dans ses propres options", () => {
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE);`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { method: "GET" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { redirect: "follow" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { redirect: "manual" });`));
    refuse("src/passerelles/studio.ts", studio(`const o = { redirect: "error" };\nawait ${F}(HOTE, o);`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { ...o, redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { redirect: "error", ...o });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { redirect: "error", redirect: "follow" });`));
    refuse("src/passerelles/studio.ts", studio(`await ${F}(HOTE, { ["redirect"]: "follow" });`));
    refuse("src/passerelles/studio.ts", studio(`// redirect: "error"\nawait ${F}(HOTE, {});\nawait ${F}(HOTE, { redirect: "error" });`));
    refuse("src/passerelles/studio.ts", studio(`const t = 'redirect: "error"';\nawait ${F}(HOTE, {});`));
  });
});

describe("première relecture : cas conservés", () => {
  it("refuse l'appel réseau natif hors passerelle, sous toutes ses formes", () => {
    refuse("src/lots/fautif.ts", APPEL);
    refuse("src/lots/fautif.ts", `/**/ ${APPEL}`);
    refuse("src/lots/fautif.ts", `const f = ${F};\nawait f(url);`);
    refuse("src/lots/fautif.ts", `export { ${F} };`);
    refuse("src/lots/fautif.ts", `const f = globalThis.${F};`);
    refuse("src/lots/fautif.ts", `const f = globalThis['fe' + 'tch'];`);
    refuse("src/lots/fautif.ts", `const g = globalThis as Record<string, unknown>;\nconst f = g['fe' + 'tch'];`);
    refuse("src/lots/fautif.ts", `const { ["fe" + "tch"]: f } = globalThis;`);
    refuse("src/lots/fautif.ts", `const f = (() => {}).constructor("return " + "fe" + "tch")();`);
    refuse("src/lots/fautif.ts", `const f = Function("return 1");`);
    refuse("src/lots/fautif.ts", `const f = "${F}";`);
    refuse("src/lots/fautif.ts", `const s = new WebSocket("wss://example.com");`);
    refuse("src/lots/fautif.ts", `const x = new XMLHttpRequest();`);
  });

  it("refuse tout module hors de la liste fermée", () => {
    refuse("src/lots/a.ts", 'import Anthropic from "@anthropic-ai/sdk";');
    refuse("src/lots/a.ts", 'const h = await import("node:https");');
    refuse("src/lots/a.ts", 'import axios from "axios";');
    refuse("src/lots/a.ts", 'export * from "undici";');
    refuse("src/lots/a.ts", 'const m = await import(nom);');
    refuse("src/lots/a.ts", 'const r = require("node:net");');
    refuse("src/lots/a.ts", 'const r = require(nom);');
    refuse("src/lots/a.ts", 'import "node:http";');
    refuse("src/lots/a.ts", 'eval("x")');
  });

  it("contrôle .mts, .cts, .cjs, .jsx et next.config", () => {
    for (const f of ["src/a.mts", "src/a.cts", "src/a.cjs", "src/a.jsx", "next.config.ts"]) refuse(f, APPEL);
  });

  it("laisse les modules de la liste, les chemins relatifs et les globales typées", () => {
    laisse("src/lots/a.ts", 'import { z } from "zod";\nimport { a } from "./b";\nimport c from "@/lib/c";\nimport "server-only";\nimport fs from "node:fs/promises";');
    laisse("src/lib/base.ts", 'const cle = Symbol.for("x");\ntype G = typeof globalThis & { [cle]?: number };\nconst g = globalThis as G;\ng[cle] = 1;\n(globalThis as G)[cle] = 2;');
    refuse("src/lib/base.ts", 'const g = globalThis;\nconst k = "a";\ng[k] = 1;');
    refuse("src/lib/base.ts", "Object.keys(globalThis);");
  });

  it("n'accepte une passerelle que déclarée", () => {
    refuse("src/passerelles/autre.ts", "export const a = 1;");
    refuse("src/passerelles/studio.test.ts", STUDIO);
    refuse("src/passerelles/buffer.ts", `export const HOTE = "https://api.example.com";\nawait ${F}(HOTE, { redirect: "error" });`);
    refuse("src/passerelles/studio.ts", `${STUDIO}export { ${F} };`);
    refuse("src/passerelles/studio.ts", `${STUDIO}export const brut = ${F};`);
    refuse("src/passerelles/studio.ts", `${STUDIO}import axios from "axios";`);
  });

  it("refuse les hôtes interdits, même dans une passerelle, mais pas un nom de source", () => {
    refuse("src/passerelles/studio.ts", `${STUDIO}const u = "https://api.${ZERNIO}.com/x";`);
    refuse("src/passerelles/studio.ts", `${STUDIO}const u = "app.${WAALAXY}.com";`);
    laisse("src/contrats/a.ts", `export const S = ["${ZERNIO}-stop"];`);
  });

  it("la recherche de secrets lit aussi la garde sortante", () => {
    expect(readFileSync("scripts/garde.mjs", "utf8")).not.toMatch(/IGNORES\s*=\s*new Set\([^)]*garde-sortante/);
  });

  it("3e relecture · chargement caché, sous-chemins de next, propriétés des globales, jose", () => {
    refuse("src/lots/a.ts", 'const h = process.getBuiltinModule("node:https");');
    refuse("src/lots/a.ts", 'const { getBuiltinModule } = process;');
    refuse("src/lots/a.ts", 'const m = module.require("node:https");');
    refuse("src/lots/a.ts", 'const m = ts.sys.require("node:https");');
    refuse("src/lots/a.ts", 'const m = await vi.importActual("node:https");');
    refuse("src/lots/a.ts", 'import c from "next/dist/compiled/cross-spawn";');
    refuse("src/lots/a.ts", 'import c from "next/dist/compiled/https-proxy-agent";');
    laisse("src/lots/a.ts", 'import Link from "next/link";\nimport { revalidatePath } from "next/cache";\nimport { redirect } from "next/navigation";');
    refuse("src/lots/a.ts", 'const s = new globalThis.WebSocket(url);');
    refuse("src/lots/a.ts", 'globalThis.eval("x");');
    refuse("src/lots/a.ts", 'const w = new globalThis.Worker(url);');
    refuse("src/lots/a.ts", 'const s = new window.WebSocket(url);');
    laisse("src/components/a.tsx", 'window.addEventListener("pagehide", f);\nwindow.removeEventListener("pagehide", f);');
    refuse("src/lots/a.ts", 'import { createRemoteJWKSet } from "jose";');
    laisse("src/lib/jeton-session.ts", 'import { SignJWT } from "jose";');
  });
});

describe("garde des bases : passerelle déclarée et exceptions nommées", () => {
  const BASES = `export const HOTE = "https://api.github.com";\nawait ${F}(\`\${HOTE}/repos/x/y?ref=main\`, { headers: {}, redirect: "error" });\n`;
  it("la garde externe des bases est une passerelle, hôte fixe et redirections refusées", () => {
    laisse("src/passerelles/bases-source.ts", BASES);
    refuse("src/passerelles/bases-source.ts", BASES.replace("api.github.com", "autre.example.com"));
    refuse("src/passerelles/bases-source.ts", BASES.replace('redirect: "error"', 'redirect: "follow"'));
    refuse("scripts/garde-bases-externe.mjs", `await ${F}("https://api.github.com/x");`);
  });

  it("node:child_process n'est permis qu'au script témoin nommé", () => {
    laisse("scripts/ecrire-temoin-bases.mjs", `import { execFileSync } from "node:child_process";`);
    refuse("scripts/autre-script.mjs", `import { execFileSync } from "node:child_process";`);
  });

  it("node:os reste refusé (l'essai des bases passe par TMPDIR)", () => {
    refuse("tests/bases-copie.test.ts", `import { tmpdir } from "node:os";`);
  });

  it("les fichiers réels des bases passent la garde", () => {
    for (const f of ["scripts/ecrire-temoin-bases.mjs", "scripts/garde-bases-externe.mjs", "tests/bases-copie.test.ts", "src/passerelles/bases-source.ts"]) {
      laisse(f, readFileSync(f, "utf8"));
    }
  });
});
