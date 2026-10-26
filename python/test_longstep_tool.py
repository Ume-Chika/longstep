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

        # status='actionable'（前提が完了している未着手目標のみ）
        longstep_tool.add_goal(self.path, "後続未着手", depends_on=["node-1"])
        actionable = longstep_tool.list_goals(self.path, status="actionable")
        self.assertEqual([g["name"] for g in actionable], ["開始"])

        # fields指定
        custom_fields = longstep_tool.list_goals(self.path, fields=["name", "goal_level"])
        self.assertEqual(set(custom_fields[0].keys()), {"id", "name", "goalLevel"})

        # fields='all'
        all_fields = longstep_tool.list_goals(self.path, fields="all")
        self.assertIn("targetDate", all_fields[0])
        self.assertIn("dependsOn", all_fields[0])

    def test_add_subgoal_and_name_resolution(self):
        # 名前で親を指定してサブ目標を追加（新目標 ──> 開始）
        added = longstep_tool.add_subgoal(self.path, "開始", "小目標1")
        subgoal_id = added["target"]

        # 親ノード（開始）の dependsOn に subgoal_id が追加されていることを確認
        parent_goal = longstep_tool.get_goal(self.path, "開始")
        self.assertIn(subgoal_id, parent_goal["goal"]["dependsOn"])

        # 直後タスクの追加（小目標1 ──> 小目標2）
        added_next = longstep_tool.add_next_goal(self.path, "小目標1", "小目標2")
        next_id = added_next["target"]
        next_goal = longstep_tool.get_goal(self.path, next_id)
        self.assertIn(subgoal_id, next_goal["goal"]["dependsOn"])

        # 名前で小目標を更新
        longstep_tool.update_goal(self.path, "小目標1", status="completed")
        subgoal = longstep_tool.get_goal(self.path, subgoal_id)
        self.assertEqual(subgoal["goal"]["status"], "completed")

        # 名前で小目標を削除
        longstep_tool.delete_goal(self.path, "小目標1")
        parent_goal_after = longstep_tool.get_goal(self.path, "開始")
        self.assertNotIn(subgoal_id, parent_goal_after["goal"]["dependsOn"])

    def test_transitive_reduction_and_cycle_prevention(self):
        # node-1 を完了にして枠を空け、TaskA(小) -> TaskB(小) -> TaskC(中) -> TaskD(大) のチェーンを作成
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        g_a = longstep_tool.add_goal(self.path, "TaskA", goal_level="minor")["target"]
        g_b = longstep_tool.add_goal(self.path, "TaskB", goal_level="minor", depends_on=[g_a])["target"]
        g_c = longstep_tool.add_goal(self.path, "TaskC", goal_level="middle", depends_on=[g_b])["target"]

        # C -> D を追加する際、前提に A, B, C すべてを指定（AとBは冗長）
        g_d = longstep_tool.add_goal(self.path, "TaskD", goal_level="major", depends_on=[g_a, g_b, g_c])["target"]
        goal_d = longstep_tool.get_goal(self.path, g_d)
        # 自動簡約されて C のみ残ることを確認
        self.assertEqual(goal_d["goal"]["dependsOn"], [g_c])

        # 循環参照（D -> A を繋ごうとする）はエラーになることを確認
        with self.assertRaises(ValueError):
            longstep_tool.update_goal(self.path, g_a, depends_on=[g_d])

    def test_hierarchy_validation_prevents_reverse_and_same_level_middle_major(self):
        # 逆流（中目標 -> 小目標、大目標 -> 中目標）はエラー
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        with self.assertRaisesRegex(ValueError, "粒度の逆流"):
            longstep_tool.add_subgoal(self.path, "node-1", "大目標の子", goal_level="major")

        # 中目標同士・大目標同士の直列はエラー
        with self.assertRaisesRegex(ValueError, "同じ粒度の直列接続は小目標"):
            longstep_tool.add_next_goal(self.path, mid, "次の中目標", goal_level="middle")

    def test_wip_limits_and_single_parent_focus(self):
        # 小目標は未達成3件まで
        # 現在 node-1(未着手, minor) がある
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        s1 = longstep_tool.add_subgoal(self.path, mid, "小1")["target"]
        # node-1 を mid の前提に接続して集約
        longstep_tool.update_goal(self.path, mid, depends_on=[s1, "node-1"])
        longstep_tool.add_subgoal(self.path, mid, "小2")

        # 4件目の未達成小目標は拒否
        with self.assertRaisesRegex(ValueError, "未達成の小目標.*は同時に3件まで"):
            longstep_tool.add_subgoal(self.path, mid, "小3")

        # 既存小目標を達成済みにすれば追加できる
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        s3 = longstep_tool.add_subgoal(self.path, mid, "小3")["target"]
        self.assertTrue(s3)

        # 1枠空けた状態で、別の中目標に未達成小目標を追加することは拒否（1つに集中）
        longstep_tool.update_goal(self.path, s3, status="completed")
        mid2 = longstep_tool.add_goal(self.path, "別の中目標", goal_level="middle")["target"]
        with self.assertRaisesRegex(ValueError, "未達成の小目標は現在進める1つの中目標.*に集中"):
            longstep_tool.add_subgoal(self.path, mid2, "別の中の小")

    def test_add_next_goal_serial_handover(self):
        # 小1 -> 中目標 がある状態で add_next_goal(小1, 小2) すると 小1 -> 小2 -> 中目標 と直列に挟まれる
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        s1 = longstep_tool.add_subgoal(self.path, mid, "小1")["target"]

        s2 = longstep_tool.add_next_goal(self.path, s1, "小2")["target"]
        goal_s2 = longstep_tool.get_goal(self.path, s2)
        goal_mid = longstep_tool.get_goal(self.path, mid)

        # 小2 の前提は 小1
        self.assertEqual(goal_s2["goal"]["dependsOn"], [s1])
        # 中目標 の前提は 小2（小1 から引き継がれ直列になる）
        self.assertEqual(goal_mid["goal"]["dependsOn"], [s2])

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

    def test_description_and_name_length_constraints(self):
        # 120文字超または改行を含むdescriptionはACTION付きエラーで拒否する
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "テスト目標", description="あ" * 121)
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "テスト目標", description="1行目\n2行目")
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.update_goal(self.path, "node-1", description="あ" * 121)

        # 40文字超または改行を含むnameもACTION付きエラーで拒否する
        with self.assertRaisesRegex(ValueError, "ACTION:"):
            longstep_tool.add_goal(self.path, "あ" * 41)

        # 既存JSONに長文descriptionが含まれていても読み込み・他項目の更新は壊れない
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
