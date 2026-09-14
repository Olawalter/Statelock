"""Shared fixtures for the STATELOCK direct suite.

Direct mode (the official `genlayer-test` runner) executes the contract in a
real GenVM Python runner. Transaction time is set with `direct_vm.warp()`,
the web is served through `direct_vm.mock_web`, and the model through
`direct_vm.mock_llm` — official test mechanisms, never production code.

Sources serve real bytes; the contract fetches, extracts and derives the
verdict itself. A model mock returns FINDINGS (what a reader saw), never a
verdict, because the contract never accepts a verdict from the model.
"""
import datetime
import json
import pathlib
import re

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "contracts" / "statelock.py"

GEN = 10 ** 18
BOUNTY = 100 * GEN
HOUR = 3600
DAY = 86400
T0 = 1_789_344_000                       # 2026-09-14T00:00:00Z — every suite starts here
OBSERVATION_START = T0 + HOUR
DEADLINE = T0 + 2 * DAY
FINALITY_DELAY = 600
OBSERVATION_GRACE = 7 * DAY

REPO_URL = "https://api.github.com/repos/atlas-labs/atlas/releases/tags/v2.0"
DOCS_URL = "https://docs.atlas-labs.dev/releases/2.0"

POLICY = {
    "sources": [
        {"url": REPO_URL, "kind": "OFFICIAL_REPOSITORY", "label": "Atlas GitHub releases"},
        {"url": DOCS_URL, "kind": "OFFICIAL_DOCUMENTATION", "label": "Atlas release notes"},
    ],
    "required_facts": [
        {"name": "released_version", "description": "The version number of the release",
         "expected": "2.0"},
        {"name": "public_release", "description": "The release is publicly available, not a draft"},
    ],
    "temporal_rule": "EVENT_BY_DEADLINE",
    "require_independent_sources": False,
    "instructions": "A draft or pre-release does not count as publicly available.",
}
CONDITION_TEXT = "Atlas releases version 2.0"

REPO_BODY = json.dumps({
    "html_url": "https://github.com/atlas-labs/atlas/releases/tag/v2.0",
    "tag_name": "v2.0", "name": "Atlas 2.0", "draft": False, "prerelease": False,
    "published_at": "2026-09-15T10:00:00Z",
}).encode()
DOCS_BODY = (b"<!doctype html><html><body><h1>Atlas 2.0 release notes</h1>"
             b"<p>Atlas 2.0 was released publicly on 2026-09-15.</p>"
             b"<script>track()</script></body></html>")

SOURCES_OK = {REPO_URL: (200, REPO_BODY), DOCS_URL: (200, DOCS_BODY)}


# ─── time ─────────────────────────────────────────────────────────────────

def iso(unix_seconds: int) -> str:
    return datetime.datetime.fromtimestamp(
        int(unix_seconds), tz=datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def warp_to(direct_vm, unix_seconds: int) -> None:
    direct_vm.warp(iso(unix_seconds))


# ─── findings (what a model reader reports) ──────────────────────────────

def fact(name, status="CONFIRMED", value="", supporting=None, contradicting=None,
         event_time=""):
    return {"name": name, "status": status, "value": value,
            "supporting_sources": supporting if supporting is not None else [],
            "contradicting_sources": contradicting if contradicting is not None else [],
            "event_time": event_time}


def findings(*facts, **extra) -> str:
    payload = {"reasoning": "per fact, from the fences", "facts": list(facts)}
    payload.update(extra)
    return json.dumps(payload)


CONFIRMED_BOTH = findings(
    fact("released_version", "CONFIRMED", "v2.0", ["S1", "S2"], [], "2026-09-15T10:00:00Z"),
    fact("public_release", "CONFIRMED", "true", ["S1", "S2"], [], "2026-09-15T10:00:00Z"),
)


def mock_round(direct_vm, llm_json: str | None = None, sources=None) -> None:
    """Register what the sources serve and what a model reader reports.
    Mocks are first-registered-wins, so clear first."""
    direct_vm.clear_mocks()
    for url, (status, body) in (sources if sources is not None else SOURCES_OK).items():
        direct_vm.mock_web("^" + re.escape(url) + "$", {"status": status, "body": body})
    if llm_json is not None:
        direct_vm.mock_llm(r".*reader on a GenLayer validator panel for STATELOCK.*", llm_json)


def record_prompts(direct_vm) -> list:
    seen = []
    original = direct_vm._match_llm_mock

    def recording(prompt):
        seen.append(prompt)
        return original(prompt)

    direct_vm._match_llm_mock = recording
    return seen


def record_fetches(direct_vm) -> list:
    seen = []
    original = direct_vm._match_web_mock

    def recording(url, method="GET"):
        seen.append(url)
        return original(url, method)

    direct_vm._match_web_mock = recording
    return seen


# ─── fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
def transfers(monkeypatch):
    """Every value transfer the contract emits, as (recipient_hex, atto)."""
    from gltest.direct import wasi_mock
    sent = []
    original = wasi_mock._handle_gl_call

    def recording(vm, request):
        if isinstance(request, dict) and "EthSend" in request:
            op = request["EthSend"]
            addr = op["address"]
            raw = addr.as_bytes if hasattr(addr, "as_bytes") else bytes(addr)
            sent.append(("0x" + raw.hex(), int(op["value"])))
        return original(vm, request)

    monkeypatch.setattr(wasi_mock, "_handle_gl_call", recording)
    return sent


def hex_of(account) -> str:
    raw = account.as_bytes if hasattr(account, "as_bytes") else bytes(account)
    return "0x" + raw.hex()


@pytest.fixture
def contract_path():
    return str(CONTRACT)


@pytest.fixture
def deployed(direct_vm, direct_deploy, contract_path):
    warp_to(direct_vm, T0)
    return direct_deploy(contract_path)


def create(deployed, direct_vm, creator, beneficiary, policy=None, text=CONDITION_TEXT,
           start=OBSERVATION_START, deadline=DEADLINE, bounty=BOUNTY) -> str:
    direct_vm.sender = creator
    return deployed.create_condition(
        text, json.dumps(policy if policy is not None else POLICY), start, deadline, bounty,
        hex_of(beneficiary))


@pytest.fixture
def drafted(direct_vm, deployed, direct_alice, direct_bob):
    """A DRAFT condition: Alice creates, Bob is the beneficiary."""
    return create(deployed, direct_vm, direct_alice, direct_bob)


@pytest.fixture
def funded(direct_vm, deployed, direct_alice, drafted):
    direct_vm.sender = direct_alice
    direct_vm.value = BOUNTY
    deployed.fund_condition(drafted)
    direct_vm.value = 0
    return drafted


@pytest.fixture
def armed(direct_vm, deployed, direct_alice, funded):
    direct_vm.sender = direct_alice
    deployed.arm_condition(funded)
    return funded


def observe(direct_vm, deployed, sender, cid, at, llm_json=CONFIRMED_BOTH, sources=None):
    warp_to(direct_vm, at)
    mock_round(direct_vm, llm_json, sources)
    direct_vm.sender = sender
    deployed.observe_condition(cid)
    return deployed.get_condition(cid)


@pytest.fixture
def accepted_satisfied(direct_vm, deployed, direct_charlie, armed):
    """ARMED, observed inside the window, facts confirmed -> ACCEPTED SATISFIED."""
    observe(direct_vm, deployed, direct_charlie, armed, OBSERVATION_START + HOUR)
    assert deployed.get_condition(armed)["status"] == "ACCEPTED"
    return armed
