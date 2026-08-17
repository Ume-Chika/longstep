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

    def test_list_goals_filtering_and_fields(self):
        longstep_tool.add_goal(self.path, "完了目標", goal_level="major")
        longstep_tool.update_goal(self.path, "完了目標", status="completed")

        # デフォルトは id, name, status のみ
        goals = longstep_tool.list_goals(self.path)
        self.assertEqual(len(goals), 2)
        self.assertEqual(set(goals[0].keys()), {"id", "name", "status"})

        # status絞り込み
        not_started = longstep_tool.list_goals(self.path, status="not_started")
        self.assertEqual(len(not_started), 1)
        self.assertEqual(not_started[0]["name"], "開始")

        # fields指定
        custom_fields = longstep_tool.list_goals(self.path, fields=["name", "goal_level"])
        self.assertEqual(set(custom_fields[0].keys()), {"id", "name", "goalLevel"})

        # fields='all'
        all_fields = longstep_tool.list_goals(self.path, fields="all")
        self.assertIn("targetDate", all_fields[0])
        self.assertIn("dependsOn", all_fields[0])

    def test_add_subgoal_and_name_resolution(self):
        # 名前で親を指定してサブ目標を追加
        added = longstep_tool.add_subgoal(self.path, "開始", "小目標1")
        subgoal_id = added["target"]

        # 親ノード（開始）の dependsOn に subgoal_id が追加されていることを確認
        parent_goal = longstep_tool.get_goal(self.path, "開始")
        self.assertIn(subgoal_id, parent_goal["goal"]["dependsOn"])

        # 名前で小目標を更新
        longstep_tool.update_goal(self.path, "小目標1", status="completed")
        subgoal = longstep_tool.get_goal(self.path, subgoal_id)
        self.assertEqual(subgoal["goal"]["status"], "completed")

        # 名前で小目標を削除
        longstep_tool.delete_goal(self.path, "小目標1")
        parent_goal_after = longstep_tool.get_goal(self.path, "開始")
        self.assertNotIn(subgoal_id, parent_goal_after["goal"]["dependsOn"])

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
