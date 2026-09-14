"""Live: GenLayer observes real sources; the verdict is derived from what it read."""


def test_observation_waits_for_the_window(live, world):
    world.armed()
    early = live.record["refused_early_observation"]
    assert early["refused"] and "observation window opens at" in early["refusal"]


def test_satisfied_condition_within_the_window(live, world):
    ids = world.observed()
    obs = live.read("get_observation", ids["satisfied"])[0]
    assert obs["phase"] == "WITHIN_WINDOW"
    assert obs["sources_readable"] == ["S1", "S2"]
    assert obs["verdict"] == "SATISFIED" and obs["conclusive"] is True
    assert obs["reason_code"] == "REQUIRED_FACTS_CONFIRMED"
    facts = {f["name"]: f for f in obs["facts"]}
    assert facts["released_version"]["status"] == "CONFIRMED" and facts["released_version"]["value"] == "1.1.8"
    assert facts["public_release"]["status"] == "CONFIRMED"


def test_not_satisfied_condition_after_the_deadline(live, world):
    ids = world.observed()
    obs = live.read("get_observation", ids["not_satisfied"])[0]
    assert obs["phase"] == "AFTER_DEADLINE" and obs["conclusive"] is True
    assert obs["sources_readable"] == ["S1", "S2"]
    assert obs["verdict"] == "NOT_SATISFIED"
    assert obs["reason_code"] == "REQUIRED_FACT_NOT_CONFIRMED"
    assert obs["facts"][0]["status"] == "NOT_CONFIRMED"


def test_every_observation_is_a_consensus_result(live, world):
    world.observed()
    for key in ("satisfied", "not_satisfied", "undetermined"):
        tx = live.record["commitments"][key]["observe_tx"]
        entry = next(t for t in live.record["transactions"] if t["tx"] == tx)
        assert entry["execution"] == "SUCCESS" and entry["consensus"] in {"MAJORITY_AGREE", "AGREE"}, entry
