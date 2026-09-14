import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { defineChain, type EIP1193Provider } from "viem";

import type { AppConfig } from "@/lib/config";

/**
 * GenLayer clients. Reads go straight to the configured RPC. Writes are
 * signed by the user's own injected wallet: the client is given the
 * connected ADDRESS and that wallet's EIP-1193 provider, so genlayer-js
 * hands the transaction to the wallet with `eth_sendTransaction`. No private
 * key exists anywhere in this application.
 */

/** genlayer-js's StudioNet definition with the configured RPC — cloned, never mutated. */
export function genlayerChain(config: AppConfig) {
  return {
    ...studionet,
    id: config.chainId,
    rpcUrls: { default: { http: [config.rpcUrl] } },
  } as typeof studionet;
}

/** The same network as wagmi sees it, so wallets can be asked to add or switch to it. */
export function walletChain(config: AppConfig) {
  return defineChain({
    id: config.chainId,
    name: "GenLayer StudioNet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: { default: { name: "GenLayer Explorer", url: "https://explorer-studio.genlayer.com" } },
    testnet: true,
  });
}

export type GenLayerClient = ReturnType<typeof createClient>;

export function readClient(config: AppConfig): GenLayerClient {
  return createClient({ chain: genlayerChain(config) });
}

type ProviderArg = NonNullable<Parameters<typeof createClient>[0]>["provider"];

export function writeClient(config: AppConfig, account: `0x${string}`, provider: EIP1193Provider): GenLayerClient {
  return createClient({ chain: genlayerChain(config), account, provider: provider as ProviderArg });
}
