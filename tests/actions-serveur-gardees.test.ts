/**
 * Garde automatique (relecture N-26, deux passes) : chaque fonction exportée d'un fichier "use server" de src/ (ou
 * chaque fonction marquée "use server" elle-même) a pour PREMIÈRE instruction, hors de tout if/try/catch,
 * `await exigerSession();` ou `const x = await exigerSession();`, avec exigerSession IMPORTÉ de "@/services/auth" et
 * jamais redéclaré dans le fichier. Une action serveur est une route publique : sans cet appel, elle répond sans
 * session. Seule exception : les actions de /connexion listées dans ACTIONS_DE_CONNEXION (avant la session par
 * nature), dont le corps entier est figé ici et dont le garde doit être importé de "@/services/auth" ; toute
 * modification de leur corps fait échouer ce test et se relit en PR.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const MODULE_AUTH = "@/services/auth";
const CONNEXION = "src/app/connexion/actions.ts";

/**
 * Actions de /connexion sans session complète, par nature : garde importé (refuse lui-même sans la session qu'il
 * exige, src/services/auth.ts) et corps figé (espaces réduits).
 */
const ACTIONS_DE_CONNEXION: Record<string, { garde: string; corps: string }> = {
  connexion: {
    garde: "seConnecter", // public par nature, limite d'essais ; n'ouvre qu'une session partielle
    corps:
      'const r = await seConnecter(String(formulaire.get("motDePasse") ?? ""), formulaire.get("resterConnecte") === "on"); if (!r.ok) return { message: r.message }; redirect(versSecondCode(formulaire.get("suite")));',
  },
  ouverture: {
    garde: "premiereOuverture", // public par nature, limite d'essais ; n'ouvre qu'une session partielle
    corps:
      'const r = await premiereOuverture( String(formulaire.get("motDePasse") ?? ""), String(formulaire.get("confirmation") ?? ""), formulaire.get("resterConnecte") === "on", ); if (!r.ok) return { message: r.message }; redirect("/connexion");',
  },
  deconnexion: { garde: "seDeconnecter", corps: 'await seDeconnecter(); redirect("/connexion");' }, // n'ouvre rien
  montrerSecret: {
    garde: "commencerSecondCode", // exige la session partielle
    corps: "const r = await commencerSecondCode(); return r.ok ? { message: null, secret: r.secret, lien: r.lien } : { message: r.message };",
  },
  premierCode: {
    garde: "enregistrerSecondCode", // exige la session partielle
    corps:
      'const r = await enregistrerSecondCode(String(formulaire.get("code") ?? "")); return r.ok ? { message: null, codesSecours: r.codesSecours } : { message: r.message };',
  },
  secondCode: {
    garde: "entrerSecondCode", // exige la session partielle
    corps: 'const r = await entrerSecondCode(String(formulaire.get("code") ?? "")); if (!r.ok) return { message: r.message }; redirect(suiteSure(formulaire.get("suite")));',
  },
  codeSecours: {
    garde: "entrerCodeSecours", // exige la session partielle
    corps: 'const r = await entrerCodeSecours(String(formulaire.get("code") ?? "")); if (!r.ok) return { message: r.message }; redirect(versSecondCode(formulaire.get("suite")));',
  },
};

const RACINE = join(__dirname, "..");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? fichiers(join(dossier, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dossier, e.name)] : [],
  );
}

const aDirective = (instructions: readonly ts.Statement[]) =>
  instructions.some((i) => ts.isExpressionStatement(i) && ts.isStringLiteral(i.expression) && i.expression.text === "use server");

type Fonction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** Nom local → nom importé, pour les imports nommés (valeurs) de "@/services/auth". */
function importsAuth(src: ts.SourceFile): Map<string, string> {
  const m = new Map<string, string>();
  for (const i of src.statements) {
    if (!ts.isImportDeclaration(i) || !ts.isStringLiteral(i.moduleSpecifier) || i.moduleSpecifier.text !== MODULE_AUTH) continue;
    const c = i.importClause;
    if (!c || c.isTypeOnly || !c.namedBindings || !ts.isNamedImports(c.namedBindings)) continue;
    for (const e of c.namedBindings.elements) if (!e.isTypeOnly) m.set(e.name.text, (e.propertyName ?? e.name).text);
  }
  return m;
}

