"""Unit tests for basic Longstep tool operations and constraints."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import longstep_tool
from test_fixtures import plan_data


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

    def test_list_goals_filtering_and_fields(self):
        longstep_tool.add_goal(self.path, "完了目標", goal_level="major")
        longstep_tool.update_goal(self.path, "完了目標", status="completed")

        goals = longstep_tool.list_goals(self.path)
        self.assertEqual(len(goals), 2)
        self.assertEqual(set(goals[0].keys()), {"id", "name", "status"})

        not_started = longstep_tool.list_goals(self.path, status="not_started")
        self.assertEqual(len(not_started), 1)
        self.assertEqual(not_started[0]["name"], "開始")

        longstep_tool.add_goal(self.path, "後続未着手", depends_on=["node-1"])
        actionable = longstep_tool.list_goals(self.path, status="actionable")
        self.assertEqual([g["name"] for g in actionable], ["開始"])

        custom_fields = longstep_tool.list_goals(self.path, fields=["name", "goal_level"])
        self.assertEqual(set(custom_fields[0].keys()), {"id", "name", "goalLevel"})

        all_fields = longstep_tool.list_goals(self.path, fields="all")
        self.assertIn("targetDate", all_fields[0])
        self.assertIn("dependsOn", all_fields[0])

    def test_invalid_input_keeps_original(self):
        original = self.path.read_text(encoding="utf-8")
        with self.assertRaises(ValueError):
            longstep_tool.update_goal(self.path, "node-1", status="invalid")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_write_failure_keeps_original(self):
        original = self.path.read_text(encoding="utf-8")
        with patch("storage.os.replace", side_effect=OSError("failed")):
            with self.assertRaises(OSError):
                longstep_tool.update_goal(self.path, "node-1", name="変更後")
        self.assertEqual(self.path.read_text(encoding="utf-8"), original)

    def test_description_and_name_length_constraints(self):
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "テスト目標", description="あ" * 121)
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "テスト目標", description="1行目\n2行目")
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.update_goal(self.path, "node-1", description="あ" * 121)

        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "あ" * 41)

        legacy = plan_data()
        legacy["nodes"][0]["description"] = "過去の長文メモ\n" + ("あ" * 200)
        self.path.write_text(json.dumps(legacy), encoding="utf-8")
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        detail = longstep_tool.get_goal(self.path, "node-1")
        self.assertEqual(detail["goal"]["status"], "completed")

    def test_get_goal_related_goals_are_compact(self):
        longstep_tool.update_goal(self.path, "node-1", description="前提ノードの説明")
        child = longstep_tool.add_next_goal(self.path, "node-1", "後続ノード", description="後続の説明")["target"]
        detail = longstep_tool.get_goal(self.path, child)
        self.assertEqual(detail["goal"]["description"], "後続の説明")
        self.assertEqual(len(detail["relatedGoals"]), 1)
        self.assertEqual(detail["relatedGoals"][0]["relation"], "prerequisite")
        self.assertNotIn("description", detail["relatedGoals"][0])


if __name__ == "__main__":
    unittest.main()
