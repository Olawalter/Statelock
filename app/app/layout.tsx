import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const martian = Martian_Mono({ variable: "--font-martian", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "STATELOCK — Lock the condition. Let reality decide.",
  description:
    "Precommit a real-world condition, freeze the rules, and let GenLayer adjudicate the outcome from live external information.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <AppProviders>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </AppProviders>
      </body>
    </html>
  );
}
