# STATELOCK contract

`contracts/statelock.py` — a single GenLayer Intelligent Contract, class `Statelock`, version
`STATELOCK-1.0.0`, runner `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`.
The constructor takes no arguments. There is no owner, no admin and no upgrade path.

The method list, parameter names and order below are what GenLayer itself derives from the
code (`gen_getContractSchema` / `gen_getContractSchemaForCode`; the frontend test suite checks
against that exact schema in `app/tests/fixtures/statelock-schema.json`).

## Storage

| Field | Type | Holds |
|---|---|---|
| `version` | `str` | `STATELOCK-1.0.0` |
| `condition_count` | `u256` | conditions ever created; ids are `SL-000001`, `SL-000002`, … |
| `conditions` | `TreeMap[str, Condition]` | every condition by id |
| `condition_ids` | `DynArray[str]` | ids in creation order (paging) |
| `conditions_by_creator` | `TreeMap[str, DynArray[str]]` | lower-cased creator address → ids |
| `observations` | `TreeMap[str, DynArray[str]]` | condition id → canonical JSON observation records, oldest first |
| `total_locked` | `u256` | atto-GEN currently held for all conditions |

`Condition` (an `@allow_storage @dataclass`):

| Group | Fields |
|---|---|
| Identity and parties | `condition_id`, `creator` (`Address`, the caller of `create_condition`), `beneficiary` (`Address`) |
| Frozen terms | `condition_text`, `policy_json` (canonical), `policy_hash` (sha256 of `policy_json`), `terms_hash` (sha256 over id, parties, text, policy hash, start, deadline, bounty terms and the consequence table), `observation_start`, `deadline`, `bounty_terms` |
| Ledger | `bounty_deposited` — the value the chain moved with the funding transaction, zeroed before any transfer |
| Lifecycle | `status`, `created_at`, `funded_at`, `armed_at`, `accepted_at`, `finalized_at`, `settled_at`, `cancelled_at` (all GenLayer transaction time, UTC Unix seconds; 0 = not yet) |
| Observation | `early_observations`, `observation_count`, `last_observed_at` |
| Result | `result_verdict`, `result_reason`, `result_temporal`, `result_observation` (index of the deciding observation; 0 for NOT_OBSERVED) |
| Settlement | `settled_to`, `settled_amount` |

Every state-changing method re-hashes `policy_json` and the terms and refuses with
`terms commitment broken` if either differs from what was recorded at creation.

## Time

The contract's clock is the GenLayer transaction's own datetime
(`datetime.datetime.now(datetime.timezone.utc)` inside GenVM). No caller supplies "now", and no
method advances a clock. Every node executing a transaction reads the same value.

| Constant | Value | Meaning |
|---|---|---|
| `OBSERVATION_GRACE_SECONDS` | 7 days | after the deadline, how long a (conclusive) observation may still be made |
| `FINALITY_DELAY_SECONDS` | 600 | ACCEPTED → FINALIZED wait; StudioNet's protocol finality window is 30 s |
| `MAX_HORIZON_SECONDS` | 366 days | furthest deadline from creation |
| `MAX_EARLY_OBSERVATIONS` | 4 | observations allowed at or before the deadline |

## Lifecycle

```
                       cancel (creator)                      cancel (creator, refund)
                 ┌────────────────────────┐          ┌──────────────────────────────┐
                 ▼                        │          ▼                              │
            CANCELLED ◄───────────── DRAFT ──fund──► FUNDED ──arm──► ARMED ──observe──► OBSERVING
                                                                       │                  │  ▲
                                                                       │ observe          │  │ observe
                                                                       │ (conclusive)     │  │ (not conclusive)
                                                                       ▼                  ▼  │
                                                                    ACCEPTED ◄────────────┘──┘
                                                                       │ finalize (after 600 s)
          ARMED / OBSERVING ── finalize (after deadline + 7 days, nobody observed) ──┐
                                                                       ▼            ▼
                                                                    FINALIZED ◄─────┘
                                                                       │ settle (anyone, once)
                                                                       ▼
                                                                    SETTLED
```

