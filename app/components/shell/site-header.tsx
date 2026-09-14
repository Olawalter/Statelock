"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/shell/logo";
import { NetworkNotices, NetworkPill } from "@/components/wallet/network-status";
import { WalletButton } from "@/components/wallet/wallet-button";

const NAV = [
  { href: "/commitments", label: "Commitments" },
  { href: "/create", label: "Create" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="STATELOCK home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"));
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-2 text-sm transition-colors ${
                  active ? "text-text" : "text-dim hover:text-text"
                }`}
              >
                {n.label}
                {active ? <span className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-signal" /> : null}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <NetworkPill />
          <WalletButton />
        </div>
      </div>
      <NetworkNotices />
    </header>
  );
}
