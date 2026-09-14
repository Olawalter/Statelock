"""The verification policy: validation and canonical form."""
import copy
import json

from .conftest import BOUNTY, CONDITION_TEXT, DEADLINE, DOCS_URL, OBSERVATION_START, POLICY, \
    REPO_URL, create, hex_of


def variant(**changes):
    p = copy.deepcopy(POLICY)
    p.update(changes)
    return p


def refused(direct_vm, deployed, alice, bob, policy, message):
    with direct_vm.expect_revert(message):
        create(deployed, direct_vm, alice, bob, policy=policy)


def test_policy_is_stored_canonically(direct_vm, deployed, drafted):
    p = deployed.get_policy(drafted)
    assert [s["id"] for s in p["sources"]] == ["S1", "S2"]
    assert p["sources"][0]["host"] == "api.github.com"
    assert p["sources"][1]["host"] == "docs.atlas-labs.dev"
    assert p["sources"][0]["kind"] == "OFFICIAL_REPOSITORY"
    assert [f["name"] for f in p["required_facts"]] == ["released_version", "public_release"]
    assert p["required_facts"][1]["expected"] == ""
    assert p["temporal_rule"] == "EVENT_BY_DEADLINE"
    assert p["failure_behavior"] == "UNDETERMINED_REFUNDS_CREATOR"
    assert p["policy_hash"] == deployed.get_condition(drafted)["policy_hash"]


def test_unknown_policy_keys_are_not_carried(direct_vm, deployed, direct_alice, direct_bob):
    cid = create(deployed, direct_vm, direct_alice, direct_bob,
                 policy=variant(payout_override="all to me", beneficiary="0xattacker"))
    p = deployed.get_policy(cid)
    assert "payout_override" not in p and "beneficiary" not in p


def test_source_count_and_shape(direct_vm, deployed, direct_alice, direct_bob):
    five = [{"url": f"https://example{i}.org/r", "kind": "OTHER", "label": "x"} for i in range(5)]
    for sources, message in (([], "policy needs 1..4 sources"),
                             (five, "policy needs 1..4 sources"),
                             ("not a list", "policy needs 1..4 sources"),
                             (["https://x.org"], "each source must be an object")):
        refused(direct_vm, deployed, direct_alice, direct_bob, variant(sources=sources), message)


def test_source_urls(direct_vm, deployed, direct_alice, direct_bob):
    for url in ("http://docs.atlas-labs.dev/2.0", "ftp://x.org/a", "https://",
                "https://docs.atlas labs.dev", "https://x.org/" + "a" * 300, "docs.atlas-labs.dev"):
        refused(direct_vm, deployed, direct_alice, direct_bob,
                variant(sources=[{"url": url, "kind": "OTHER", "label": "x"}]),
                "needs an https:// URL")


def test_duplicate_sources_are_one_source(direct_vm, deployed, direct_alice, direct_bob):
    """The same page twice is not two sources."""
    for twin in (REPO_URL + "/", REPO_URL.replace("api.github.com", "API.GITHUB.COM"),
                 REPO_URL + "#top", REPO_URL.replace("https://api.", "https://api.") ):
        refused(direct_vm, deployed, direct_alice, direct_bob,
                variant(sources=[{"url": REPO_URL, "kind": "OFFICIAL_REPOSITORY", "label": "a"},
                                 {"url": twin, "kind": "OFFICIAL_API", "label": "b"}]),
                "duplicates an earlier source")


def test_source_kind_and_label(direct_vm, deployed, direct_alice, direct_bob):
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(sources=[{"url": DOCS_URL, "kind": "RUMOUR", "label": "x"}]), "kind must be one of")
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(sources=[{"url": DOCS_URL, "kind": "OTHER", "label": ""}]), "needs a label")
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(sources=[{"url": DOCS_URL, "kind": "OTHER", "label": "x" * 81}]), "needs a label")


def test_required_facts(direct_vm, deployed, direct_alice, direct_bob):
    seven = [{"name": f"fact_{i}", "description": "d"} for i in range(7)]
    cases = [
        ([], "policy needs 1..6 required facts"),
        (seven, "policy needs 1..6 required facts"),
        ([{"name": "Released-Version", "description": "d"}], "name must be snake_case"),
        ([{"name": "1version", "description": "d"}], "name must be snake_case"),
        ([{"name": "v", "description": "d"}, {"name": "v", "description": "e"}], "duplicate fact name"),
        ([{"name": "v", "description": ""}], "needs a description"),
        ([{"name": "v", "description": "d", "expected": "x" * 81}], "expected value exceeds"),
    ]
    for facts, message in cases:
        refused(direct_vm, deployed, direct_alice, direct_bob, variant(required_facts=facts), message)


def test_temporal_rule_independence_instructions(direct_vm, deployed, direct_alice, direct_bob):
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(temporal_rule="WHENEVER"), "temporal_rule must be one of")
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(require_independent_sources="yes"), "must be true or false")
    same_host = [{"url": "https://docs.atlas-labs.dev/a", "kind": "OTHER", "label": "a"},
                 {"url": "https://www.docs.atlas-labs.dev/b", "kind": "OTHER", "label": "b"}]
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(sources=same_host, require_independent_sources=True),
            "at least two distinct hosts")
    refused(direct_vm, deployed, direct_alice, direct_bob,
            variant(instructions="x" * 1001), "instructions exceed 1000")


def test_policy_must_be_bounded_json_object(direct_vm, deployed, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    beneficiary = hex_of(direct_bob)
    for raw, message in (("{nope", "policy must be valid JSON"), ("[]", "must be a JSON object"),
                         (json.dumps(variant(instructions="y" * 7000)), "policy exceeds 6000")):
        with direct_vm.expect_revert(message):
            deployed.create_condition(CONDITION_TEXT, raw, OBSERVATION_START, DEADLINE,
                                      BOUNTY, beneficiary)
