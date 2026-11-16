// @vitest-environment jsdom
/** RC-17 · un seul geste à la fois par carte : pendant l'attente de « Valider », « Refuser » n'est pas proposé, et l'inverse. */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarteAValider, type DonneesCarte } from "@/app/a-valider/CarteAValider";

const valider = vi.fn(async () => ({ message: "Validé." }));
const refuser = vi.fn(async () => ({ message: "Refusé." }));
vi.mock("@/app/a-valider/actions", () => ({ validerAction: (...a: unknown[]) => valider(...(a as [])), refuserAction: (...a: unknown[]) => refuser(...(a as [])) }));

const carte: DonneesCarte = {
  cle: "a".repeat(64),
  reseau: "LinkedIn",
  compte: "Compte fictif",
  quand: "lundi 10 décembre, 09:30",
  texte: "Texte fictif",
  premierCommentaire: null,
  empreinte: "b".repeat(64),
  lienStudio: null,
  lienCalendrierStudio: "https://studio.example.com/calendrier",
  etat: "a_valider",
};

let racine: Root;
let hote: HTMLElement;
const boutons = () => [...hote.querySelectorAll("button")];
const visible = (t: string) => boutons().find((b) => (b.textContent ?? "").trim().startsWith(t) && !b.closest("[hidden]") && !b.hidden);
const toucher = (t: string) => {
  const b = visible(t);
  expect(b, `bouton « ${t} » visible`).toBeTruthy();
  act(() => b!.click());
};

beforeEach(() => {
  vi.useFakeTimers();
  valider.mockClear();
  refuser.mockClear();
  hote = document.createElement("div");
  document.body.append(hote);
  racine = createRoot(hote);
  act(() => racine.render(createElement(CarteAValider, { d: carte })));
});
afterEach(() => {
  act(() => racine.unmount());
  hote.remove();
  vi.useRealTimers();
});

describe("une carte, un seul geste à la fois", () => {
  it("pendant l'attente de « Valider », « Refuser » n'est pas proposé ; « Annuler » le rend, rien ne part", async () => {
    toucher("Refuser…");
    expect(visible("Refuser")).toBeTruthy();
    toucher("Valider");
    expect(visible("Refuser")).toBeUndefined();
    expect(visible("Refuser…")).toBeUndefined();
    toucher("Annuler");
    expect(visible("Refuser")).toBeTruthy();
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(valider).not.toHaveBeenCalled();
    expect(refuser).not.toHaveBeenCalled();
  });

  it("« Valider » laissé aller au bout : un seul appel, jamais de refus", async () => {
    toucher("Refuser…");
    toucher("Valider");
    expect(visible("Refuser")).toBeUndefined();
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(valider).toHaveBeenCalledTimes(1);
    expect(refuser).not.toHaveBeenCalled();
  });

  it("pendant l'attente de « Refuser », « Valider » n'est pas proposé ; un seul appel part", async () => {
    toucher("Refuser…");
    toucher("Refuser");
    expect(visible("Valider")).toBeUndefined();
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(refuser).toHaveBeenCalledTimes(1);
    expect(valider).not.toHaveBeenCalled();
  });
});
