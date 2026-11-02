"""Plan file reading, writing, and atomic updating."""

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from validation import _validate_plan


def _read_plan(plan_path):
    path = Path(plan_path)
    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
        _validate_plan(plan)
        if path.stem != plan["id"]:
            raise ValueError(f"ファイル名と計画IDが一致しません: {path.stem} / {plan['id']}")
        return plan
    except FileNotFoundError as error:
        raise FileNotFoundError(
            f"計画JSONが見つかりません: {path}。"
            "ACTION: パスを確認するか、Longstepで保存先を再設定してください。"
        ) from error
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(
            f"計画JSONを読み込めません: {path}。原因: {error}。"
            "ACTION: JSONの構文やフォーマットをLongstepで確認してください。"
        ) from error


def _write_plan(plan_path, plan):
    path = Path(plan_path)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            json.dump(plan, temporary, ensure_ascii=False, indent=2)
            temporary.write("\n")
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
    except OSError as error:
        if temporary_path:
            temporary_path.unlink(missing_ok=True)
        raise OSError(
            f"計画JSONを書き込めません: {path}。元データは変更していません。"
            "ACTION: ディスク空き容量やフォルダの書き込み権限を確認して再試行してください。"
        ) from error


def _update(plan_path, operation, target, change):
    plan = _read_plan(plan_path)
    change(plan)
    plan["meta"]["revision"] += 1
    plan["meta"]["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _validate_plan(plan)
    _write_plan(plan_path, plan)
    return {"revision": plan["meta"]["revision"], "operation": operation, "target": target}
