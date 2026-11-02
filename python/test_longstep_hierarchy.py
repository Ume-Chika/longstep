"""Unit tests for hierarchy rules, WIP limits, and dependency normalization."""

import json
import tempfile
import unittest
from pathlib import Path

import longstep_tool
from test_fixtures import plan_data


class LongstepHierarchyTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary.name) / "plan-1.json"
        self.path.write_text(json.dumps(plan_data()), encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def test_add_subgoal_and_name_resolution(self):
        added = longstep_tool.add_subgoal(self.path, "開始", "小目標1")
        subgoal_id = added["target"]

        parent_goal = longstep_tool.get_goal(self.path, "開始")
        self.assertIn(subgoal_id, parent_goal["goal"]["dependsOn"])

        added_next = longstep_tool.add_next_goal(self.path, "小目標1", "小目標2")
        next_id = added_next["target"]
        next_goal = longstep_tool.get_goal(self.path, next_id)
        self.assertIn(subgoal_id, next_goal["goal"]["dependsOn"])

        longstep_tool.update_goal(self.path, "小目標1", status="completed")
        subgoal = longstep_tool.get_goal(self.path, subgoal_id)
        self.assertEqual(subgoal["goal"]["status"], "completed")

        longstep_tool.delete_goal(self.path, "小目標1")
        parent_goal_after = longstep_tool.get_goal(self.path, "開始")
        self.assertNotIn(subgoal_id, parent_goal_after["goal"]["dependsOn"])

    def test_transitive_reduction_and_cycle_prevention(self):
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        g_a = longstep_tool.add_goal(self.path, "TaskA", goal_level="minor")["target"]
        g_b = longstep_tool.add_goal(self.path, "TaskB", goal_level="minor", depends_on=[g_a])["target"]
        g_c = longstep_tool.add_goal(self.path, "TaskC", goal_level="middle", depends_on=[g_b])["target"]

        g_d = longstep_tool.add_goal(self.path, "TaskD", goal_level="major", depends_on=[g_a, g_b, g_c])["target"]
        goal_d = longstep_tool.get_goal(self.path, g_d)
        self.assertEqual(goal_d["goal"]["dependsOn"], [g_c])

        with self.assertRaises(ValueError):
            longstep_tool.update_goal(self.path, g_a, depends_on=[g_d])

    def test_hierarchy_validation_prevents_reverse_and_same_level_middle_major(self):
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        with self.assertRaisesRegex(ValueError, "粒度の逆流"):
            longstep_tool.add_subgoal(self.path, "node-1", "大目標の子", goal_level="major")

        with self.assertRaisesRegex(ValueError, "同じ粒度の直列接続は小目標"):
            longstep_tool.add_next_goal(self.path, mid, "次の中目標", goal_level="middle")

    def test_wip_limits_and_single_parent_focus(self):
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        s1 = longstep_tool.add_subgoal(self.path, mid, "小1")["target"]
        longstep_tool.update_goal(self.path, mid, depends_on=[s1, "node-1"])
        longstep_tool.add_subgoal(self.path, mid, "小2")

        with self.assertRaisesRegex(ValueError, "未達成の小目標.*は同時に3件まで"):
            longstep_tool.add_subgoal(self.path, mid, "小3")

        longstep_tool.update_goal(self.path, "node-1", status="completed")
        s3 = longstep_tool.add_subgoal(self.path, mid, "小3")["target"]
        self.assertTrue(s3)

        longstep_tool.update_goal(self.path, s3, status="completed")
        mid2 = longstep_tool.add_goal(self.path, "別の中目標", goal_level="middle")["target"]
        with self.assertRaisesRegex(ValueError, "未達成の小目標は現在進める1つの中目標.*に集中"):
            longstep_tool.add_subgoal(self.path, mid2, "別の中の小")

    def test_add_next_goal_serial_handover(self):
        longstep_tool.update_goal(self.path, "node-1", status="completed")
        mid = longstep_tool.add_goal(self.path, "中目標", goal_level="middle")["target"]
        s1 = longstep_tool.add_subgoal(self.path, mid, "小1")["target"]

        s2 = longstep_tool.add_next_goal(self.path, s1, "小2")["target"]
        goal_s2 = longstep_tool.get_goal(self.path, s2)
        goal_mid = longstep_tool.get_goal(self.path, mid)

        self.assertEqual(goal_s2["goal"]["dependsOn"], [s1])
        self.assertEqual(goal_mid["goal"]["dependsOn"], [s2])


if __name__ == "__main__":
    unittest.main()