/** Noms déclarés dans le fichier hors imports (fonction, variable, paramètre, classe…) : un homonyme masque l'import. */
function nomsDeclares(src: ts.SourceFile): Set<string> {
  const noms = new Set<string>();
  const voir = (n: ts.Node) => {
    if (ts.isImportDeclaration(n)) return;
    if ((ts.isFunctionDeclaration(n) || ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isClassDeclaration(n) || ts.isBindingElement(n) || ts.isFunctionExpression(n)) && n.name && ts.isIdentifier(n.name))
      noms.add(n.name.text);
    ts.forEachChild(n, voir);
  };
  voir(src);
  return noms;
}

/** La première instruction (après les directives) est `await g();` ou `const x = await g();`, g parmi `gardes`. */
function teteGardee(f: Fonction, gardes: Set<string>): boolean {
  if (!f.body || !ts.isBlock(f.body)) return false;
  const tete = f.body.statements.find((i) => !(ts.isExpressionStatement(i) && ts.isStringLiteral(i.expression)));
  if (!tete) return false;
  const attendu = (e: ts.Expression | undefined) =>
    !!e && ts.isAwaitExpression(e) && ts.isCallExpression(e.expression) && ts.isIdentifier(e.expression.expression) && gardes.has(e.expression.expression.text);
  if (ts.isExpressionStatement(tete)) return attendu(tete.expression);
  if (ts.isVariableStatement(tete)) {
    const d = tete.declarationList.declarations;
    return d.length === 1 && attendu(d[0].initializer);
  }
  return false;
}

const exporte = (n: ts.Node) => ts.canHaveModifiers(n) && !!ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const reduit = (t: string) => t.replace(/\s+/g, " ").trim();

