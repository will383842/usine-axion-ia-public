/** RC-23 · Le script de réception d'image LANCÉ pour de bon avec un faux docker : ce qui est refusé n'est jamais chargé. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "path";

const SCRIPT = join(process.cwd(), "deploiement", "recevoir-image.sh");
const BONNE = `usine-axion-ia:ci-${"a".repeat(40)}`;

let tmp: string;
let bin: string;
let journal: string;

/** Archive « docker save » minimale : un manifest.json dans un tar, compressé. */
function archive(manifest: string | null): Buffer {
  const d = mkdtempSync(join(tmp, "arc-"));
  writeFileSync(join(d, "autre.txt"), "x");
  if (manifest !== null) writeFileSync(join(d, "manifest.json"), manifest);
  const tar = join(tmp, `a-${Math.random().toString(36).slice(2)}.tar`);
  execFileSync("tar", ["-cf", tar, "-C", d, ...(manifest !== null ? ["manifest.json"] : []), "autre.txt"]);
  execFileSync("gzip", ["-f", tar]);
  return readFileSync(`${tar}.gz`);
}
/** Archive à membres explicites, dans l'ordre donné : chaque membre est { nom, contenu } (le nom peut commencer par « ./ »). */
function archiveMembres(membres: { nom: string; contenu: string }[]): Buffer {
  const d = mkdtempSync(join(tmp, "mem-"));
  const racine = join(d, "x");
  mkdirSync(racine);
  // GNU tar : --transform change le nom écrit pour chaque fichier, dans l'ordre de la ligne de commande.
  const args: string[] = ["-cf", join(d, "m.tar"), "-C", racine];
  membres.forEach((m, i) => {
    writeFileSync(join(racine, `f${i}`), m.contenu);
    args.push("--transform", `s|^f${i}$|${m.nom}|`, `f${i}`);
  });
  execFileSync("tar", args);
  execFileSync("gzip", ["-f", join(d, "m.tar")]);
  return readFileSync(join(d, "m.tar.gz"));
}
const manifeste = (...tags: string[][]) => JSON.stringify(tags.map((t) => ({ Config: "c.json", RepoTags: t, Layers: [] })));

function lancer(entree: Buffer, env: Record<string, string> = {}) {
  const r = spawnSync("bash", [SCRIPT], {
    input: entree,
    encoding: "utf8",
    env: { PATH: `${bin}:${process.env.PATH}`, JOURNAL: journal, HOME: tmp, ...env } as unknown as NodeJS.ProcessEnv,
  });
  const appels = existsSync(journal) ? readFileSync(journal, "utf8") : "";
  return { rc: r.status, out: r.stdout, err: r.stderr, appels };
}