| Method | Caller | Allowed from | Checks | Effect |
|---|---|---|---|---|
| `create_condition(condition_text, policy_json, observation_start, deadline, bounty_terms, beneficiary) -> str` | anyone (becomes creator) | — | text 1..500 chars; policy valid (below); `observation_start` > now; `deadline` > `observation_start`; `deadline` ≤ now + 366 days; `bounty_terms` > 0; beneficiary a valid non-zero address | new `DRAFT`, returns the id |
| `fund_condition(condition_id)` **payable** | creator | DRAFT | `gl.message.value` must equal `bounty_terms` exactly (under, over and zero refused) | `FUNDED`, `bounty_deposited = value`, `total_locked += value` |
| `cancel_condition(condition_id)` | creator | DRAFT, FUNDED | — | `CANCELLED`; a funded deposit is zeroed and transferred back to the creator |
| `arm_condition(condition_id)` | creator | FUNDED | fully funded; now < `observation_start` | `ARMED`: nothing about the condition can change and the bounty cannot be withdrawn |
| `observe_condition(condition_id)` | anyone | ARMED, OBSERVING | `observation_start` ≤ now ≤ `deadline` + 7 days; at most 4 observations at or before the deadline | runs the adjudication (below) and appends an observation record; conclusive → `ACCEPTED` with the result, otherwise `OBSERVING` |
| `finalize_condition(condition_id)` | anyone | ACCEPTED | now ≥ `accepted_at` + 600 | `FINALIZED` |
| | | ARMED, OBSERVING | now > `deadline` + 7 days | `FINALIZED` with `UNDETERMINED` / `NOT_OBSERVED` — a bounty is never stranded |
| `settle_condition(condition_id)` | anyone | FINALIZED | a verdict exists; not already settled; a positive deposit | zero the ledger, record `settled_to` / `settled_amount` / `settled_at`, `SETTLED`, then transfer |

Refusals raise `gl.vm.UserError` with a prefix: `[EXPECTED]` for every business rule above,
`[LLM_ERROR]` for malformed model output, and `[EXTERNAL]` / `[TRANSIENT]` reserved for source
failures that would reach a caller. A refused transaction changes nothing.

## Verification policy

`policy_json` is validated and stored in canonical form:

```json
{
  "sources": [{"url": "https://…", "kind": "OFFICIAL_REPOSITORY", "label": "…"}],
  "required_facts": [{"name": "released_version", "description": "…", "expected": "1.1.8"}],
  "temporal_rule": "EVENT_BY_DEADLINE",
  "require_independent_sources": false,
  "instructions": "…"
}
```

| Rule | Limit |
|---|---|
| sources | 1..4; `https://` only, ≤ 300 chars, no whitespace; no two with the same normalised URL; `kind` ∈ OFFICIAL_REPOSITORY, OFFICIAL_DOCUMENTATION, OFFICIAL_ANNOUNCEMENT, OFFICIAL_API, PUBLIC_REGISTRY, OTHER; label 1..80 chars |
| required facts | 1..6; `name` matches `^[a-z][a-z0-9_]{0,39}$`, unique; description 1..240; `expected` ≤ 80 (empty = a yes/no fact) |
| temporal rule | `EVENT_BY_DEADLINE` |
| independence | boolean; `true` requires sources on at least two distinct hosts |
| instructions | ≤ 1000 chars |
| whole policy | ≤ 6000 chars |

The stored form adds source ids `S1…Sn`, each source's host, and
`failure_behavior: "UNDETERMINED_REFUNDS_CREATOR"`.

## Observation and results

One `observe_condition` is one GenLayer nondeterministic round
(`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`). The leader and every validator each:

1. fetch every policy source with `gl.nondet.web.get` — a source is readable only with HTTP 2xx
   and a body of 1 byte .. 1 MB;
2. extract bounded text (JSON compacted, HTML stripped of scripts, styles and tags), strip
   control characters and the evidence-fence markers `<<<` / `>>>`, cap at 6000 chars per source;
3. if anything was readable, ask the model (`gl.nondet.exec_prompt`, JSON) for per-fact
   findings: status CONFIRMED / CONTRADICTED / NOT_FOUND, the value shown, supporting and
   contradicting source ids, and the event time;
4. derive the result in code (`_derive`).

The validator then compares the **complete** stored result — verdict, reason, temporal
result, conclusiveness, every fact's stored status / value / independence, and which sources
were readable — with its own. It never adopts the leader's reading.

`_derive` rules, in order:

