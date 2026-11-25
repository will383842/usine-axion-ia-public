// @vitest-environment jsdom
/** t70 · pendant les 10 s de « Oui, allumer », aucun geste ne démonte le décompte en jouant l'allumage : renoncer n'envoie jamais rien. */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoutonEteindre, FormulairePlafond } from "@/app/reglages/plafond/FormulairePlafond";

const allumerAutonomie = vi.fn(async (..._a: unknown[]) => ({ ok: true, message: "Autonomie allumée : fictif." }));
const enregistrerPlafondAutomatique = vi.fn(async (..._a: unknown[]) => ({ ok: true, message: "Plafond accepté : fictif." }));
const eteindreAutonomie = vi.fn(async () => ({ ok: true, message: "Autonomie éteinte." }));
vi.mock("@/app/reglages/plafond/actions", () => ({
  allumerAutonomie: (...a: unknown[]) => allumerAutonomie(...a),
  enregistrerPlafondAutomatique: (...a: unknown[]) => enregistrerPlafondAutomatique(...a),
  eteindreAutonomie: () => eteindreAutonomie(),
}));

let racine: Root;
let hote: HTMLElement;
const boutons = () => [...hote.querySelectorAll("button")];
const bouton = (t: string) => boutons().find((b) => (b.textContent ?? "").trim().startsWith(t));
const toucher = (t: string) => {
  const b = bouton(t);
  expect(b, `bouton « ${t} » présent`).toBeTruthy();
  act(() => b!.click());
};
const interrupteur = () => hote.querySelector<HTMLInputElement>('input[role="switch"]')!;
const montantChamp = () => hote.querySelector<HTMLInputElement>('input[type="text"]')!;
const basculer = () => act(() => interrupteur().click());
const monter = (allume: boolean) => act(() => racine.render(createElement(FormulairePlafond, { allumeInitial: allume, initial: "20", resume: "Résumé fictif {plafond} €." })));
const laisserPasser = async (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  allumerAutonomie.mockClear();
  enregistrerPlafondAutomatique.mockClear();
  eteindreAutonomie.mockClear();
  hote = document.createElement("div");
  document.body.append(hote);
  racine = createRoot(hote);
});
afterEach(() => {
  act(() => racine.unmount());
  hote.remove();
  vi.useRealTimers();
});

const demarrerAllumage = () => {
  monter(false);
  basculer(); // interrupteur sur allumé
  toucher("Continuer");
  toucher("Oui, allumer");
};

describe("allumer : renoncer pendant les 10 s n'envoie rien", () => {
  it("« Revenir » est verrouillé pendant le décompte ; rien ne part", async () => {
    demarrerAllumage();
    expect(bouton("Revenir")!.disabled).toBe(true);
    toucher("Revenir");
    await laisserPasser(500);
    expect(allumerAutonomie).not.toHaveBeenCalled();
    expect(bouton("Annuler")).toBeTruthy();
  });
  it("interrupteur et montant sont verrouillés pendant le décompte", async () => {
    demarrerAllumage();
    expect(interrupteur().disabled).toBe(true);
    expect(montantChamp().disabled).toBe(true);
    basculer(); // un clic sur un champ verrouillé ne fait rien
    await laisserPasser(500);
    expect(allumerAutonomie).not.toHaveBeenCalled();
    expect(bouton("Annuler")).toBeTruthy();
  });
  it("quitter la page (démontage) pendant le décompte n'allume pas", async () => {
    demarrerAllumage();
    act(() => racine.unmount());
    await laisserPasser(11_000);
    expect(allumerAutonomie).not.toHaveBeenCalled();
    racine = createRoot(hote);
  });
  it("« pagehide » pendant le décompte n'allume pas, et le retour sur la page (cache arrière) est remis à zéro", async () => {
    demarrerAllumage();
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await laisserPasser(11_000);
    expect(allumerAutonomie).not.toHaveBeenCalled();
    expect(bouton("Annuler")).toBeUndefined();
    expect(bouton("Oui, allumer")).toBeTruthy();
    expect(interrupteur().disabled).toBe(false);
    expect(montantChamp().disabled).toBe(false);
    expect(bouton("Revenir")!.disabled).toBe(false);
  });
  it("« pagehide » puis retour par le cache (bfcache) : le décompte n'est plus affiché, les champs sont libres", () => {
    demarrerAllumage();
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(bouton("Annuler")).toBeUndefined();
    expect(interrupteur().disabled).toBe(false);
    expect(montantChamp().disabled).toBe(false);
  });
  it("« Annuler » : rien ne part ; sans geste, l'allumage part après 10 s, avec le montant saisi, et le message de réussite reste affiché", async () => {
    demarrerAllumage();
    toucher("Annuler");
    await laisserPasser(11_000);
    expect(allumerAutonomie).not.toHaveBeenCalled();
    toucher("Oui, allumer");
    await laisserPasser(10_500);
    expect(allumerAutonomie).toHaveBeenCalledTimes(1);
    expect(allumerAutonomie).toHaveBeenCalledWith("20", "allumer");
    expect(hote.textContent).toContain("Autonomie allumée : fictif.");
  });
});

