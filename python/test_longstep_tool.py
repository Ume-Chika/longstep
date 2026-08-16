import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import longstep_tool


def plan_data():
    return {
        "id": "plan-1",
        "name": "確認用計画",
        "goal": {"statement": "目標", "deadline": "2026-12-31", "successCriteria": ["完了"]},
        "nodes": [{
            "id": "node-1",
            "name": "開始",
            "status": "not_started",
            "targetDate": "2026-09-01",
            "description": "",
            "nextAction": "",
            "goalLevel": "minor",
            "recurrence": {"enabled": False, "cadence": "", "completedCount": 0},
            "dependsOn": [],
        }],
        "meta": {
            "theme": "fire",
            "revision": 2,
            "createdAt": "2026-08-01T00:00:00.000Z",
            "updatedAt": "2026-08-01T00:00:00.000Z",
        },
    }


class LongstepToolTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary.name) / "plan-1.json"
        self.path.write_text(json.dumps(plan_data()), encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def test_get_add_update_delete_and_plan_update(self):
        self.assertEqual(longstep_tool.get_plan_summary(self.path)["revision"], 2)
        self.assertEqual(longstep_tool.list_goals(self.path)[0]["id"], "node-1")
        self.assertEqual(longstep_tool.get_goal(self.path, "node-1")["goal"]["name"], "開始")

        added = longstep_tool.add_goal(self.path, "次の目標", depends_on=["node-1"])
        goal_id = added["target"]
        longstep_tool.update_goal(self.path, goal_id, status="completed", next_action="確認する")
        longstep_tool.update_plan(self.path, statement="更新後の最終目標", success_criteria=["確認済み"])
        longstep_tool.delete_goal(self.path, "node-1")

        saved = json.loads(self.path.read_text(encoding="utf-8"))
        self.assertEqual(saved["meta"]["revision"], 6)
        self.assertEqual(saved["goal"]["statement"], "更新後の最終目標")
        self.assertEqual(saved["nodes"][0]["dependsOn"], [])

    def test_invalid_input_keeps_original(self):
        original = self.path.read_text(encoding="utf-8")
        with self.assertRaises(ValueError):
            longstep_tool.update_goal(self.path, "node-1", status="invalid")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_write_failure_keeps_original(self):
        original = self.path.read_text(encoding="utf-8")
        with patch("longstep_tool.os.replace", side_effect=OSError("failed")):
            with self.assertRaises(OSError):
                longstep_tool.update_goal(self.path, "node-1", name="変更後")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
