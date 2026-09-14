# STATELOCK security

## Invariants

These hold for every condition, from every caller, at every stage. Each is enforced in
deterministic contract code and covered by the tests named in the matrix below.

1. **Terms are immutable.** No method changes the condition text, policy, time boundary,
   bounty terms, beneficiary or consequence after creation; every transition re-hashes the
   policy and terms and refuses on any difference. Arming is the point after which nothing,
   including cancellation, is possible.
2. **Full funding before ARM.** A deposit is `gl.message.value` and must equal the bounty terms
   exactly; `arm_condition` requires the deposit to equal the terms.
3. **The bounty cannot leave early.** From ARMED until FINALIZED no method transfers value.
4. **The model never controls money.** The nondeterministic block returns per-fact findings
   only. Amount, recipient, deadline, sources and the consequence table are contract constants
   or frozen terms; the verdict is derived in code.
5. **Consensus-bound results.** Every field of a stored observation is compared by every
   validator against its own independent fetch, reading and derivation.
6. **Uncertainty is never forced into a result.** Unreadable, conflicting, undated or
   insufficiently independent evidence is UNDETERMINED; a conclusive SATISFIED or NOT_SATISFIED
   needs every allowed source readable.
7. **Settlement waits for finality.** Only FINALIZED settles, and FINALIZED is reachable only
   600 s after the result was accepted (or after the observation period expired unobserved).
8. **Exactly once.** Settlement zeroes the ledger and marks SETTLED before the transfer is
   emitted; a second attempt fails at the status check.
9. **No privileged party.** The contract has no owner, admin, pause, upgrade or override.
   `settle_condition`, `finalize_condition` and `observe_condition` are permissionless, and
   their outcome does not depend on who calls.
10. **No stranded bounty.** A condition never conclusively observed finalizes as
    UNDETERMINED / NOT_OBSERVED after the deadline plus seven days and refunds the creator.

## Security test matrix (build prompt §43)

Direct tests: `tests/direct/` (GenLayer `genlayer-test` direct mode; web and model mocked with
the official mechanisms). Live tests: `tests/integration/` on StudioNet. Frontend tests:
`app/tests/`.

| Attack / failure | Protection | Tests |
|---|---|---|
| Change condition, deadline, beneficiary or policy after ARM | no method writes a term; terms hash checked on every transition | `test_no_method_can_change_a_term`, `test_armed_terms_survive_every_write_from_every_party`, `test_terms_survive_observation_finality_and_settlement`, `test_arm_freezes_the_commitment` |
| Withdraw bounty early | cancel only from DRAFT/FUNDED; no transfer before FINALIZED | `test_armed_bounty_cannot_be_withdrawn`, `test_no_early_withdrawal_at_any_locked_stage`; live `test_an_armed_bounty_cannot_be_withdrawn` |
| Double settlement | SETTLED + ledger zeroed before transfer | `test_settlement_happens_exactly_once`; live `test_a_settled_commitment_cannot_settle_again` |
| Unauthorized observation | observation is permissionless by design; the lifecycle and the window decide when, and the result is the same whoever calls | `test_observation_obeys_the_lifecycle_for_everyone`, `test_whoever_observes_the_result_is_the_same`, `test_observation_cannot_start_before_the_window`; live `test_observation_waits_for_the_window` |
| Unauthorized fund / arm / cancel | creator-only checks | `test_only_the_creator_funds`, `test_only_the_creator_arms`, `test_only_the_creator_cancels`; live `test_funding_must_be_exact_and_by_the_creator` |
| Replay | every transition checks the current status; terminal states accept nothing | `test_terminal_conditions_accept_no_further_transition`, `test_resolved_conditions_are_not_observed_again`, `test_finalize_twice_is_refused`, `test_arm_twice_is_refused`, `test_double_funding_is_refused` |
| Malformed LLM output | strict validation raises `[LLM_ERROR]`; nothing is stored | `test_malformed_reader_output_changes_nothing`, `test_web_outage_and_malformed_output_fail_safe` |
| Prompt injection | order of authority in the prompt; evidence fenced; fence markers and control characters stripped from every untrusted string; the model's output cannot name an amount, recipient or verdict | `test_evidence_cannot_forge_a_fence_or_issue_instructions`, `test_reader_cannot_supply_verdict_amount_or_recipient` |
| Malicious source | only frozen policy URLs are fetched; citations of unread sources dropped; creator labels marked as claims | `test_malicious_source_cannot_widen_the_policy`, `test_every_policy_source_is_fetched_and_nothing_else`, `test_citing_an_unread_source_is_not_evidence` |
| Contradictory sources | any fact both supported and contradicted → UNDETERMINED / SOURCES_CONFLICT | `test_contradictory_sources_are_undetermined` |
| Web outage | no readable source → UNDETERMINED without consulting a model; a partial outage never concludes | `test_every_source_down_is_undetermined_without_a_model`, `test_partial_outage_never_forces_a_result`; live `test_unavailable_source_is_undetermined` |
| Oversized response | > 1 MB is unreadable; excerpts capped at 6000 chars; policy, text and every field bounded | `test_oversized_response_is_unreadable`, `test_policy_must_be_bounded_json_object`, `test_source_count_and_shape` |
| Source independence | enforced in code from hosts, not the model's claim; compared only when required | `test_independence_requirement_is_enforced_in_code`, `test_independence_is_compared_when_the_policy_requires_it` |
| Validator trusts the leader | validator re-fetches, re-reads, re-derives and compares every stored field | `test_validator_reads_the_sources_itself_and_agrees`, `test_validator_disagrees_when_its_own_reading_differs`, `test_validator_refuses_a_leader_claiming_satisfied`, `test_validator_compares_every_stored_field` |
| Frontend manipulation | the contract re-validates everything; the UI's checks are advisory; every displayed state is read from views | every refusal test above; `app/tests/lifecycle.test.ts` (a write is reported done only when the contract view shows it) |
| Backend compromise | no backend exists | repository structure |
| Server-key compromise | no server signer exists; writes are signed by the user's injected wallet | `app/tests/signed-write.test.ts` |
| Fake validator consensus | none implemented; results come only from GenLayer's protocol | live `test_every_observation_is_a_consensus_result`, `test_observation_transactions_reach_protocol_finality` |
| Wrong network | app refuses to start on any chain but 61999; refuses to send while the wallet reports another chain | `app/tests/validation.test.ts` (configuration, pre-flight) |
| Wrong contract address | configured address must expose STATELOCK's exact schema and identify as STATELOCK, else transactions are disabled | `app/tests/validation.test.ts` (deployment validation) |
| Admin override | no owner or privileged state | `test_no_owner_admin_or_privileged_state` |
| Payment as an argument | deposits are the transaction value | `test_payment_is_the_transaction_value_not_an_argument` |

