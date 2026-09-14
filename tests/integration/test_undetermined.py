"""Live: an unreadable source is UNDETERMINED, and UNDETERMINED refunds the creator."""


def test_unavailable_source_is_undetermined(live, world):
    ids = world.observed()
    obs = live.read("get_observation", ids["undetermined"])[0]
    assert obs["verdict"] == "UNDETERMINED" and obs["reason_code"] == "SOURCES_UNAVAILABLE"
    assert obs["sources_readable"] == [] and obs["conclusive"] is True


def test_undetermined_refunds_the_creator(live, world):
    world.settled()
    r = live.read("get_final_result", world.ids["undetermined"])
    assert r["settled"] is True and r["verdict"] == "UNDETERMINED"
    assert r["settled_to"].lower() == live.creator.address.lower()
