"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";

import { ConfigProblem } from "@/components/wallet/config-problem";
import { TooltipProvider } from "@/components/ui/tooltip";
import { configResult, type AppConfig } from "@/lib/config";
import { readClient, type GenLayerClient } from "@/lib/genlayer/client";
import { wagmiConfig } from "@/lib/wallet/wagmi";
import { TxProvider } from "@/providers/tx-provider";

type Statelock = { config: AppConfig; client: GenLayerClient };

const StatelockContext = createContext<Statelock | null>(null);

export function useStatelock(): Statelock {
  const ctx = useContext(StatelockContext);
  if (!ctx) throw new Error("useStatelock outside AppProviders");
  return ctx;
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!configResult.ok) return <ConfigProblem problems={configResult.problems} />;
  return <Configured config={configResult.config}>{children}</Configured>;
}

function Configured({ config, children }: { config: AppConfig; children: ReactNode }) {
  // StudioNet rate-limits per IP (30/minute): calm defaults, no focus refetch storms
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  const [wagmi] = useState(() => wagmiConfig(config));
  const [value] = useState<Statelock>(() => ({ config, client: readClient(config) }));

  return (
    <WagmiProvider config={wagmi}>
      <QueryClientProvider client={queryClient}>
        <StatelockContext.Provider value={value}>
          <TooltipProvider>
            <TxProvider>{children}</TxProvider>
          </TooltipProvider>
        </StatelockContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
