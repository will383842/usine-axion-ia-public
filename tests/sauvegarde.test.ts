/** L7-04 · Sauvegarde nocturne : le script n'envoie qu'un dépôt (PUT), ne supprime rien, alerte en cas d'échec ; la signature est vérifiée sans réseau. */
import { createHash, createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configurationCurl, signerDepot } from "../deploiement/copier-r2.mjs";

const lire = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const SCRIPTS = ["deploiement/sauvegarder.sh", "deploiement/restaurer-base.sh", "deploiement/copier-r2.mjs", "deploiement/crontab"];
const hmac = (k: string | Buffer, d: string) => createHmac("sha256", k).update(d).digest();

const entree = {
  compte: "compte-fictif",
  bucket: "sauvegardes-fictives",
  cle: "usine/2026-11-11.sql.gz.enc",
  sha256: createHash("sha256").update("contenu fictif").digest("hex"),
  longueur: 14,
  date: new Date(Date.UTC(2026, 10, 11, 2, 30, 0)),
  idAcces: "ID_FICTIF",
  secret: "SECRET_FICTIF",
};

describe("signature du dépôt (faux S3, aucun réseau)", () => {
  it("signe en SigV4 un PUT vers l'hôte du compte, avec l'empreinte du contenu", () => {
    const r = signerDepot(entree);
    expect(r.methode).toBe("PUT");
    expect(r.url).toBe("https://compte-fictif.r2.cloudflarestorage.com/sauvegardes-fictives/usine/2026-11-11.sql.gz.enc");
    expect(r.entetes["x-amz-content-sha256"]).toBe(entree.sha256);
    expect(r.entetes["x-amz-date"]).toBe("20261111T023000Z");
    const m = r.entetes.authorization.match(/Credential=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/);
    expect(m).not.toBeNull();
    const [, cred, signees, signature] = m!;
    expect(cred).toBe("ID_FICTIF/20261111/auto/s3/aws4_request");
    expect(signees).toBe("host;x-amz-content-sha256;x-amz-date");
    // recalcul indépendant de la signature
    const hote = "compte-fictif.r2.cloudflarestorage.com";
    const canon = ["PUT", "/sauvegardes-fictives/usine/2026-11-11.sql.gz.enc", "", `host:${hote}`, `x-amz-content-sha256:${entree.sha256}`, "x-amz-date:20261111T023000Z", "", signees, entree.sha256].join("\n");
    const aSigner = ["AWS4-HMAC-SHA256", "20261111T023000Z", "20261111/auto/s3/aws4_request", createHash("sha256").update(canon).digest("hex")].join("\n");
    const k = hmac(hmac(hmac(hmac("AWS4SECRET_FICTIF", "20261111"), "auto"), "s3"), "aws4_request");
    expect(signature).toBe(createHmac("sha256", k).update(aSigner).digest("hex"));
  });

  it("ne met jamais le secret dans la configuration remise à curl, et n'écrit qu'un PUT", () => {
    const cfg = configurationCurl(signerDepot(entree), "/tmp/fichier-fictif");
    expect(cfg).not.toContain("SECRET_FICTIF");
    expect(cfg).toMatch(/request = "PUT"/);
    expect(cfg).toMatch(/upload-file = "\/tmp\/fichier-fictif"/);
    expect(cfg).toMatch(/fail/);
    expect(cfg).not.toMatch(/DELETE/i);
  });

  it("refuse une clé d'objet qui sort du dossier ou un compte douteux", () => {
    expect(() => signerDepot({ ...entree, cle: "../x" })).toThrow();
    expect(() => signerDepot({ ...entree, cle: "/x" })).toThrow();
    expect(() => signerDepot({ ...entree, compte: "a/b" })).toThrow();
  });
});

