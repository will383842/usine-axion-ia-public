// @vitest-environment jsdom
/** UO-03 · un seul geste à la fois : tant qu'un « Annuler » est offert, les autres « Refaire » de la page sont cachés. */
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoutonRefaire, GroupeRefaire } from "@/app/bibliotheque/BoutonRefaire";

const refaire = vi.fn<(id: string) => Promise<{ fait: boolean; message: string }>>(async () => ({ fait: true, message: "Noté." }));
vi.mock("@/app/bibliotheque/actions", () => ({ refaireAction: (id: string) => refaire(id) }));

let racine: Root;
let hote: HTMLElement;
const boutons = () => [...hote.querySelectorAll("button")];
const visibles = (t: string) => boutons().filter((b) => (b.textContent ?? "").trim().startsWith(t) && !b.closest("[hidden]") && !b.hidden);
const toucher = (t: string, rang = 0) => {
  const b = visibles(t)[rang];
  expect(b, `bouton « ${t} » visible`).toBeTruthy();
  act(() => b!.click());
};

beforeEach(() => {
  vi.useFakeTimers();
  refaire.mockClear();
  hote = document.createElement("div");
  document.body.append(hote);
  racine = createRoot(hote);
  act(() =>
    racine.render(createElement(GroupeRefaire, null, createElement(BoutonRefaire, { id: "L1-1" }), createElement(BoutonRefaire, { id: "L1-2" }))),
  );
});
afterEach(() => {
  act(() => racine.unmount());
  hote.remove();
  vi.useRealTimers();
});

describe("« Refaire » : un seul geste à la fois", () => {
  it("pendant l'attente, l'autre « Refaire » est caché ; « Annuler » le rend, rien ne part", async () => {
    expect(visibles("Refaire")).toHaveLength(2);
    toucher("Refaire", 0);
    expect(visibles("Refaire")).toHaveLength(0);
    expect(visibles("Annuler")).toHaveLength(1);
    toucher("Annuler");
    expect(visibles("Refaire")).toHaveLength(2);
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(refaire).not.toHaveBeenCalled();
  });

  it("laissé aller au bout : un seul appel, pour la bonne ligne ; les deux boutons reviennent ensuite", async () => {
    toucher("Refaire", 1);
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(refaire).toHaveBeenCalledTimes(1);
    expect(refaire).toHaveBeenCalledWith("L1-2");
    expect(hote.textContent).toContain("Noté.");
    expect(visibles("Refaire")).toHaveLength(2);
  });

  it("deux touchers rapprochés sur la même carte : un seul appel", async () => {
    toucher("Refaire", 0);
    expect(visibles("Refaire")).toHaveLength(0);
    await act(async () => void vi.advanceTimersByTime(11_000));
    expect(refaire).toHaveBeenCalledTimes(1);
  });
});
