// @vitest-environment jsdom
/** Revue #71 : pendant les 10 s, renoncer (« Revenir », interrupteur éteint, montant changé, page quittée) n'allume JAMAIS. */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormulairePlafond } from "@/app/reglages/plafond/FormulairePlafond";

const allumerAutonomie = vi.fn(async (_s: string, _c: string) => ({ ok: true, message: "ok" }));
const eteindreAutonomie = vi.fn(async () => ({ ok: true, message: "ok" }));
const enregistrerPlafondAutomatique = vi.fn(async (_s: string) => ({ ok: true, message: "ok" }));
vi.mock("@/app/reglages/plafond/actions", () => ({
  allumerAutonomie: (s: string, c: string) => allumerAutonomie(s, c),
  eteindreAutonomie: () => eteindreAutonomie(),
  enregistrerPlafondAutomatique: (s: string) => enregistrerPlafondAutomatique(s),
}));

let racine: Root;
let hote: HTMLElement;
const bouton = (t: string) => [...hote.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim().startsWith(t));
const toucher = (t: string) => {
  const b = bouton(t);
  expect(b, `bouton « ${t} »`).toBeTruthy();
  act(() => b!.click());
};
const interrupteur = () => hote.querySelector<HTMLInputElement>('input[role="switch"]')!;
const basculer = () => act(() => interrupteur().click());
const champ = () => hote.querySelector<HTMLInputElement>('input[type="text"]')!;
const saisir = (v: string) =>
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(champ(), v);
    champ().dispatchEvent(new Event("input", { bubbles: true }));
  });
const monter = (allume: boolean) => act(() => racine.render(createElement(FormulairePlafond, { allumeInitial: allume, initial: "20", resume: "Jusqu'à {plafond} €." })));

beforeEach(() => {
  vi.useFakeTimers();
  allumerAutonomie.mockClear();
  eteindreAutonomie.mockClear();
  enregistrerPlafondAutomatique.mockClear();
  hote = document.createElement("div");
  document.body.append(hote);
  racine = createRoot(hote);
});
afterEach(() => {
  act(() => racine.unmount());
  hote.remove();
  vi.useRealTimers();
});

const jusquAuDecompte = () => {
  monter(false);
  basculer();
  toucher("Continuer");
  toucher("Oui, allumer");
  expect(bouton("Annuler")).toBeTruthy();
};

describe("allumer : renoncer pendant le décompte n'allume jamais", () => {
  it("« Revenir », interrupteur éteint, montant changé : rien ne part, même après les 10 s", async () => {
    for (const geste of [() => toucher("Revenir"), () => basculer(), () => saisir("30")]) {
      allumerAutonomie.mockClear();
      jusquAuDecompte();
      geste();
      await act(async () => void vi.advanceTimersByTime(11_000));
      expect(allumerAutonomie).not.toHaveBeenCalled();
      act(() => racine.unmount());
      racine = createRoot(hote);
    }
  });
  it("page quittée pendant le décompte : rien ne part", async () => {
    jusquAuDecompte();
    act(() => void window.dispatchEvent(new Event("pagehide")));
    act(() => racine.unmount());
    expect(allumerAutonomie).not.toHaveBeenCalled();
  });
  it("sans geste : l'allumage part au bout de 10 s, avec « allumer »", async () => {
    jusquAuDecompte();
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(allumerAutonomie).toHaveBeenCalledTimes(1);
    expect(allumerAutonomie).toHaveBeenCalledWith("20", "allumer");
  });
  it("« Annuler » : rien ne part", async () => {
    jusquAuDecompte();
    toucher("Annuler");
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(allumerAutonomie).not.toHaveBeenCalled();
  });
  it("« Enregistrer le plafond » : rallumer l'interrupteur pendant le décompte n'envoie rien", async () => {
    monter(false);
    toucher("Enregistrer le plafond");
    basculer();
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(enregistrerPlafondAutomatique).not.toHaveBeenCalled();
  });
});
