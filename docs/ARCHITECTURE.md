# STATELOCK architecture

STATELOCK has two parts and no third: a GenLayer Intelligent Contract
(`contracts/statelock.py`) and a static Next.js frontend (`app/`) that reads from and writes to
it through the user's own wallet. There is no backend, database, indexer, cron job, server
signer or oracle.

```
 browser ─────────────────────────────────────────────────────────────────────────────┐
 │  Next.js app (presentation only)                                                    │
 │    reads ── genlayer-js readContract / getContractSchema / getTransaction ──┐       │
 │    writes ─ genlayer-js writeContract → injected wallet (EIP-6963) ──┐      │       │
 └────────────────────────────────────────────────────────────────────┼──────┼───────┘
                                                                      ▼      ▼
                                                   GenLayer StudioNet (chain 61999)
                                                   ┌──────────────────────────────────┐
                                                   │ Statelock contract               │
                                                   │  deterministic: terms, ledger,   │
                                                   │  lifecycle, verdict derivation,  │
                                                   │  finality gate, settlement       │
                                                   │  nondeterministic: fetch allowed │
                                                   │  sources + model findings        │──► allowed https sources
                                                   └──────────────────────────────────┘
```

## Why GenLayer is required

The question STATELOCK settles — *did this real-world condition happen by the deadline,
according to these sources?* — has no deterministic answer on-chain. It needs someone to read
live web pages and interpret them. Anywhere else that someone is a trusted party: an oracle
operator, a backend, a model API key holder. On GenLayer the reading is done independently by
the transaction's leader and every validator, and the result only stands if they agree, under
the protocol's own appeal and finality rules. The contract can therefore hold a bounty against
the outcome without trusting any single reader, including whoever runs this website.

## Deterministic execution

Everything with an economic or procedural consequence is ordinary deterministic contract code,
executed identically by every node:

- identity and parties (`gl.message.sender_address` at creation is the creator);
- the frozen terms, their canonical policy and the `terms_hash` checked on every transition;
- time — the GenLayer transaction's datetime, read through `datetime.now(timezone.utc)`;
- the lifecycle state machine and who may call what;
- the ledger — deposits are `gl.message.value`, never an argument;
- **the verdict derivation** (`_derive`): the model's findings go in, the verdict comes out of
  code under fixed rules;
- the finality gate and exactly-once settlement to a destination fixed by a constant table.

## Nondeterministic execution

Exactly one method, `observe_condition`, contains nondeterminism, and the nondeterministic block
does exactly two things: fetch the policy's sources and ask a model what they show about each
required fact. It never returns an amount, recipient, deadline, source or verdict of its own.

## Web observation

`gl.nondet.web.get(url, headers=…)` for each source frozen in the policy — never a URL from a
page, a parameter, or the model. A source counts as readable only with HTTP 2xx and a body of
1 byte to 1 MB. Text is extracted (JSON compacted in key order; HTML without scripts, styles and
tags), stripped of control characters and of the `<<<` / `>>>` fence markers, and capped at
6000 characters per source. What each node could read is part of the result and must agree.

## LLM adjudication

`gl.nondet.exec_prompt(prompt, response_format="json")`. The prompt states the order of
authority (instructions and frozen terms, then creator instructions, then evidence as untrusted
data), gives the terms as canonical JSON, and places each readable source in its own fence.
The model returns reasoning first and then, per required fact, a status (CONFIRMED /
CONTRADICTED / NOT_FOUND), the value shown, the source ids supporting or contradicting it, and
an event time. Findings are validated strictly; malformed output raises `[LLM_ERROR]`, which
makes validators disagree and rotates the leader rather than recording garbage.

