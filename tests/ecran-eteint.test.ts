/** T23 · « Allumer cet écran » refuse sans session. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const modifier = vi.fn();
vi.mock("@/services/auth", () => ({
  exigerSession: vi.fn(async () => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/donnees", () => ({
  depots: { interrupteur: { lire: vi.fn(), modifier } },
  journaliser: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("allumer cet écran", () => {
  beforeEach(() => modifier.mockClear());
  it("refuse sans session, sans rien modifier", async () => {
    const { allumerEcran, allumerTousLesEcrans } = await import("@/components/gabarit/actions");
    await expect(allumerEcran("calendrier")).rejects.toThrow();
    await expect(allumerTousLesEcrans()).rejects.toThrow();
    expect(modifier).not.toHaveBeenCalled();
  });
});