describe("plafond seul : rallumer l'interrupteur pendant le décompte n'envoie rien tout de suite", () => {
  it("interrupteur verrouillé pendant le décompte", async () => {
    monter(false);
    toucher("Enregistrer le plafond");
    expect(interrupteur().disabled).toBe(true);
    basculer();
    await laisserPasser(500);
    expect(enregistrerPlafondAutomatique).not.toHaveBeenCalled();
    toucher("Annuler");
    expect(interrupteur().disabled).toBe(false);
  });
});

describe("« Enregistrer le plafond » : quitter la page n'envoie rien", () => {
  it("démontage et « pagehide » pendant le décompte : aucun envoi, écran remis à zéro", async () => {
    monter(false);
    toucher("Enregistrer le plafond");
    act(() => void window.dispatchEvent(new Event("pagehide")));
    await laisserPasser(11_000);
    expect(enregistrerPlafondAutomatique).not.toHaveBeenCalled();
    expect(bouton("Enregistrer le plafond")).toBeTruthy();
    expect(interrupteur().disabled).toBe(false);
    toucher("Enregistrer le plafond");
    act(() => racine.unmount());
    await laisserPasser(11_000);
    expect(enregistrerPlafondAutomatique).not.toHaveBeenCalled();
    racine = createRoot(hote);
  });
  it("sans quitter, l'envoi part au bout de 10 s", async () => {
    monter(false);
    toucher("Enregistrer le plafond");
    await laisserPasser(10_500);
    expect(enregistrerPlafondAutomatique).toHaveBeenCalledTimes(1);
  });
});

describe("bouton d'urgence « Éteindre maintenant » : il dit son résultat", () => {
  const monterBouton = () => act(() => racine.render(createElement(BoutonEteindre)));
  const toucherAsync = async () => act(async () => void bouton("Éteindre maintenant")!.click());
  it("réussite, échec et exception : un message à chaque fois", async () => {
    monterBouton();
    await toucherAsync();
    expect(hote.textContent).toContain("Autonomie éteinte.");
    eteindreAutonomie.mockResolvedValueOnce({ ok: false, message: "Le Studio ne répond pas : l'extinction n'est pas confirmée." });
    await toucherAsync();
    expect(hote.textContent).toContain("l'extinction n'est pas confirmée");
    expect(hote.querySelector('[role="alert"]')).toBeTruthy();
    eteindreAutonomie.mockRejectedValueOnce(new Error("réseau"));
    await toucherAsync();
    expect(hote.textContent).toMatch(/n'est pas confirmée : l'autonomie peut encore être allumée/);
    expect(bouton("Éteindre maintenant")!.disabled).toBe(false);
  });
});
