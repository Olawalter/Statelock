"""Live: condition creation on StudioNet."""
import json

from .conftest import BOUNTY, POLICY_NOT_SATISFIED, POLICY_SATISFIED, POLICY_UNDETERMINED


def test_conditions_are_created_with_their_frozen_terms(live, world):
    ids = world.created()
    policies = {"satisfied": POLICY_SATISFIED, "not_satisfied": POLICY_NOT_SATISFIED,
                "undetermined": POLICY_UNDETERMINED}
    for key, cid in ids.items():
        c = live.read("get_condition", cid)
        spec = live.record["commitments"][key]
        assert c["status"] in {"DRAFT", "FUNDED", "ARMED", "OBSERVING", "ACCEPTED", "FINALIZED", "SETTLED"}
        assert c["creator"].lower() == live.creator.address.lower()
        assert c["beneficiary"].lower() == live.beneficiary.address.lower()
        assert c["bounty_terms"] == BOUNTY
        assert c["observation_start"] == spec["observation_start"] and c["deadline"] == spec["deadline"]
        p = live.read("get_policy", cid)
        assert [s["url"] for s in p["sources"]] == [s["url"] for s in policies[key]["sources"]]
        assert p["failure_behavior"] == "UNDETERMINED_REFUNDS_CREATOR"


def test_invalid_creation_is_refused_by_the_contract(live, world):
    world.created()
    refused = live.record["refused_create"]
    assert refused["refused"] and "observation_start must be after the creation time" in refused["refusal"]
