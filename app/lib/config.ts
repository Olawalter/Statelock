import { z } from "zod";

/**
 * Public configuration, validated once. The app refuses to run against a
 * chain or contract it cannot name: a missing or malformed value renders a
 * configuration page instead of a half-working interface.
 */

export const STUDIONET_CHAIN_ID = 61999;

const schema = z.object({
  chainId: z.coerce
    .number({ message: "NEXT_PUBLIC_GENLAYER_CHAIN_ID must be a number" })
    .int()
    .refine((id) => id === STUDIONET_CHAIN_ID, {
      message: `NEXT_PUBLIC_GENLAYER_CHAIN_ID must be ${STUDIONET_CHAIN_ID} (GenLayer StudioNet), the network STATELOCK is deployed on`,
    }),
  rpcUrl: z
    .string({ message: "NEXT_PUBLIC_GENLAYER_RPC_URL is not set" })
    .url("NEXT_PUBLIC_GENLAYER_RPC_URL must be a URL")
    .refine((u) => u.startsWith("https://"), "NEXT_PUBLIC_GENLAYER_RPC_URL must use https"),
  contractAddress: z
    .string({ message: "NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS is not set" })
    .regex(/^0x[0-9a-fA-F]{40}$/, "NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS must be a 20-byte hex address")
    .refine((a) => !/^0x0{40}$/.test(a), "NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS cannot be the zero address"),
});

export type AppConfig = z.infer<typeof schema> & { contractAddress: `0x${string}` };

export type ConfigResult = { ok: true; config: AppConfig } | { ok: false; problems: string[] };

export function parseConfig(env: Record<string, string | undefined>): ConfigResult {
  const parsed = schema.safeParse({
    chainId: env.NEXT_PUBLIC_GENLAYER_CHAIN_ID,
    rpcUrl: env.NEXT_PUBLIC_GENLAYER_RPC_URL || undefined,
    contractAddress: env.NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS || undefined,
  });
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
  return { ok: true, config: parsed.data as AppConfig };
}

// Next inlines NEXT_PUBLIC_* only when each is referenced by its full name.
export const configResult = parseConfig({
  NEXT_PUBLIC_GENLAYER_CHAIN_ID: process.env.NEXT_PUBLIC_GENLAYER_CHAIN_ID,
  NEXT_PUBLIC_GENLAYER_RPC_URL: process.env.NEXT_PUBLIC_GENLAYER_RPC_URL,
  NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS: process.env.NEXT_PUBLIC_STATELOCK_CONTRACT_ADDRESS,
});

export const EXPLORER_URL = "https://explorer-studio.genlayer.com";
