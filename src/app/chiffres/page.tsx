import { redirect } from "next/navigation";

/** Ancienne adresse : les demandes reçues sont un onglet de « Mes mots et cadeaux ». */
export default async function Page({ searchParams }: { searchParams: Promise<{ semaine?: string }> }) {
  const { semaine } = await searchParams;
  redirect(`/mots?onglet=demandes${semaine ? `&semaine=${encodeURIComponent(semaine)}` : ""}`);
}
