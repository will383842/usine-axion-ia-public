import { redirect } from "next/navigation";

/** Ancienne adresse : les nouveautés sont un onglet de « Mes idées de sujets ». */
export default function Page() {
  redirect("/sujets?onglet=nouveautes");
}