describe("scripts de sauvegarde (lecture du texte : aucun exécutable lancé)", () => {
  it("ne contiennent ni suppression, ni vidage, ni appel à Zernio, Waalaxy ou au fichier clients", () => {
    for (const f of SCRIPTS) {
      const t = lire(f);
      expect(t, f).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|\bDROP\b|--no-verify/i);
      expect(t, f).not.toMatch(/\brm\s|\bshred\b|\bunlink\b|\bdropdb\b|--delete|sync --delete/);
      expect(t, f).not.toMatch(/zernio|waalaxy|clients\.(csv|xlsx)/i);
    }
  });

  it("sauvegarder.sh : dump par docker, chiffré, envoyé par PUT, alerte par e-mail si échec, jamais de push", () => {
    const t = lire("deploiement/sauvegarder.sh");
    expect(t).toMatch(/set -euo pipefail/);
    expect(t).toMatch(/docker exec/);
    expect(t).toMatch(/pg_dump/);
    expect(t).toMatch(/openssl enc/);
    expect(t).toMatch(/copier-r2\.mjs/);
    expect(t).toMatch(/trap .*alerter.* ERR/);
    expect(t).toMatch(/SAUVEGARDE_ALERTE_EMAIL/);
    expect(t).toMatch(/mail -s/);
    expect(t).not.toMatch(/git push|\bcurl\b[^\n]*-X\s*(DELETE|POST)/);
  });

  it("restaurer-base.sh : restaure dans une base neuve et refuse d'écraser une base existante", () => {
    const t = lire("deploiement/restaurer-base.sh");
    expect(t).toMatch(/createdb/);
    expect(t).toMatch(/existe déjà/);
    expect(t).toMatch(/openssl enc -d/);
  });

  it("crontab : une seule ligne de nuit, vers sauvegarder.sh", () => {
    const l = lire("deploiement/crontab").split("\n").filter((x) => x.trim() && !x.startsWith("#") && !/^[A-Z_]+=/.test(x));
    expect(l).toHaveLength(1);
    expect(l[0]).toMatch(/^\d+ [0-3]? ?\* \* \* \S+ \S*deploiement\/sauvegarder\.sh/);
  });
});

