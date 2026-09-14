"""Live: exact funding, ARM, and the bounty locked."""
from .conftest import BOUNTY


def test_funding_must_be_exact_and_by_the_creator(live, world):
    world.armed()
    under = live.record["refused_underfund"]
    assert under["refused"] and "funding must equal the bounty terms exactly" in under["refusal"]
    third = live.record["refused_third_party_fund"]
    assert third["refused"] and "only the creator may do this" in third["refusal"]


def test_armed_commitments_hold_the_exact_bounty(live, world):
    ids = world.armed()
    for key, cid in ids.items():
        c = live.read("get_condition", cid)
        assert c["bounty_deposited"] in (BOUNTY, 0)          # 0 only once settled
        assert c["armed_at"] > 0 and c["armed_at"] < c["observation_start"]


def test_an_armed_bounty_cannot_be_withdrawn(live, world):
    world.armed()
    cancel = live.record["refused_cancel_after_arm"]
    assert cancel["refused"] and "illegal transition from ARMED" in cancel["refusal"]
