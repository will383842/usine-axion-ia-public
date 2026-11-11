import Link from "next/link";

export default function Introuvable() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-3xl font-bold">Cette page n&apos;existe pas</h1>
      <Link href="/" className="bouton">
        Revenir à Ma journée
      </Link>
    </section>
  );
}
