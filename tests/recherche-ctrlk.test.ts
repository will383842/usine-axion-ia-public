// @vitest-environment jsdom
import { createElement, act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RechercheCtrlK } from "@/components/gabarit/RechercheCtrlK";

const pousser = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pousser }) }));

function Hote() {
  const [ouvert, setOuvert] = useState(false);
  return createElement("div", { id: "page" }, createElement("button", { id: "depart", onClick: () => setOuvert(true) }, "Ouvrir"), createElement(RechercheCtrlK, { ouvert, surChangement: setOuvert }));
}

const touche = (cible: Element, key: string, extra: KeyboardEventInit = {}) => {
  act(() => {
    cible.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
  });
};

describe("RechercheCtrlK, rendue pour de vrai", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  it("la fenêtre n'est pas inert, la page l'est, Tab reste piégé, le focus revient à la fermeture", () => {
    const conteneur = document.createElement("div");
    document.body.appendChild(conteneur);
    const racine = createRoot(conteneur);
    act(() => racine.render(createElement(Hote)));
    const depart = document.getElementById("depart") as HTMLButtonElement;
    depart.focus();
    act(() => depart.click());

    const fenetre = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(fenetre).not.toBeNull();
    expect(fenetre.closest("[inert]")).toBeNull();
    expect(conteneur.inert).toBe(true);
    const champ = fenetre.querySelector("input") as HTMLInputElement;
    const fermer = fenetre.querySelector("button") as HTMLButtonElement;
    expect(document.activeElement).toBe(champ);

    fermer.focus();
    touche(fermer, "Tab");
    expect(document.activeElement).toBe(champ);
    touche(champ, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(fermer);

    touche(fermer, "Enter");
    expect(pousser).not.toHaveBeenCalled();

    touche(champ, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(conteneur.inert).toBe(false);
    expect(document.activeElement).toBe(depart);
    act(() => racine.unmount());
  });
});
