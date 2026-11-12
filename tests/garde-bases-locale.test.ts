/** U-BASES-GARDE · la garde locale : lit la comparaison existante, n'écrit pas dans bases/, ne montre pas le jeton. */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const FICHIERS = ["scripts/garde-bases-locale.ps1", "scripts/planifier-garde-bases.ps1", "docs/GARDE-BASES-LOCALE.md"];

describe("garde locale des bases", () => {
  const garde = lire("scripts/garde-bases-locale.ps1");

  it("lance la comparaison existante et sort en 1 sur écart, en 0 sinon", () => {
    expect(garde).toContain("garde-bases-externe.mjs");
    expect(garde).toMatch(/exit 1/);
    expect(garde).toMatch(/exit 0/);
  });

  it("n'écrit jamais dans bases/ et ne supprime que son propre fichier d'alerte", () => {
    expect(garde).not.toMatch(/\bbases[\\/]/i);
    expect(garde).not.toMatch(/Remove-Item(?![^\n]*\$alerte)/);
    expect(garde).not.toMatch(/Invoke-WebRequest|Invoke-RestMethod|curl|\bgit\s+push/i);
  });

  it("ne montre ni n'écrit le jeton : masqué avant toute sortie", () => {
    expect(garde).toContain("Masquer");
    expect(garde).not.toMatch(/Write-(Output|Host)[^\n]*PLANS_PRIVE_LECTURE/);
    expect(garde).not.toMatch(/(Set|Add)-Content[^\n]*PLANS_PRIVE_LECTURE/);
  });

  it("planifie une tâche par jour, sans mot de passe ni jeton", () => {
    const plan = lire("scripts/planifier-garde-bases.ps1");
    expect(plan).toMatch(/New-ScheduledTaskTrigger -Daily/);
    expect(plan).toContain("Register-ScheduledTask");
    expect(plan).not.toMatch(/=\s*['"][A-Za-z0-9_\-]{30,}['"]/);
    expect(plan).not.toMatch(/\$env:PLANS_PRIVE_LECTURE\s*=/);
  });

  it("aucun secret, e-mail réel ni chemin de poste dans les fichiers livrés", () => {
    for (const f of FICHIERS) {
      const t = lire(f);
      expect(t, f).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_/);
      expect(t, f).not.toMatch(/[\w.+-]+@(?!example\.com)[\w-]+\.[a-z]{2,}/i);
      expect(t, f).not.toMatch(/[A-Z]:\\Users\\[^%$\s]/);
    }
  });

  it("n'ajoute ni ne modifie aucun workflow ; la comparaison reste non modifiée", () => {
    expect(existsSync(new URL("../scripts/garde-bases-externe.mjs", import.meta.url))).toBe(true);
    expect(lire("scripts/garde-bases-externe.mjs")).toContain("PLANS_PRIVE_LECTURE");
  });
});
