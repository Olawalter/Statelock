"use client";

import { EXPLORER_URL } from "@/lib/config";
import { useStatelock } from "@/providers/app-providers";

export function SiteFooter() {
  const { config } = useStatelock();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs text-dim sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>No backend. No admin. Every state shown is read from the contract on GenLayer StudioNet.</p>
        <a
          className="font-mono break-all hover:text-signal"
          href={`${EXPLORER_URL}/address/${config.contractAddress}`}
          target="_blank"
          rel="noreferrer"
        >
          Contract {config.contractAddress}
        </a>
      </div>
    </footer>
  );
}
