/** L7-04 · Sauvegarde nocturne : le script n'envoie qu'un dépôt (PUT), ne supprime rien, alerte en cas d'échec ; la signature est vérifiée sans réseau. */
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
