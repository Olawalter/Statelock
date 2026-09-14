import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

import type { AppConfig } from "@/lib/config";
import { walletChain } from "@/lib/genlayer/client";

/**
 * Injected wallets only. EIP-6963 discovery is on, so Rabby, MetaMask, Trust
 * Wallet, Coinbase Wallet and any other extension that announces itself
 * appears by name; the generic injected connector covers a wallet that only
 * sets window.ethereum. Nothing here holds or asks for a key.
 */
export function wagmiConfig(config: AppConfig) {
  const chain = walletChain(config);
  return createConfig({
    chains: [chain],
    connectors: [injected()],
    multiInjectedProviderDiscovery: true,
    transports: { [chain.id]: http(config.rpcUrl) },
    ssr: true,
  });
}
