"""Live: exact funding, ARM, and the bounty locked."""
from .conftest import BOUNTY


def test_funding_must_be_exact_and_by_the_creator(live, world):
    """A wrong deposit never funds, and its value goes straight back."""
    world.armed()
    for key in ("returned_underfund", "returned_third_party_fund"):
        assert live.record[key]["execution"] == "SUCCESS", live.record[key]
    rows = live.record["returned_deposits"]["rows"]
    assert [r["amount"] for r in rows] == [BOUNTY - 1, BOUNTY]
    assert "funding must equal the bounty terms exactly" in rows[0]["reason"]
    assert rows[0]["sender"] == live.creator.address.lower()
    assert rows[1]["reason"] == "only the creator may do this"
    assert rows[1]["sender"] == live.third.address.lower()
    b = live.record["balances_after_returns"]
    assert b["third_party"]["after"] == b["third_party"]["before"]
    assert b["creator"]["after"] == b["creator"]["before"]
    zero = live.record["refused_zero_fund"]
    assert zero["refused"] and "funding must equal the bounty terms exactly" in zero["refusal"]


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
