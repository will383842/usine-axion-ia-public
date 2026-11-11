"use client";

import { useState, type InputHTMLAttributes } from "react";

/** Champ de mot de passe avec un bouton « œil » pour voir ce que l'on tape. */
export function ChampMotDePasse(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const { className, ...reste } = props;
  return (
    <div className="relative">
      <input {...reste} type={visible ? "text" : "password"} className={`${className ?? "champ"} w-full pr-14`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Cacher le mot de passe" : "Voir le mot de passe"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center px-3"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? null : <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
