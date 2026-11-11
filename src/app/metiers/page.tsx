import { redirect } from "next/navigation";

/** Ancienne adresse : « Mes métiers » est un onglet de « Mes idées de sujets ». */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/sujets?q=${encodeURIComponent(q)}` : "/sujets");
}