Each test was mutation-checked: the property it guards was broken in a scratch copy and the
suite was confirmed to fail (20/20 contract mutants, 12/12 frontend mutants).

## Prompt injection

Evidence is data. The adjudication prompt:

- states the order of authority: its own instructions and the frozen terms, then the creator's
  instructions (which refine reading but cannot change rules), then evidence;
- tells the reader that text inside evidence addressing it, requesting a finding or claiming
  authority is part of the page;
- places each source inside `<<<EVIDENCE Sn host=…>>> … <<<END EVIDENCE Sn>>>`; `<<<` and `>>>`
  are removed from all untrusted text first, so a page cannot close or forge a fence;
- asks only for per-fact findings. Even a fully compromised reading can at most make facts
  look confirmed; it cannot change the recipient, the amount, the deadline or which sources
  count, and every validator independently re-reads the same sources before agreeing.

## Malicious sources

The creator chooses sources before arming and cannot change them after. A creator who picks a
source they control can influence the reading — which is visible to the beneficiary in the
frozen policy before the commitment is armed, with source kind and label marked as the
creator's claims. The contract requests nothing but the frozen policy URLs: never a URL found
in page content or suggested by the model.

## Web failures

| Failure | Result |
|---|---|
| every source unreadable (non-2xx, empty, > 1 MB, network error) | UNDETERMINED / SOURCES_UNAVAILABLE, conclusive only after the deadline |
| some sources unreadable | never SATISFIED or NOT_SATISFIED; UNDETERMINED / SOURCES_UNAVAILABLE |
| sources disagree | UNDETERMINED / SOURCES_CONFLICT |
| no event time or an ambiguous one, after the deadline | UNDETERMINED / EVENT_TIME_UNKNOWN |
| validators read different things | they disagree; the protocol rotates the leader or leaves the transaction undecided, and nothing is stored |
| nobody observes in time | UNDETERMINED / NOT_OBSERVED at finalization |

UNDETERMINED refunds the creator.

## Replay

Each verb is valid from specific states only and moves the condition forward; a repeated
transaction finds the condition in a later state and is refused. Observations after a
conclusive result are refused (`illegal transition from ACCEPTED`). Settlement is valid only
from FINALIZED and moves to terminal SETTLED.

## Settlement

The destination is `CONSEQUENCE[result_verdict]` — a constant — resolved to the stored
beneficiary or creator. The amount is the stored deposit. The ledger is zeroed and SETTLED
persisted before `emit_transfer`. Settlement of one condition does not touch another's ledger
(`test_settlement_does_not_touch_other_commitments`).

On the pinned runner, `emit_transfer` issues the transfer with address and value only; it does
not accept a stage argument. The finality guarantee is therefore the contract's FINALIZED gate,
600 s after acceptance, not a transfer option.

## Immutability

`terms_hash` covers the id, both parties, condition text, policy hash, observation start,
deadline, bounty terms and the consequence table. `policy_hash` covers the canonical policy.
Both are recomputed on every state-changing call.

## Wallet and network safety

- The app never requests, receives, stores or derives a private key. Writes go through
  `eth_sendTransaction` on the user's injected wallet (EIP-6963 discovery).
- The configured chain must be 61999 and the RPC https; anything else stops the app at start.
- genlayer-js skips its chain assertion on Studio networks, so the app performs its own:
  no write is sent unless the wallet reports chain 61999. Switching is offered as an explicit
  button, never automatic.
- The configured contract address is checked against GenLayer's generated schema for every
  method and parameter the app uses, and against the contract's version string. Until it
  passes, every transaction control is disabled.
- A transaction is shown as successful only after the contract's own view reflects it; a
  refusal is shown with the contract's own sentence; a transaction still inside its appeal
  window is labelled as such.
- Public environment variables hold no secrets.

## Platform issue: appeals on StudioNet

Observed on 14 Sep 2026 and reproduced on a minimal contract: filing
`appeal_transaction` on an ACCEPTED transaction on StudioNet ran a validator appeal round and
then left the appealed contract without code ("Contract not deployed"), stranding its balance.
This is independent of STATELOCK (the reproduction used a 16-line counter). It does not
weaken STATELOCK's own rules — nothing can settle during the finality delay — but on StudioNet
an appeal would currently freeze a contract's funds. The live suite therefore files its appeal
only against a disposable second deployment. Details and transaction hashes: [E2E.md](E2E.md#appeals-on-studionet).
