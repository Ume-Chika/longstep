"""Validation logic for Longstep plans and goals."""

from datetime import date, datetime
from constants import (
    _GOAL_LEVELS,
    _STATUSES,
    _THEMES,
    _UNSET,
    MAX_DESCRIPTION_LENGTH,
    MAX_NAME_LENGTH,
)


def _date(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field}は文字列で指定してください。ACTION: 'YYYY-MM-DD' 形式の文字列（例: '2026-03-01'）で指定してください。")
    if value:
        try:
            date.fromisoformat(value)
        except ValueError as error:
            raise ValueError(
                f"{field}はYYYY-MM-DD形式で指定してください（現在: '{value}'）。"
                "ACTION: 正しい日付形式（例: '2026-03-01'）に修正して再実行してください。"
            ) from error


def _datetime(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field}は文字列で指定してください。")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field}はISO 8601形式で指定してください。") from error


def _keys(value, required, optional, field):
    if not isinstance(value, dict):
        raise ValueError(f"{field}はオブジェクトである必要があります。")
    missing = required - value.keys()
    extra = value.keys() - required - optional
    if missing:
        raise ValueError(f"{field}に必須項目がありません: {', '.join(sorted(missing))}")
    if extra:
        raise ValueError(f"{field}に未対応の項目があります: {', '.join(sorted(extra))}")


def _nonempty_string(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field}は空でない文字列で指定してください。ACTION: 意味のある名称またはIDを指定して再実行してください。")


def _validate_goal_text_limits(*, name=_UNSET, description=_UNSET):
    if name is not _UNSET:
        _nonempty_string(name, "目標名(name)")
        if "\n" in name or "\r" in name or len(name) > MAX_NAME_LENGTH:
            raise ValueError(
                f"目標名(name)は改行なしの{MAX_NAME_LENGTH}文字以内で指定してください（現在 {len(name)} 文字）。"
                "ACTION: 計画マップのノード枠に収まるよう10〜20文字程度の簡潔な名称に短縮し、"
                "補足は description（120文字以内）へ記載して再実行してください。"
            )
    if description is not _UNSET:
        if not isinstance(description, str):
            raise ValueError("description は文字列で指定してください。")
        if "\n" in description or "\r" in description or len(description) > MAX_DESCRIPTION_LENGTH:
            raise ValueError(
                f"description は改行なしの{MAX_DESCRIPTION_LENGTH}文字以内で指定してください（現在 {len(description)} 文字）。"
                "ACTION: 作業ログ・日付付きメモ・詳細な背景はプロジェクト内のMarkdownファイルへ記録し、"
                "description には「要点1文＋参照ファイルパス（例: 参考: docs/spec.md）」のみを指定して再実行してください。"
            )


def _validate_node(node, index, ids):
    field = f"目標[{index}]"
    _keys(
        node,
        {"id", "name", "status", "targetDate", "description", "nextAction", "dependsOn"},
        {"goalLevel", "recurrence"},
        field,
    )
    _nonempty_string(node["id"], f"{field}.id")
    _nonempty_string(node["name"], f"{field}.name")
    if node["id"] in ids:
        raise ValueError(f"目標IDが重複しています: {node['id']}")
    ids.add(node["id"])
    if node["status"] not in _STATUSES:
        raise ValueError(f"{field}.statusが不正です: '{node['status']}'。not_started または completed を指定してください。")
    _date(node["targetDate"], f"{field}.targetDate")
    if not isinstance(node["description"], str) or not isinstance(node["nextAction"], str):
        raise ValueError(f"{field}の説明と次の行動は文字列で指定してください。")
    if "goalLevel" in node and node["goalLevel"] not in _GOAL_LEVELS:
        raise ValueError(f"{field}.goalLevelが不正です。minor, middle, major, loop のいずれかを指定してください。")
    dependencies = node["dependsOn"]
    if not isinstance(dependencies, list) or any(not isinstance(item, str) or not item for item in dependencies):
        raise ValueError(f"{field}.dependsOnは目標IDの配列で指定してください。")
    if len(dependencies) != len(set(dependencies)):
        raise ValueError(f"{field}.dependsOnに重複があります。")
    if "recurrence" in node:
        recurrence = node["recurrence"]
        _keys(recurrence, {"enabled", "cadence", "completedCount"}, set(), f"{field}.recurrence")
        if not isinstance(recurrence["enabled"], bool) or not isinstance(recurrence["cadence"], str):
            raise ValueError(f"{field}.recurrenceの型が不正です。")
        count = recurrence["completedCount"]
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            raise ValueError(f"{field}.recurrence.completedCountは0以上の整数で指定してください。")


def _validate_plan(plan):
    _keys(plan, {"id", "name", "goal", "nodes", "meta"}, set(), "計画")
    _nonempty_string(plan["id"], "計画ID")
    _nonempty_string(plan["name"], "計画名")

    goal = plan["goal"]
    _keys(goal, {"statement", "deadline", "successCriteria"}, {"description"}, "最終目標")
    if not isinstance(goal["statement"], str):
        raise ValueError("最終目標は文字列で指定してください。")
    if "description" in goal and not isinstance(goal["description"], str):
        raise ValueError("最終目標の説明は文字列で指定してください。")
    _date(goal["deadline"], "最終期限")
    if not isinstance(goal["successCriteria"], list) or any(
        not isinstance(item, str) or not item for item in goal["successCriteria"]
    ):
        raise ValueError("達成条件は空でない文字列の配列で指定してください。")

    if not isinstance(plan["nodes"], list):
        raise ValueError("目標一覧は配列である必要があります。")
    ids = set()
    for index, node in enumerate(plan["nodes"]):
        _validate_node(node, index, ids)

    meta = plan["meta"]
    _keys(meta, {"revision", "createdAt", "updatedAt"}, {"theme"}, "meta")
    revision = meta["revision"]
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ValueError("revisionは0以上の整数で指定してください。")
    _datetime(meta["createdAt"], "createdAt")
    _datetime(meta["updatedAt"], "updatedAt")
    if "theme" in meta and meta["theme"] not in _THEMES:
        raise ValueError(f"themeは{'・'.join(sorted(_THEMES))}のいずれかで指定してください。")
