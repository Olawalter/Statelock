"""Live: GenLayer's own consensus, appeal and finality — the application adds none."""
from .conftest import CONTRACT


def test_observation_transactions_reach_protocol_finality(live, world):
    world.finalized()
    for key in ("satisfied", "not_satisfied", "undetermined"):
        final = live.record["commitments"][key]["observe_tx_final"]
        assert final["status"] == "FINALIZED", (key, final)
        assert "agree" in [str(v).lower() for v in final["votes"]], (key, final)


def test_a_protocol_appeal_is_processed_by_genlayer(live, world):
    """An appeal is filed on an accepted observation of the disposable probe
    deployment inside its finality window. What is asserted is what the
    protocol did with it: an appeal round ran, and the transaction still
    ended FINALIZED. Whatever that round concluded is recorded, including
    whether the appealed contract's code survived (on StudioNet it has been
    observed not to; see docs/E2E.md)."""
    appeal = world.appealed()
    assert appeal["appeal_submitted"] is True, appeal
    assert appeal["status_before"] == "ACCEPTED", appeal
    assert len(appeal["rounds"]) >= 2 and any("appeal" in str(r).lower() for r in appeal["rounds"]), appeal
    assert appeal["status_after"] == "FINALIZED", appeal


def test_an_appeal_elsewhere_leaves_the_lifecycle_contract_intact(live, world):
    appeal = world.appealed()
    source = CONTRACT.read_bytes().replace(b"\r\n", b"\n")
    assert appeal["main_code_bytes_after"] == len(source), appeal
