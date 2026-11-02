"""Unit tests for the agent CLI interface."""

import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import cli
from test_fixtures import plan_data


class LongstepCliTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.path = Path(self.temporary.name) / "plan-1.json"
        self.path.write_text(json.dumps(plan_data()), encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def _run_cli(self, args):
        f = io.StringIO()
        with redirect_stdout(f):
            cli.run_cli(self.path, args)
        return f.getvalue()

    def test_status_output(self):
        out = self._run_cli([])
        self.assertIn("PLAN: 確認用計画", out)
        self.assertIn("GOAL: 目標", out)
        self.assertIn("ACTIONABLE (1):", out)
        self.assertIn("開始", out)

    def test_list_and_get_output(self):
        out_list = self._run_cli(["list"])
        self.assertIn("[node-1] [not_started] [minor] 開始", out_list)

        out_get = self._run_cli(["get", "node-1"])
        self.assertIn("ID: node-1", out_get)
        self.assertIn("NAME: 開始", out_get)

    def test_complete_and_add(self):
        out_comp = self._run_cli(["complete", "node-1"])
        self.assertIn("STATUS: COMPLETED", out_comp)

        out_status = self._run_cli(["status"])
        self.assertIn("ACTIONABLE: (none)", out_status)

        out_add = self._run_cli(["add", "新規タスク"])
        self.assertIn("STATUS: ADDED", out_add)


if __name__ == "__main__":
    unittest.main()