beforeEach(() => {
  tmp = mkdtempSync("/tmp/rc23-");
  bin = join(tmp, "bin");
  mkdirSync(bin);
  journal = join(tmp, "docker.log");
  // Faux docker : note chaque appel ; « load » lit l'entrée et annonce l'étiquette de FAUX_TAG.
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh\necho "$@" >> "$JOURNAL"\nif [ "$1" = load ]; then cat >/dev/null; echo "Loaded image: $FAUX_TAG"; fi\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("recevoir-image.sh lancé avec un faux docker", () => {
  const relance = () => {
    const f = join(tmp, "relancer.sh");
    writeFileSync(f, `#!/bin/sh\necho "relance $1" >> "$JOURNAL"\n`);
    chmodSync(f, 0o755);
    return f;
  };

  it("accepte l'étiquette ci-<sha complet>, la marque courante et relance", () => {
    const r = lancer(archive(manifeste([BONNE])), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
    expect(r.rc).toBe(0);
    expect(r.appels).toContain("load");
    expect(r.appels).toContain(`tag ${BONNE} usine-axion-ia:courant`);
    expect(r.appels).toContain(`relance ${BONNE}`);
    expect(r.out).toContain("ok");
  });

  it.each([
    ["l'étiquette courante", [["usine-axion-ia:courant"]]],
    ["une image d'un autre nom", [["postgres:16"]]],
    ["deux étiquettes dans une image", [[BONNE, "usine-axion-ia:courant"]]],
    ["deux images", [[BONNE], ["postgres:16"]]],
    ["un sha trop court", [["usine-axion-ia:ci-abc"]]],
    ["aucune étiquette", [[]]],
  ])("refuse %s AVANT tout docker load", (_nom, tags) => {
    const r = lancer(archive(manifeste(...(tags as string[][]))), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
    expect(r.rc).not.toBe(0);
    expect(r.appels).not.toContain("load");
    expect(r.appels).not.toContain("tag");
  });

  it("refuse une archive sans manifest.json, avant tout chargement", () => {
    const r = lancer(archive(null), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
    expect(r.rc).not.toBe(0);
    expect(r.appels).not.toContain("load");
  });

  it("refuse une entrée qui n'est pas une archive compressée, et une entrée vide", () => {
    for (const e of [Buffer.from("pas une archive"), Buffer.alloc(0)]) {
      const r = lancer(e, { FAUX_TAG: BONNE });
      expect(r.rc).not.toBe(0);
      expect(r.appels).not.toContain("load");
    }
  });

  it("refuse une image plus grosse que la borne, à l'octet près", () => {
    const a = archive(manifeste([BONNE]));
    const trop = lancer(a, { FAUX_TAG: BONNE, USINE_RELANCER: relance(), USINE_TAILLE_MAX_OCTETS: String(a.length - 1) });
    expect(trop.rc).not.toBe(0);
    expect(trop.appels).not.toContain("load");
    const juste = lancer(a, { FAUX_TAG: BONNE, USINE_RELANCER: relance(), USINE_TAILLE_MAX_OCTETS: String(a.length) });
    expect(juste.rc).toBe(0);
  });

  it("sans script de relance : sortie non nulle et pas de « ok »", () => {
    const r = lancer(archive(manifeste([BONNE])), { FAUX_TAG: BONNE, USINE_RELANCER: join(tmp, "absent.sh") });
    expect(r.rc).not.toBe(0);
    expect(r.out).not.toContain("ok");
    expect(r.err).toContain("relance");
  });

  it("une relance qui échoue donne une sortie non nulle", () => {
    const f = join(tmp, "echoue.sh");
    writeFileSync(f, "#!/bin/sh\nexit 7\n");
    chmodSync(f, 0o755);
    const r = lancer(archive(manifeste([BONNE])), { FAUX_TAG: BONNE, USINE_RELANCER: f });
    expect(r.rc).not.toBe(0);
    expect(r.out).not.toContain("ok");
  });

  describe("un même chemin deux fois dans l'archive (docker load garde le dernier)", () => {
    const bon = manifeste([BONNE]);
    const mauvais = manifeste(["usine-axion-ia:courant"]);
    it.each([
      ["manifest.json puis ./manifest.json", [{ nom: "manifest.json", contenu: bon }, { nom: "./manifest.json", contenu: mauvais }]],
      ["./manifest.json puis manifest.json", [{ nom: "./manifest.json", contenu: bon }, { nom: "manifest.json", contenu: mauvais }]],
      ["manifest.json deux fois", [{ nom: "manifest.json", contenu: bon }, { nom: "manifest.json", contenu: mauvais }]],
      ["./manifest.json deux fois", [{ nom: "./manifest.json", contenu: bon }, { nom: "./manifest.json", contenu: mauvais }]],
      ["manifest.json et .//manifest.json", [{ nom: "manifest.json", contenu: bon }, { nom: ".//manifest.json", contenu: mauvais }]],
    ])("refuse %s AVANT tout docker load", (_nom, membres) => {
      const r = lancer(archiveMembres(membres), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc).not.toBe(0);
      expect(r.appels).not.toContain("load");
      expect(r.appels).not.toContain("tag");
    });

    it("refuse un chemin absolu ou qui remonte (« .. »), même hors du manifeste", () => {
      for (const nom of ["/etc/x.json", "../x.json", "a/../../x.json"]) {
        const r = lancer(archiveMembres([{ nom: "manifest.json", contenu: bon }, { nom, contenu: "x" }]), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
        expect(r.rc, nom).not.toBe(0);
        expect(r.appels, nom).not.toContain("load");
      }
    });

    it("accepte un manifest.json unique écrit « ./manifest.json »", () => {
      const r = lancer(archiveMembres([{ nom: "./manifest.json", contenu: bon }]), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc).toBe(0);
      expect(r.appels).toContain("load");
    });

    it("un manifest.json dans un sous-dossier ne compte pas pour celui de la racine", () => {
      const r = lancer(archiveMembres([{ nom: "sous/manifest.json", contenu: bon }]), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc).not.toBe(0);
      expect(r.appels).not.toContain("load");
    });
  });

  describe("clé d'étiquettes écrite autrement que RepoTags (le décodeur de docker est tolérant)", () => {
    const base = (cle: string) => `[{"Config":"c.json","${cle}":["${BONNE}"],"Layers":[]}]`;
    it.each([
      ["repotags en minuscules", base("repotags")],
      ["REPOTAGS en capitales", base("REPOTAGS")],
      ["RepoTags avec \\u", base("Repo\\u0054ags")],
      ["clé avec l'équivalence unicode", base("RepoTag\u017f".replace("\\u017f", "ſ"))],
      ["RepoTags et repotags ensemble", `[{"Config":"c.json","RepoTags":["${BONNE}"],"repotags":["usine-axion-ia:courant"],"Layers":[]}]`],
      ["caractère accentué dans le manifeste", `[{"Config":"c.json","RepoTags":["${BONNE}"],"Note":"é","Layers":[]}]`],
    ])("refuse %s", (_nom, contenu) => {
      const r = lancer(archive(contenu), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc).not.toBe(0);
      expect(r.appels).not.toContain("load");
    });
  });

  describe("index.json (stockage containerd)", () => {
    const index = (nom: string) => `{"manifests":[{"annotations":{"io.containerd.image.name":"${nom}"}}]}`;
    it.each([
      ["le nom de l'étiquette du manifeste", BONNE, true],
      ["le même nom préfixé docker.io/library/", `docker.io/library/${BONNE}`, true],
      ["un autre nom", "usine-axion-ia:courant", false],
    ])("index.json annonce %s", (_nom, annonce, ok) => {
      const r = lancer(archiveMembres([{ nom: "manifest.json", contenu: manifeste([BONNE]) }, { nom: "index.json", contenu: index(annonce) }]), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc === 0).toBe(ok);
      if (!ok) expect(r.appels).not.toContain("load");
    });
    it("refuse deux index.json", () => {
      const r = lancer(archiveMembres([{ nom: "manifest.json", contenu: manifeste([BONNE]) }, { nom: "index.json", contenu: index(BONNE) }, { nom: "./index.json", contenu: index("usine-axion-ia:courant") }]), { FAUX_TAG: BONNE, USINE_RELANCER: relance() });
      expect(r.rc).not.toBe(0);
      expect(r.appels).not.toContain("load");
    });
  });

  it("l'étiquette annoncée par docker load doit être celle du manifeste", () => {
    const r = lancer(archive(manifeste([BONNE])), { FAUX_TAG: "usine-axion-ia:courant", USINE_RELANCER: relance() });
    expect(r.rc).not.toBe(0);
    expect(r.appels).not.toContain("tag");
  });
});
