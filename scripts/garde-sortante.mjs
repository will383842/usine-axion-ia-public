/**
 * Règle sortante de l'Usine (L0-09) : liste d'autorisation, échec fermé, lue sur la syntaxe (compilateur TypeScript).
 * - Tous les fichiers de code du dépôt sont lus (.ts .tsx .mts .cts .js .jsx .mjs .cjs, essais, scripts et configs compris), hors node_modules.
 *   Seule exception : src/passerelles/.
 * - Hors passerelles : aucune référence à `fetch` (appel, alias, export, propriété, chaîne), aucun accès réseau dynamique
 *   (`eval`, `Function`, `require` hors import littéral, `globalThis[…]`, `constructor`…), et seuls les modules de la liste fermée
 *   s'importent (statique, multi-lignes, `import()`, `require()`, `import x = require()`, `import("x").T`). Un nom non littéral est refusé.
 * - Un import relatif reste dans le dépôt, hors node_modules, et ne vise ni un binaire ni un fichier que la garde ne lit pas.
 * - Une passerelle = un fichier de src/passerelles/ nommé dans PASSERELLES. Elle exporte `HOTE` (« https://hôte » déclaré ici, sans chemin),
 *   et chaque appel `fetch` y a pour premier argument HOTE (seul, ou suivi d'un « / »), et pour options un objet littéral
 *   portant exactement un `redirect: "error"` (ni spread, ni clé calculée). `fetch` n'y est jamais exporté ni passé ailleurs.
 * - Zernio et Waalaxy restent interdits à l'Usine, passerelles comprises (dans les chaînes).
 * Les commentaires ne comptent pas (la syntaxe les ignore). Ce n'est pas un bac à sable : la limite réseau du serveur reste la vraie barrière.
 */
import path from "node:path";
import ts from "typescript";

/** Passerelles permises → hôtes joignables. Ajouter une passerelle ou un hôte = modifier cette ligne, relue en PR. */
export const PASSERELLES = {
  studio: ["studio.axion-ia.com"],
  "site-lecture": ["axion-ia.com", "www.axion-ia.com"],
  "bases-source": ["api.github.com"], // lecture seule du manifeste des bases (garde externe, redirections refusées)
};

/** Liste fermée des modules importables partout (hors chemins relatifs et alias `@/`). Un client HTTP n'y est pas : l'y mettre est une décision à relire. */
export const MODULES_PERMIS = new Set([
  "next", "react", "react-dom", "zod", "pg", "@node-rs/argon2",
  "server-only", "crypto", "path", "fs", "fs/promises", "async_hooks", "url", "util", "buffer",
]);
const PREFIXES_PERMIS = ["react/", "react-dom/"];
/** Sous-chemins de `next` utilisés (nommés un à un : next/dist/… embarque des clients réseau et de quoi lancer des processus). */
const SOUS_CHEMINS_NEXT = new Set(["next/link", "next/cache", "next/navigation", "next/server", "next/headers", "next/font/local"]);
/** Seul fichier qui signe et vérifie le témoin de session (jose sait aussi lire une clé distante : réservé à ce fichier). */
const FICHIERS_JOSE = new Set(["src/lib/jeton-session.ts"]);
/** Ajouts pour les fichiers hors de src/ (scripts, essais, configurations). */
const MODULES_OUTILS = new Set([
  "vitest", "vitest/config", "eslint/config", "eslint-config-next/core-web-vitals", "eslint-config-next/typescript", "typescript", "readline",
]);
/** Seuls fichiers qui lancent un processus (git) ; scripts/ecrire-temoin-bases.mjs lit le commit de la source des bases (voir CLAUDE.md). */
const FICHIERS_PROCESSUS = new Set(["scripts/garde.mjs", "scripts/ecrire-temoin-bases.mjs", "tests/porte.test.ts", "tests/lien-suivi.test.ts", "tests/deploiement/recevoir-image-execution.test.ts", "tests/sauvegarde.test.ts"]);

// Le mot est assemblé ici : la garde lit aussi son propre fichier.
const F = ["fe", "tch"].join("");
const MOT_F = new RegExp(`\\b${F}\\b`);
const DOSSIER = "src/passerelles/";
const CODE = /\.(m|c)?(t|j)sx?$/;
const EXT_LUES = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const EXT_SANS_RISQUE = new Set(["", ".json", ".css", ".test", ".spec", ".config", ".d"]);