The model reports; code decides. See the rule table in [CONTRACT.md](CONTRACT.md#observation-and-results).

## Equivalence Principle

Implemented with `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` — a custom validator, the
pattern GenLayer's documentation recommends when outputs are not byte-identical.

- `leader_fn` fetches, extracts, reads and derives the result.
- `validator_fn` does **all of that again independently** — its own fetches, its own model
  call, its own derivation — and returns `True` only if its complete stored result equals the
  leader's: verdict, reason, temporal result, conclusiveness, each fact's stored status / value
  / independence, and the list of readable sources. It never adopts the leader's findings.
- If the leader errored, `_handle_leader_error` reruns and agrees only on an identical
  `[EXPECTED]` / `[EXTERNAL]` refusal or two `[TRANSIENT]` failures.

Consensus is required on what has a consequence, and only that. The comparison therefore
covers every stored field but nothing more: the model's prose, the exact wording of a value
(the stored value is the policy's expected value once confirmed), which of several supporting
sources a reader cited, and whether a non-confirmed fact was "contradicted" or merely "not
found" (both stored as `NOT_CONFIRMED`) are not compared, because none of them changes a result.
Independence is compared only when the policy requires it.

## Optimistic Democracy

STATELOCK adds no consensus of its own. Each `observe_condition` transaction goes through
GenLayer's protocol as-is: a leader proposes, validators commit and reveal votes, the
transaction is ACCEPTED on a majority, and it stays appealable for the network's finality
window before becoming FINALIZED. An appeal re-runs the transaction with a larger validator set.
The application never simulates votes or overrides a result.

## Finality

Two layers, deliberately separate:

1. **Protocol finality** of the observation transaction (ACCEPTED → FINALIZED; StudioNet reports
   `sim_getFinalityWindowTime` = 30 s). Contract code cannot read another transaction's protocol
   status.
2. **Contract finality**: a conclusive result sets `ACCEPTED` with `accepted_at`, and
   `finalize_condition` is refused until `accepted_at + 600 s` — twenty times the protocol
   window — so the observation that produced the result has finalized (or been appealed and
   re-executed) before anything can settle on it.

The frontend shows both: each transaction's GenLayer status (pending consensus, accepted with
the appeal window open, under appeal, finalized) and the contract's own ACCEPTED / FINALIZED
state with the time the delay ends.

A condition nobody observes conclusively within the deadline plus seven days finalizes as
`UNDETERMINED` / `NOT_OBSERVED`, so no bounty can be stranded by inaction.

## Settlement

`settle_condition` is permissionless and runs once. From `FINALIZED` it validates the verdict,
refuses a second settlement, reads the ledger, fixes the destination from the constant
consequence table, zeroes the ledger, records the settlement, marks `SETTLED`, and only then
emits the transfer with `_Recipient(to).emit_transfer(value=…)` on an empty
`@gl.evm.contract_interface`. `cancel_condition` refunds a funded, unarmed commitment the same
way.

## Frontend

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Lucide · wagmi 3
+ viem 2 with EIP-6963 discovery · TanStack Query 5 · Zod 4 · genlayer-js 1.1.8.

| Concern | Where |
|---|---|
| Public configuration, validated with Zod (chain must be 61999, https RPC, non-zero address) | `app/lib/config.ts` |
| Contract interface, Zod schemas for every view, deployment check against GenLayer's schema | `app/lib/contracts/statelock.ts` |
| Read client and wallet-signing write client | `app/lib/genlayer/client.ts` |
| Transaction lifecycle (READY → AWAITING WALLET → USER CONFIRMED → SUBMITTED → CONFIRMING → CONFIRMED → CONTRACT STATE UPDATED, or FAILED) and GenLayer finality | `app/lib/genlayer/tx.ts` |
| Wallet / network / contract pre-flight before any signature | `app/lib/wallet/preflight.ts` |
| Creation-form checks mirroring the contract (advisory; the contract decides) | `app/lib/validation/commitment.ts` |

Writes: genlayer-js is given the connected **address** and the chosen wallet's EIP-1193
provider, so it hands `eth_sendTransaction` to the wallet. genlayer-js skips its own chain check
on Studio networks, so the app refuses to send unless the wallet reports chain 61999 and the
configured address has passed the deployment check. A write is reported as done only once the
contract's own view shows its effect.

Reads: every state shown comes from contract views. Transaction hashes for a commitment come
from StudioNet's `sim_getTransactionsForAddress`, decoded with genlayer-js's calldata decoder —
the chain's history, not a database.

## Research record (Phase 1)

What was verified before and during implementation, and how:

| Item | Verified by |
|---|---|
| Runner pin `py-genlayer:1jb45aa8…` | GenLayer's contract-writing guidance and deployment behaviour on StudioNet; `genvm-lint 0.11.0` validates the contract. The linter's informational `I200` names a newer runner (`1zr6nqk5…`), which ships the renamed SDK layout (`import genlayer as gl`, `gl.contract.Contract`); `genlayer-test 0.29.2` direct mode patches only the `genlayer.gl.vm` layout of the pinned runner, so the pinned runner is the one the official test tooling here can execute. Kept deliberately. |
| `gl.vm.run_nondet_unsafe`, `gl.vm.Return`, `gl.vm.UserError` | GenLayer Equivalence Principle documentation; exercised in direct tests with `direct_vm.run_validator()` |
| `gl.nondet.web.get` → `status`, `headers`, `body` bytes | runner standard library; direct-mode web mocks |
| `gl.nondet.exec_prompt(…, response_format="json")` | runner standard library; direct-mode LLM mocks; live runs |
| Transaction time through `datetime.now()` | GenLayer transaction-context documentation; live-proven equal to the transaction's `created_timestamp` on StudioNet in an earlier build |
| `@gl.evm.contract_interface` + `emit_transfer(value=)` | runner standard library source: issues `EthSend` with address and value; an `on=` stage is not read on this runner, hence the contract's own FINALIZED gate |
| `gl.message.value` on `@gl.public.write.payable` | direct tests; live funding refusals (1 atto short is refused) |
| genlayer-js 1.1.8 `createClient({chain, account, provider})`, `writeContract({value})`, `readContract({jsonSafeReturn})`, `getContractSchema`, `getTransaction`, `abi.calldata.decode` | the package's type definitions and compiled source in `app/node_modules/genlayer-js/dist`; `app/tests/signed-write.test.ts` drives the real client |
| StudioNet chain id, RPC, finality window | genlayer-js `studionet` chain definition; `sim_getFinalityWindowTime` = 30 |
| Contract schema the app binds to | `gen_getContractSchemaForCode` for the committed source (`app/tests/fixtures/statelock-schema.json`), re-checked at runtime with `gen_getContractSchema` on the configured address |
| Appeal behaviour on StudioNet | observed live and reproduced on a trivial contract — see [E2E.md](E2E.md#appeals-on-studionet) |