describe("sauvegarder.sh LANCÉ avec faux docker, faux curl, faux mail (aucun réseau)", () => {
  let tmp: string;
  const jour = new Date().toISOString().slice(0, 10);
  const lireJournal = (n: string) => (existsSync(join(tmp, n)) ? readFileSync(join(tmp, n), "utf8") : "");
  const fichier = () => join(tmp, "sortie", `usine-${jour}.sql.gz.enc`);

  beforeEach(() => {
    tmp = mkdtempSync("/tmp/l704-");
    const bin = join(tmp, "bin");
    mkdirSync(bin);
    const faux = (nom: string, corps: string) => {
      writeFileSync(join(bin, nom), `#!/bin/sh\n${corps}\n`);
      chmodSync(join(bin, nom), 0o755);
    };
    faux("docker", 'echo "$@" >> "$TMP_FAUX/docker.log"\n[ -n "$FAUX_DOCKER_ECHEC" ] && exit 1\necho "-- dump fictif"');
    faux("curl", 'echo "$@" >> "$TMP_FAUX/curl.log"\ncat >> "$TMP_FAUX/curl.config"\nexit "${FAUX_CURL_RC:-0}"');
    faux("mail", 'echo "$@" >> "$TMP_FAUX/mail.log"\ncat >> "$TMP_FAUX/mail.log"');
    writeFileSync(join(tmp, "cle"), "cle fictive de test\n");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function lancer(env: Record<string, string> = {}) {
    const r = spawnSync("bash", [join(process.cwd(), "deploiement", "sauvegarder.sh")], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        SAUVEGARDE_ACTIVE: "1",
        PATH: `${join(tmp, "bin")}:${process.env.PATH}`,
        TMP_FAUX: tmp,
        SAUVEGARDE_ENV: join(tmp, "absent.env"),
        SAUVEGARDE_DOSSIER: join(tmp, "sortie"),
        SAUVEGARDE_CLE_FICHIER: join(tmp, "cle"),
        SAUVEGARDE_ALERTE_EMAIL: "alerte@example.com",
        R2_COMPTE: "compte-fictif", R2_BUCKET: "bucket-fictif", R2_ID_ACCES: "ID_FICTIF", R2_SECRET: "SECRET_FICTIF",
        ...env,
      },
    });
    return { rc: r.status, out: r.stdout, err: r.stderr };
  }

  it("dump réussi : fichier chiffré envoyé par un seul PUT, marque d'envoi posée, aucune alerte", () => {
    const r = lancer();
    expect(r.rc).toBe(0);
    expect(lireJournal("docker.log")).toContain("pg_dump");
    expect(lireJournal("curl.config")).toMatch(/request = "PUT"/);
    expect(lireJournal("curl.config")).not.toMatch(/DELETE/i);
    expect(lireJournal("curl.config")).not.toContain("SECRET_FICTIF");
    expect(existsSync(`${fichier()}.envoye`)).toBe(true);
    expect(lireJournal("mail.log")).toBe("");
  });

  it("éteinte par défaut : sans SAUVEGARDE_ACTIVE=1, ni dump ni envoi ni alerte", () => {
    const r = lancer({ SAUVEGARDE_ACTIVE: "" });
    expect(r.rc).toBe(0);
    expect(r.out).toContain("éteinte");
    expect(lireJournal("docker.log")).toBe("");
    expect(lireJournal("curl.log")).toBe("");
    expect(lireJournal("mail.log")).toBe("");
  });

  it("déjà envoyée : rien à faire, ni dump ni envoi", () => {
    expect(lancer().rc).toBe(0);
    const r = lancer();
    expect(r.rc).toBe(0);
    expect(lireJournal("docker.log").match(/pg_dump/g)).toHaveLength(1);
    expect(lireJournal("curl.log").match(/-K/g)).toHaveLength(1);
  });

  it("envoi en échec : alerte e-mail, sortie non nulle, pas de marque ; la relance refait SEULEMENT l'envoi", () => {
    const echec = lancer({ FAUX_CURL_RC: "22" });
    expect(echec.rc).not.toBe(0);
    expect(lireJournal("mail.log")).toContain("échec");
    expect(lireJournal("mail.log")).toContain("alerte@example.com");
    expect(existsSync(fichier())).toBe(true);
    expect(existsSync(`${fichier()}.envoye`)).toBe(false);

    const relance = lancer();
    expect(relance.rc).toBe(0);
    expect(lireJournal("docker.log").match(/pg_dump/g)).toHaveLength(1); // pas de second dump
    expect(lireJournal("curl.log").match(/-K/g)).toHaveLength(2); // l'envoi est refait
    expect(existsSync(`${fichier()}.envoye`)).toBe(true);
  });

  it("dump en échec : alerte, sortie non nulle, aucun fichier final ni envoi", () => {
    const r = lancer({ FAUX_DOCKER_ECHEC: "1" });
    expect(r.rc).not.toBe(0);
    expect(lireJournal("mail.log")).toContain("échec");
    expect(existsSync(fichier())).toBe(false);
    expect(lireJournal("curl.log")).toBe("");
  });

  it("sans adresse d'alerte, l'échec laisse quand même une ligne dans le journal du serveur", () => {
    const r = lancer({ FAUX_CURL_RC: "22", SAUVEGARDE_ALERTE_EMAIL: "" });
    expect(r.rc).not.toBe(0);
    expect(r.err).toContain("ALERTE");
    expect(lireJournal("mail.log")).toBe("");
  });

  it("n'efface rien du dossier de sortie", () => {
    lancer({ FAUX_CURL_RC: "22" });
    const avant = readdirSync(join(tmp, "sortie"));
    lancer();
    const apres = readdirSync(join(tmp, "sortie"));
    for (const f of avant) expect(apres).toContain(f);
  });
});

describe("clé d'objet et heure", () => {
  it("refuse « : » dans la clé d'objet (le chemin canonique n'est pas encodé)", () => {
    expect(() => signerDepot({ ...entree, cle: "usine/a:b" })).toThrow();
  });
  it("la crontab et la doc écrivent l'heure de Paris", () => {
    expect(lire("deploiement/crontab")).toMatch(/Paris/);
    expect(lire("docs/RESTAURATION.md")).toMatch(/Paris/);
  });
});