/** Rend la liste des fonctions d'action serveur sans garde, et des exports qu'on ne sait pas lire. */
export function actionsSansGarde(chemin: string, texte: string): string[] {
  const src = ts.createSourceFile(chemin, texte, ts.ScriptTarget.Latest, true, chemin.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const declares = nomsDeclares(src);
  const importes = [...importsAuth(src)].filter(([local]) => !declares.has(local));
  const nomsVers = (cible: string) => new Set(importes.filter(([, importe]) => importe === cible).map(([local]) => local));
  const exiger = nomsVers("exigerSession");
  const gardee = (f: Fonction, nom: string | null): boolean => {
    if (teteGardee(f, exiger)) return true;
    const connue = chemin === CONNEXION && nom !== null ? ACTIONS_DE_CONNEXION[nom] : undefined;
    if (!connue || !f.body || !ts.isBlock(f.body)) return false;
    const corps = reduit(f.body.statements.map((i) => i.getText(src)).join(" "));
    return teteGardee(f, nomsVers(connue.garde)) && nomsVers(connue.garde).has(connue.garde) && corps === connue.corps;
  };
  const fautifs: string[] = [];
  const toutLeFichier = aDirective(src.statements);
  const nom = (f: Fonction, defaut: string) => (ts.isFunctionDeclaration(f) && f.name ? f.name.text : defaut);

  if (toutLeFichier) {
    for (const i of src.statements) {
      if (ts.isExportAssignment(i) || ts.isExportDeclaration(i)) {
        if (ts.isExportDeclaration(i) && i.isTypeOnly) continue;
        fautifs.push(`${chemin} : export non lu (${i.getText(src).slice(0, 40)})`);
        continue;
      }
      if (!exporte(i)) continue;
      if (ts.isFunctionDeclaration(i)) {
        if (!gardee(i, i.name?.text ?? null)) fautifs.push(`${chemin} : ${nom(i, "default")}`);
      } else if (ts.isVariableStatement(i)) {
        for (const d of i.declarationList.declarations) {
          const v = d.initializer;
          if (v && (ts.isArrowFunction(v) || ts.isFunctionExpression(v))) {
            if (!gardee(v, ts.isIdentifier(d.name) ? d.name.text : null)) fautifs.push(`${chemin} : ${d.name.getText(src)}`);
          } else fautifs.push(`${chemin} : ${d.name.getText(src)} (export qui n'est pas une fonction)`);
        }
      }
    }
  }
  // Fonctions marquées "use server" elles-mêmes, où qu'elles soient.
  const visiter = (n: ts.Node) => {
    if ((ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.body && ts.isBlock(n.body)) {
      if (aDirective(n.body.statements) && !teteGardee(n, exiger)) fautifs.push(`${chemin} : ${nom(n, `ligne ${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`)}`);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(src);
  return fautifs;
}

describe("actions serveur gardées", () => {
  const tous = fichiers(join(RACINE, "src"));

  it("trouve les actions serveur de src/", () => {
    expect(tous.filter((f) => readFileSync(f, "utf8").includes('"use server"')).length).toBeGreaterThan(10);
  });

  it("chaque fonction exportée d'un fichier \"use server\" commence par await exigerSession() (ou est une action de connexion figée)", () => {
    const fautifs = tous.flatMap((f) => actionsSansGarde(relative(RACINE, f), readFileSync(f, "utf8")));
    expect(fautifs).toEqual([]);
  });

  it("refuse une action sans garde, ou dont la garde vient après", () => {
    const sans = `"use server";\nimport { exigerSession } from "@/services/auth";\nexport async function a() { await faire(); }\nexport const b = async () => { await faire(); await exigerSession(); };`;
    expect(actionsSansGarde("x.ts", sans)).toEqual(["x.ts : a", "x.ts : b"]);
    const avec = `"use server";\nimport { exigerSession } from "@/services/auth";\nexport async function a() { await exigerSession(); }\nexport const b = async () => { const s = await exigerSession(); return s.jti; };`;
    expect(actionsSansGarde("x.ts", avec)).toEqual([]);
    // Un garde local, même s'il commence par exigerSession(), ne compte plus ; exigerSession non importé non plus.
    const local = `"use server";\nimport { exigerSession } from "@/services/auth";\nasync function pret() { await exigerSession(); }\nexport async function a() { await pret(); }`;
    expect(actionsSansGarde("x.ts", local)).toEqual(["x.ts : a"]);
    expect(actionsSansGarde("x.ts", `"use server";\nimport { exigerSession } from "./ailleurs";\nexport async function a() { await exigerSession(); }`)).toEqual(["x.ts : a"]);
    expect(actionsSansGarde("x.ts", `export async function c() { "use server"; await faire(); }`)).toEqual(["x.ts : c"]);
  });

  it("refuse les cinq contournements de la relecture : garde avalée, conditionnelle, non attendue, garde publique suivie d'autre chose, homonyme local", () => {
    const tete = `"use server";\nimport { exigerSession } from "@/services/auth";\n`;
    const connexion = "src/app/connexion/actions.ts";
    const tete2 = `"use server";\nimport { seDeconnecter } from "@/services/auth";\n`;
    const cas: [string, string][] = [
      ["x.ts", `${tete}export async function a() { try { await exigerSession(); } catch {} await faire(); }`],
      ["x.ts", `${tete}export async function a(x: boolean) { if (x) await exigerSession(); await faire(); }`],
      ["x.ts", `${tete}export async function a() { exigerSession().catch(() => null); await faire(); }`],
      [connexion, `${tete2}export async function deconnexion() { await seDeconnecter(); await faire(); }`],
      [connexion, `"use server";\nasync function entrerSecondCode() { return { ok: true }; }\nexport async function a() { await entrerSecondCode(); await faire(); }`],
    ];
    for (const [chemin, texte] of cas) expect.soft(actionsSansGarde(chemin, texte), texte).not.toEqual([]);
  });
});