const HOTES_INTERDITS = /\b(zernio|waalaxy)\.[a-z]{2,}|https?:\/\/[^\s"'`]*(zernio|waalaxy)/i;
const GLOBALES = new Set(["globalThis", "self", "window", "global"]);
const IDENTIFIANTS_INTERDITS = new Set(["eval", "Function", "require", "XMLHttpRequest", "WebSocket", "EventSource"]);
const MEMBRES_INTERDITS = new Set([
  "constructor", "__proto__", "binding", "dlopen", "_linkedBinding", "mainModule",
  "getBuiltinModule", "require", "importActual", "importMock", "createRequire",
]);
/** Seules propriétés lisibles sur les globales (globalThis, window, self, global) : tout le reste (WebSocket, eval, Worker…) est refusé. */
const PROPRIETES_GLOBALES = new Set([
  "addEventListener", "removeEventListener", "dispatchEvent", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "scrollTo", "location", "history", "document",
  "innerWidth", "innerHeight", "crypto", "console", "performance", "structuredClone", "queueMicrotask",
]);

const enveloppe = (n) => ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || ts.isSatisfiesExpression(n);
/** Remonte les parenthèses et les conversions de type autour d'une expression. */
function nu(n) {
  while (n.parent && enveloppe(n.parent) && n.parent.expression === n) n = n.parent;
  return n;
}
/** Descend les parenthèses et les conversions de type. */
function descend(n) {
  while (enveloppe(n)) n = n.expression;
  return n;
}
const litteral = (n) => n !== undefined && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
const estAppel = (id) => id.parent && ts.isCallExpression(id.parent) && id.parent.expression === id;

function modulePermis(nom, fichier) {
  if (nom.startsWith("@/")) return /^[\w./-]+$/.test(nom.slice(2)) && !nom.split("/").includes("..");
  if (nom.startsWith(".")) {
    const cible = path.posix.normalize(path.posix.join(path.posix.dirname(fichier), nom));
    if (cible === ".." || cible.startsWith("../") || cible.split("/").includes("node_modules")) return false;
    const ext = path.posix.extname(cible);
    return EXT_LUES.has(ext) || EXT_SANS_RISQUE.has(ext);
  }
  if (nom.startsWith("#") || nom.startsWith("/")) return false;
  const n = nom.replace(/^node:/, "");
  if (n === "child_process") return FICHIERS_PROCESSUS.has(fichier);
  if (n === "jose") return FICHIERS_JOSE.has(fichier);
  if (SOUS_CHEMINS_NEXT.has(n)) return true;
  if (MODULES_PERMIS.has(n) || PREFIXES_PERMIS.some((p) => n.startsWith(p))) return true;
  return !fichier.startsWith("src/") && MODULES_OUTILS.has(n);
}

/** Le premier argument d'un fetch de passerelle : HOTE seul, ou HOTE suivi d'un chemin qui commence par « / » (jamais « @ » ni « . »). */
function urlSurHote(arg) {
  const e = descend(arg);
  const estHote = (n) => ts.isIdentifier(descend(n)) && descend(n).text === "HOTE";
  if (estHote(e)) return true;
  if (ts.isTemplateExpression(e)) {
    const [premier] = e.templateSpans;
    return e.head.text === "" && estHote(premier.expression) && premier.literal.text.startsWith("/");
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    let b = e;
    while (ts.isBinaryExpression(descend(b.left)) && descend(b.left).operatorToken.kind === ts.SyntaxKind.PlusToken) b = descend(b.left);
    if (!estHote(b.left)) return false;
    const suite = descend(b.right);
    if (litteral(suite)) return suite.text.startsWith("/");
    return ts.isTemplateExpression(suite) && suite.head.text.startsWith("/");
  }
  return false;
}

/** Les options d'un fetch de passerelle : objet littéral, un seul `redirect: "error"`, ni spread ni clé calculée. */
function optionsSansRedirection(arg) {
  const e = arg && descend(arg);
  if (!e || !ts.isObjectLiteralExpression(e)) return false;
  let redirections = 0;
  for (const p of e.properties) {
    if (ts.isSpreadAssignment(p)) return false;
    if (!p.name || ts.isComputedPropertyName(p.name)) return false;
    const cle = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
    if (cle === null) return false;
    if (cle === "redirect") {
      if (!ts.isPropertyAssignment(p) || !litteral(p.initializer) || p.initializer.text !== "error") return false;
      redirections++;
    }
  }
  return redirections === 1;
}

const nomDeclare = (id) => {
  const p = id.parent;
  return (
    (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p)) &&
    p.name === id
  );
};