| Situation | Verdict | Reason code | Temporal |
|---|---|---|---|
| no source readable (the model is not consulted) | UNDETERMINED | SOURCES_UNAVAILABLE | NOT_APPLICABLE |
| malformed findings (not an object, missing / duplicate fact, bad status, non-list citations) | round fails `[LLM_ERROR]` → validators disagree, leader rotates | | |
| any fact cited as both supported and contradicted | UNDETERMINED | SOURCES_CONFLICT | NOT_APPLICABLE |
| every fact confirmed, independence required but not met | UNDETERMINED | INDEPENDENCE_NOT_MET | NOT_APPLICABLE |
| every fact confirmed, a source unreadable | UNDETERMINED | SOURCES_UNAVAILABLE | NOT_APPLICABLE |
| every fact confirmed, observed at or before the deadline | SATISFIED | REQUIRED_FACTS_CONFIRMED | BEFORE_DEADLINE |
| every fact confirmed after the deadline, every event time known and ≤ deadline | SATISFIED | REQUIRED_FACTS_CONFIRMED | BEFORE_DEADLINE |
| … every event time known and some event certainly after the deadline | NOT_SATISFIED | EVENT_AFTER_DEADLINE | AFTER_DEADLINE |
| … an event time missing or straddling the deadline | UNDETERMINED | EVENT_TIME_UNKNOWN | UNKNOWN |
| a fact not confirmed, a source unreadable | UNDETERMINED | SOURCES_UNAVAILABLE | NOT_APPLICABLE |
| a fact not confirmed, every source readable | NOT_SATISFIED | REQUIRED_FACT_NOT_CONFIRMED | NOT_APPLICABLE |
| (finalize, nobody observed in time) | UNDETERMINED | NOT_OBSERVED | NOT_APPLICABLE |

Per-fact normalisation before anything is stored: citations of sources this node did not read
are dropped; CONFIRMED without a supporting citation, or CONTRADICTED without a contradicting
one, becomes not found; a CONFIRMED value that differs from `expected` (case-folded, quotes
and a leading `v` before a digit removed) becomes contradicted. CONTRADICTED and NOT_FOUND are
then stored as one status, `NOT_CONFIRMED`: they lead to the same result in every case, so
validators are not asked to agree on the distinction. `independent` is stored only when the
policy requires independence (otherwise `null`). A stored value is the policy's expected value
when confirmed, otherwise empty — the model's free text never reaches storage.

Event times: a date alone is that whole UTC day; a date-time without a timezone is ±14 hours.

An observation is **conclusive** when it is SATISFIED, or when it is made after the deadline.
Before the deadline a negative or undetermined reading is recorded and the condition keeps
observing (at most 4 times).

Observation record (`get_observation` returns all of them):

```json
{"index": 1, "observed_at": 1789416000, "phase": "WITHIN_WINDOW",
 "verdict": "SATISFIED", "reason_code": "REQUIRED_FACTS_CONFIRMED", "temporal_result": "BEFORE_DEADLINE",
 "conclusive": true,
 "facts": [{"name": "released_version", "status": "CONFIRMED", "value": "1.1.8", "independent": null}],
 "sources_readable": ["S1", "S2"]}
```

## Funding and settlement

- The deposit is `gl.message.value`, never an argument, and must equal `bounty_terms`.
- The consequence table is a constant: `SATISFIED → beneficiary`, `NOT_SATISFIED → creator`,
  `UNDETERMINED → creator`. The destination is chosen in code from the finalized verdict.
- `settle_condition` validates, refuses a second settlement, zeroes `bounty_deposited` and
  `total_locked`, records the settlement, sets `SETTLED`, and only then transfers.
- The transfer is `_Recipient(to).emit_transfer(value=u256(amount))` through an empty
  `@gl.evm.contract_interface`. On this runner the interface issues an `EthSend` with the
  address and value only; the protection against paying on a non-final result is the
  contract's own FINALIZED gate.
- A second `settle_condition` fails at the status check (`illegal transition from SETTLED`)
  before any transfer can be built.

## Views

| View | Returns |
|---|---|
| `get_protocol_info()` | version, `condition_count`, `total_locked`, time source, outcomes, consequence table, source kinds, temporal rules, failure behaviour, every limit |
| `get_condition(condition_id)` | every stored field plus `observation_closes`, `finalizable_at`, `locked`, `terminal`, `consequence`, `early_observations_allowed` |
| `get_policy(condition_id)` | the canonical policy plus `policy_hash` |
| `get_observation(condition_id)` | every observation record, oldest first |
| `get_final_result(condition_id)` | `has_result`, `final`, verdict, reason, temporal, deciding observation, `accepted_at`, `finalizable_at`, `finalized_at`, `destination`, `settled`, `settled_to`, `settled_amount`, `settled_at` |
| `list_conditions(offset, limit)` | `{total, offset, count, rows}`; `limit` capped at 50 |
| `list_conditions_by_creator(creator, offset, limit)` | the same, for one creator |
