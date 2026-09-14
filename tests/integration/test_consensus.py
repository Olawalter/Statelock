"""Live: GenLayer's own consensus, appeal and finality — the application adds none."""


def test_observation_transactions_reach_protocol_finality(live, world):
    world.finalized()
    for key in ("satisfied", "not_satisfied", "undetermined"):
        final = live.record["commitments"][key]["observe_tx_final"]
        assert final["status"] == "FINALIZED", (key, final)
        assert "agree" in [str(v).lower() for v in final["votes"]], (key, final)


def test_a_protocol_appeal_can_be_filed_on_an_accepted_observation(live, world):
    appeal = world.appealed()
    assert appeal, "the harness filed an appeal attempt during the finality window"
    live.record["protocol_appeal_final"] = live.tx_facts(appeal["tx"])
    # whatever the appeal round concluded, the observation settles only as a final transaction
    world.finalized()
    assert live.tx_facts(appeal["tx"])["status"] == "FINALIZED"
