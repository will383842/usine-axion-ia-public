/**
 * Prépare le dépôt d'une sauvegarde chez R2 (compatible S3) : signe un PUT (SigV4) et écrit, sur la sortie, la
 * configuration que `curl -K -` envoie. Ce fichier n'ouvre aucune connexion (la règle sortante du dépôt l'interdit hors
 * de src/passerelles/) : l'envoi est fait par curl, appelé par sauvegarder.sh. Seul un PUT est signé, jamais autre chose.
 *
 * Variables (valeurs sur le serveur, jamais dans le dépôt) : R2_COMPTE, R2_BUCKET, R2_ID_ACCES, R2_SECRET.
 * Usage : node copier-r2.mjs <fichier-chiffré> <clé-d-objet>
 */
import { createHash, createHmac } from "node:crypto";
import { createReadStream, statSync } from "node:fs";

const hmac = (cle, donnee) => createHmac("sha256", cle).update(donnee).digest();
const sha = (t) => createHash("sha256").update(t).digest("hex");

/** Signe un PUT. `entree` : compte, bucket, cle, sha256 (du contenu), longueur, date, idAcces, secret. */
export function signerDepot({ compte, bucket, cle, sha256, longueur, date, idAcces, secret }) {
  if (!/^[a-z0-9-]+$/i.test(compte)) throw new Error("compte invalide");
  if (!/^[a-z0-9.-]+$/i.test(bucket)) throw new Error("bucket invalide");
  if (!/^[\w.:-]+(\/[\w.:-]+)*$/.test(cle) || cle.split("/").some((p) => p === "." || p === "..")) throw new Error("clé d'objet invalide");
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("empreinte invalide");
  const hote = `${compte}.r2.cloudflarestorage.com`;
  const chemin = `/${bucket}/${cle}`;
  const horodatage = date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const jour = horodatage.slice(0, 8);
  const portee = `${jour}/auto/s3/aws4_request`;
  const signees = "host;x-amz-content-sha256;x-amz-date";
  const canonique = ["PUT", chemin, "", `host:${hote}`, `x-amz-content-sha256:${sha256}`, `x-amz-date:${horodatage}`, "", signees, sha256].join("\n");
  const aSigner = ["AWS4-HMAC-SHA256", horodatage, portee, sha(canonique)].join("\n");
  const k = hmac(hmac(hmac(hmac(`AWS4${secret}`, jour), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", k).update(aSigner).digest("hex");
  return {
    methode: "PUT",
    url: `https://${hote}${chemin}`,
    longueur,
    entetes: {
      "x-amz-content-sha256": sha256,
      "x-amz-date": horodatage,
      authorization: `AWS4-HMAC-SHA256 Credential=${idAcces}/${portee}, SignedHeaders=${signees}, Signature=${signature}`,
    },
  };
}

/** Configuration `curl -K -` : échec franc sur toute erreur HTTP, redirections refusées, jamais le secret. */
export function configurationCurl(depot, fichier) {
  const l = ["fail", "silent", "show-error", `url = "${depot.url}"`, 'request = "PUT"', `upload-file = "${fichier}"`];
  for (const [nom, valeur] of Object.entries(depot.entetes)) l.push(`header = "${nom}: ${valeur}"`);
  return l.join("\n") + "\n";
}

function empreinte(fichier) {
  return new Promise((ok, ko) => {
    const h = createHash("sha256");
    createReadStream(fichier).on("data", (d) => h.update(d)).on("error", ko).on("end", () => ok(h.digest("hex")));
  });
}

async function principal([fichier, cle]) {
  const e = process.env;
  for (const n of ["R2_COMPTE", "R2_BUCKET", "R2_ID_ACCES", "R2_SECRET"]) if (!e[n]) throw new Error(`variable ${n} absente`);
  if (!fichier || !cle) throw new Error("usage : copier-r2.mjs <fichier> <clé>");
  const depot = signerDepot({
    compte: e.R2_COMPTE, bucket: e.R2_BUCKET, cle, sha256: await empreinte(fichier),
    longueur: statSync(fichier).size, date: new Date(), idAcces: e.R2_ID_ACCES, secret: e.R2_SECRET,
  });
  process.stdout.write(configurationCurl(depot, fichier));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  principal(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`copier-r2 : ${err.message}\n`);
    process.exit(1);
  });
}
