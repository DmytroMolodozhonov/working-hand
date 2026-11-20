import json, tempfile, unittest
from pathlib import Path
import world_storage as ws


def world(slots, own, held=None):
    return {"id": "w1", "seed": 5, "updated": 1, "players": {"me": {"slots": slots, "extraSlots": 0, "ownWand": own, "gear": {"held": held or [None, None]}}}}


class WandRescue(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp()); (self.d / "backups" / "w1").mkdir(parents=True)

    def put(self, path, w):
        path.write_text(json.dumps(w), encoding="utf-8")

    def test_lost_wand_comes_back_instead_of_the_stand_in(self):
        self.put(self.d / "w1.json", world([None, {"kind": "wand", "uid": "NEW", "spare": True}], "OLD"))
        self.put(self.d / "backups" / "w1" / "recent-3.json", world([{"kind": "wand", "uid": "OLD", "power": 49, "arenaWand": True}], "OLD"))
        got = ws.WorldStorage(self.d).get("w1")
        slots = got["players"]["me"]["slots"]
        self.assertTrue(any(x and x["uid"] == "OLD" and x["power"] == 49 and "arenaWand" not in x for x in slots))
        self.assertFalse(any(x and x.get("spare") for x in slots), "the stand-in is gone")
        self.assertEqual(json.loads((self.d / "w1.json").read_text())["players"]["me"]["slots"], slots, "written back")

    def test_own_wand_field_is_not_needed_and_the_strongest_lost_one_returns(self):
        # ownWand points to something else (a trophy was «my wand» once): the strongest carried wand missing now comes back
        self.put(self.d / "w1.json", world([{"kind": "wand", "uid": "NEW", "spare": True}], "SOMETHING"))
        self.put(self.d / "backups" / "w1" / "daily-2.json", world([{"kind": "wand", "uid": "WEAK", "power": 10}, {"kind": "wand", "uid": "OLD", "power": 49, "arenaWand": True}], "WEAK"))
        slots = ws.WorldStorage(self.d).get("w1")["players"]["me"]["slots"]
        self.assertEqual([x["uid"] for x in slots if x], ["OLD"])

    def test_stand_in_in_the_hand_goes_too(self):
        self.put(self.d / "w1.json", world([None], "OLD", [{"kind": "wand", "uid": "NEW", "spare": True}, None]))
        self.put(self.d / "backups" / "w1" / "previous.json", world([{"kind": "wand", "uid": "OLD", "power": 49}], "OLD"))
        got = ws.WorldStorage(self.d).get("w1")
        self.assertEqual(got["players"]["me"]["gear"]["held"], [None, None])

    def test_nothing_to_do_when_the_wand_is_there_or_no_stand_in_or_no_backup(self):
        # the own wand is present
        self.put(self.d / "w1.json", world([{"kind": "wand", "uid": "OLD"}], "OLD"))
        self.put(self.d / "backups" / "w1" / "recent-1.json", world([{"kind": "wand", "uid": "OLD"}], "OLD"))
        self.assertEqual(len([x for x in ws.WorldStorage(self.d).get("w1")["players"]["me"]["slots"] if x]), 1)
        # no stand-in: the wand lies on the ground on purpose
        self.put(self.d / "w1.json", world([None], "OLD"))
        self.assertEqual(ws.WorldStorage(self.d).get("w1")["players"]["me"]["slots"], [None])
        # a stand-in but no backup has it
        self.put(self.d / "w1.json", world([{"kind": "wand", "uid": "NEW", "spare": True}], "OLD"))
        (self.d / "backups" / "w1" / "recent-1.json").unlink()
        self.assertEqual(ws.WorldStorage(self.d).get("w1")["players"]["me"]["slots"][0]["uid"], "NEW")


if __name__ == "__main__":
    unittest.main()
