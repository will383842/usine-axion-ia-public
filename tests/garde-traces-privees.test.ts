/** L7-02 · La garde refuse tout fichier qui nomme le dépôt privé des plans. */
import { describe, expect, it } from "vitest";
import { fautesTracesPrivees } from "../scripts/garde-sortante.mjs";

// Le nom est assemblé ici : ce fichier, lu lui aussi par la garde, ne le contient pas.
const NOM = ["axion", "plans", "prive"].join("-");

describe("traces du dépôt privé", () => {
  it("refuse un fichier factice qui contient le nom, quel que soit le type de fichier", () => {
    for (const f of ["src/lib/a.ts", "README.md", "scripts/a.sh", "bases.source.json", "pnpm-lock.yaml"]) {
      expect(fautesTracesPrivees(f, `ligne 1\nvoir ${NOM}/usine\n`).length, f).toBe(1);
    }
  });

  it("refuse aussi les variantes de casse et de séparateur", () => {
    expect(fautesTracesPrivees("a.md", NOM.toUpperCase()).length).toBe(1);
    expect(fautesTracesPrivees("a.md", NOM.replaceAll("-", "_")).length).toBe(1);
  });

  it("indique le fichier et la ligne", () => {
    expect(fautesTracesPrivees("a.md", `x\n${NOM}`)[0]).toContain("a.md:2");
  });

  it("laisse passer un fichier sans trace", () => {
    expect(fautesTracesPrivees("a.ts", "const jeton = process.env.PLANS_PRIVE_LECTURE;\n")).toEqual([]);
  });
});