/** Fautes de la règle sortante pour un fichier (chemin relatif à la racine, texte). */
// Le nom du dépôt privé est assemblé ici : la garde lit aussi son propre fichier.
const TRACE_PRIVEE = new RegExp(["axion", "plans", "prive"].join("[-_ ]?"), "i");

/** L7-02 · Tout fichier qui nomme le dépôt privé des plans est refusé (aucune exception, ni commentaire ni chaîne). */
export function fautesTracesPrivees(fichier, texte) {
  const fautes = [];
  texte.split("\n").forEach((ligne, i) => {
    if (TRACE_PRIVEE.test(ligne)) fautes.push(`${fichier}:${i + 1} : trace du dépôt privé (à retirer d'un dépôt public)`);
  });
  return fautes;
}

export function fautesSortantes(fichier, texte) {
  if (!CODE.test(fichier) || fichier.split("/").includes("node_modules")) return [];
  const fautes = [];
  const sf = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true);
  const ou = (n) => `${fichier}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const faute = (n, quoi) => fautes.push(`${ou(n)} : ${quoi}`);

  const passerelle = fichier.startsWith(DOSSIER);
  const nom = passerelle ? fichier.slice(DOSSIER.length).replace(/\.(m|c)?(t|j)sx?$/, "") : null;
  const hotes = nom !== null && Object.hasOwn(PASSERELLES, nom) ? PASSERELLES[nom] : null;
  if (passerelle && hotes === null) fautes.push(`${fichier} : passerelle non déclarée (permises : ${Object.keys(PASSERELLES).join(", ")}) ; voir CLAUDE.md`);
  if (sf.parseDiagnostics?.length) fautes.push(`${fichier} : fichier illisible pour la garde (${ts.flattenDiagnosticMessageText(sf.parseDiagnostics[0].messageText, " ")})`);

  const noeuds = [];
  const parcourir = (n) => {
    noeuds.push(n);
    ts.forEachChild(n, parcourir);
  };
  parcourir(sf);

  // Première passe : symboles locaux et alias de l'objet global.
  const symboles = new Set();
  const alias = new Set();
  const globale = (id) => ts.isIdentifier(id) && (GLOBALES.has(id.text) || alias.has(id.text));
  for (const n of noeuds) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const i = descend(n.initializer);
      if (ts.isCallExpression(i) && (descend(i.expression).getText(sf) === "Symbol" || descend(i.expression).getText(sf) === "Symbol.for")) symboles.add(n.name.text);
    }
  }
  for (let tour = 0; tour < 3; tour++) {
    for (const n of noeuds) {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && globale(descend(n.initializer))) alias.add(n.name.text);
    }
  }

  let appels = 0;
  let hoteDeclare = false;
  let declarationsHote = 0;
  for (const n of noeuds) {
    if (ts.isIdentifier(n)) {
      const enType = n.parent && ts.isTypeReferenceNode(n.parent);
      const nomDePropriete = n.parent && (ts.isPropertyAccessExpression(n.parent) || ts.isQualifiedName(n.parent)) && (n.parent.name ?? n.parent.right) === n;
      if (n.text === "HOTE" && nomDeclare(n)) declarationsHote++;
      if (n.text === F) {
        if (!passerelle) faute(n, `${F} hors de src/passerelles/ ; une sortie = une passerelle déclarée`);
        else if (estAppel(n)) appels++;
        else faute(n, `${F} n'est qu'appelé, jamais exporté, passé ni renommé`);
      } else if (!enType && !nomDePropriete && IDENTIFIANTS_INTERDITS.has(n.text) && !(n.text === "require" && estAppel(n) && litteral(n.parent.arguments[0]))) {
        faute(n, `« ${n.text} » interdit (exécution ou accès réseau dynamique)`);
      }
      if (nomDePropriete && MEMBRES_INTERDITS.has(n.text)) faute(n, `accès « ${n.text} » interdit`);
      if (n.parent && ts.isBindingElement(n.parent) && (n.parent.propertyName ?? n.parent.name) === n && MEMBRES_INTERDITS.has(n.text)) faute(n, `extraction de « ${n.text} » interdite`);
      if (!enType && !nomDePropriete && globale(n) && !nomDeclare(n) && !ts.isPropertyAssignment(n.parent) && !ts.isShorthandPropertyAssignment(n.parent) && !ts.isTypeQueryNode(n.parent)) {
        const e = nu(n);
        const p = e.parent;
        const accesNomme = ts.isPropertyAccessExpression(p) && p.expression === e && PROPRIETES_GLOBALES.has(p.name.text);
        const accesSymbole = ts.isElementAccessExpression(p) && p.expression === e && ts.isIdentifier(descend(p.argumentExpression)) && symboles.has(descend(p.argumentExpression).text);
        const aliasDeclare = ts.isVariableDeclaration(p) && p.initializer === e && ts.isIdentifier(p.name);
        if (!accesNomme && !accesSymbole && !aliasDeclare) faute(n, `usage de « ${n.text} » interdit (seulement une propriété de la liste PROPRIETES_GLOBALES, [symbole] ou un alias)`);
      }
    }
    if (ts.isElementAccessExpression(n) && litteral(n.argumentExpression) && MEMBRES_INTERDITS.has(n.argumentExpression.text)) faute(n, `accès « ${n.argumentExpression.text} » interdit`);
    if (litteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      if (HOTES_INTERDITS.test(n.text)) faute(n, "Zernio et Waalaxy sont interdits à l'Usine");
      if (!passerelle && MOT_F.test(n.text)) faute(n, `chaîne « ${F} » hors de src/passerelles/`);
    }

    // Modules : tout ce qui charge un module, avec un nom littéral de la liste fermée.
    let specifieur;
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) specifieur = n.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) specifieur = n.moduleReference.expression;
    else if (ts.isImportTypeNode(n)) specifieur = ts.isLiteralTypeNode(n.argument) ? n.argument.literal : n.argument;
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === "require"))) specifieur = n.arguments[0] ?? n;
    if (specifieur !== undefined) {
      if (!litteral(specifieur)) faute(n, "import dont le nom n'est pas une chaîne littérale");
      else if (!modulePermis(specifieur.text, fichier)) faute(n, `module « ${specifieur.text} » hors de la liste fermée (scripts/garde-sortante.mjs)`);
    }

    // Passerelle : chaque appel est lié à l'hôte exporté et refuse les redirections.
    if (hotes !== null && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === F) {
      if (n.arguments.length < 1 || n.arguments.length > 2 || !urlSurHote(n.arguments[0])) faute(n, `le premier argument de ${F} est HOTE (ou HOTE + « /chemin »), jamais une autre chaîne`);
      if (!optionsSansRedirection(n.arguments[1])) faute(n, `chaque ${F} porte ses propres options littérales avec un seul redirect: "error"`);
    }
    if (hotes !== null && ts.isVariableStatement(n) && n.parent === sf) {
      for (const d of n.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === "HOTE") {
          const exporte = n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
          const constante = (n.declarationList.flags & ts.NodeFlags.Const) !== 0;
          const m = d.initializer && litteral(d.initializer) ? d.initializer.text.match(/^https:\/\/([a-z0-9.-]+)$/i) : null;
          if (!exporte || !constante || !m) faute(d, 'HOTE s\'écrit export const HOTE = "https://hôte" (sans chemin)');
          else if (!hotes.includes(m[1].toLowerCase())) faute(d, `hôte « ${m[1]} » non déclaré pour cette passerelle (scripts/garde-sortante.mjs)`);
          else hoteDeclare = true;
        }
      }
    }
  }
  if (hotes !== null && appels > 0 && !hoteDeclare) fautes.push(`${fichier} : exporter l'hôte fixe (export const HOTE = "https://…", déclaré dans la garde)`);
  if (hotes !== null && declarationsHote > 1) fautes.push(`${fichier} : HOTE ne se déclare qu'une fois (pas de masquage)`);
  return fautes;
}
