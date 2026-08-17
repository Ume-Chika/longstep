import json
import os
import tempfile
import uuid
from datetime import date, datetime, timezone
from pathlib import Path


_UNSET = object()
_STATUSES = {"not_started", "completed"}
_GOAL_LEVELS = {"major", "middle", "minor", "loop"}
_THEMES = {"fire", "water", "wind", "earth", "gold", "space", "fancy", "recommended"}


def _date(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field}は文字列で指定してください。")
    if value:
        try:
            date.fromisoformat(value)
        except ValueError as error:
            raise ValueError(f"{field}はYYYY-MM-DD形式で指定してください。") from error


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
        raise ValueError(f"{field}は空でない文字列で指定してください。")


def _validate_plan(plan):
    _keys(plan, {"id", "name", "goal", "nodes", "meta"}, set(), "計画")
    _nonempty_string(plan["id"], "計画ID")
    _nonempty_string(plan["name"], "計画名")

    goal = plan["goal"]
    _keys(goal, {"statement", "deadline", "successCriteria"}, set(), "最終目標")
    if not isinstance(goal["statement"], str):
        raise ValueError("最終目標は文字列で指定してください。")
    _date(goal["deadline"], "最終期限")
    if not isinstance(goal["successCriteria"], list) or any(
        not isinstance(item, str) or not item for item in goal["successCriteria"]
    ):
        raise ValueError("達成条件は空でない文字列の配列で指定してください。")

    if not isinstance(plan["nodes"], list):
        raise ValueError("目標一覧は配列である必要があります。")
    ids = set()
    for index, node in enumerate(plan["nodes"]):
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
            raise ValueError(f"{field}.statusが不正です。")
        _date(node["targetDate"], f"{field}.targetDate")
        if not isinstance(node["description"], str) or not isinstance(node["nextAction"], str):
            raise ValueError(f"{field}の説明と次の行動は文字列で指定してください。")
        if "goalLevel" in node and node["goalLevel"] not in _GOAL_LEVELS:
            raise ValueError(f"{field}.goalLevelが不正です。")
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

    meta = plan["meta"]
    _keys(meta, {"revision", "createdAt", "updatedAt"}, {"theme"}, "meta")
    revision = meta["revision"]
    if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
        raise ValueError("revisionは0以上の整数で指定してください。")
    _datetime(meta["createdAt"], "createdAt")
    _datetime(meta["updatedAt"], "updatedAt")
    if "theme" in meta and meta["theme"] not in _THEMES:
        raise ValueError(f"themeは{'・'.join(sorted(_THEMES))}のいずれかで指定してください。")


def _read_plan(plan_path):
    path = Path(plan_path)
    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
        _validate_plan(plan)
        if path.stem != plan["id"]:
            raise ValueError(f"ファイル名と計画IDが一致しません: {path.stem} / {plan['id']}")
        return plan
    except FileNotFoundError as error:
        raise FileNotFoundError(f"計画JSONが見つかりません: {path}。Longstepで保存先を再設定してください。") from error
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise ValueError(f"計画JSONを読み込めません: {path}。内容をLongstepで確認してください。原因: {error}") from error


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
        raise OSError(f"計画JSONを書き込めません: {path}。元データは変更していません。再試行してください。") from error


def _update(plan_path, operation, target, change):
    plan = _read_plan(plan_path)
    change(plan)
    plan["meta"]["revision"] += 1
    plan["meta"]["updatedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    _validate_plan(plan)
    _write_plan(plan_path, plan)
    return {"revision": plan["meta"]["revision"], "operation": operation, "target": target}


_DEFAULT_FIELDS = ("id", "name", "status")
_ALL_FIELDS = (
    "id",
    "name",
    "status",
    "goalLevel",
    "targetDate",
    "description",
    "nextAction",
    "dependsOn",
    "recurrence",
)

_FIELD_ALIASES = {
    "goal_level": "goalLevel",
    "level": "goalLevel",
    "target_date": "targetDate",
    "date": "targetDate",
    "desc": "description",
    "next_action": "nextAction",
    "depends_on": "dependsOn",
    "depends": "dependsOn",
}


def _normalize_field_name(name):
    return _FIELD_ALIASES.get(name, name)


def _extract_node_fields(node, fields=None):
    if fields is None:
        target_fields = _DEFAULT_FIELDS
    elif fields == "all":
        target_fields = _ALL_FIELDS
    elif fields == "summary":
        target_fields = ("id", "name", "goalLevel", "status", "dependsOn")
    elif isinstance(fields, (list, tuple, set)):
        target_fields = ["id"] + [_normalize_field_name(f) for f in fields if _normalize_field_name(f) != "id"]
    elif isinstance(fields, str):
        target_fields = ["id", _normalize_field_name(fields)]
    else:
        target_fields = _DEFAULT_FIELDS

    result = {}
    for f in target_fields:
        if f == "id":
            result["id"] = node["id"]
        elif f == "name":
            result["name"] = node.get("name", "")
        elif f == "status":
            result["status"] = node.get("status", "not_started")
        elif f == "goalLevel":
            result["goalLevel"] = node.get("goalLevel")
        elif f == "targetDate":
            result["targetDate"] = node.get("targetDate", "")
        elif f == "description":
            result["description"] = node.get("description", "")
        elif f == "nextAction":
            result["nextAction"] = node.get("nextAction", "")
        elif f == "dependsOn":
            result["dependsOn"] = list(node.get("dependsOn", []))
        elif f == "recurrence":
            result["recurrence"] = dict(node.get("recurrence", {}))
    return result


def _find_node_by_identifier(nodes, identifier):
    """UUIDまたは名前（完全一致・部分一致）で目標を探す。"""
    # 1. 完全一致（ID）
    for node in nodes:
        if node["id"] == identifier:
            return node
    # 2. 完全一致（名前）
    for node in nodes:
        if node["name"] == identifier:
            return node
    # 3. 前方一致 / 部分一致（名前）
    candidates = [node for node in nodes if identifier in node["name"]]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        exact = [node for node in candidates if node["name"] == identifier]
        if len(exact) == 1:
            return exact[0]
        names = [f"'{n['name']}' ({n['id']})" for n in candidates[:5]]
        raise ValueError(
            f"複数の目標が一致しました（{len(candidates)}件）: {', '.join(names)}。より具体的な名前またはIDで指定してください。"
        )
    return None


def get_plan_summary(plan_path):
    plan = _read_plan(plan_path)
    return {
        "id": plan["id"],
        "name": plan["name"],
        "goal": dict(plan["goal"]),
        "revision": plan["meta"]["revision"],
    }


def list_goals(plan_path, *, status=None, goal_level=None, fields=None):
    """目標一覧を返す。

    Args:
        status: 'not_started', 'completed' 等で絞り込み（Noneで全件）
        goal_level: 'major', 'middle', 'minor', 'loop' 等で絞り込み（Noneで全件）
        fields: 返す項目の指定。デフォルトは ['id', 'name', 'status']。'all' で全項目。
    """
    nodes = _read_plan(plan_path)["nodes"]
    if status is not None:
        nodes = [n for n in nodes if n.get("status") == status]
    if goal_level is not None:
        nodes = [n for n in nodes if n.get("goalLevel") == goal_level]
    return [_extract_node_fields(n, fields) for n in nodes]


def get_goal(plan_path, goal_id, *, fields="all"):
    """指定目標の詳細と関連目標を返す。デフォルトは全項目('all')。"""
    plan = _read_plan(plan_path)
    node = _find_node_by_identifier(plan["nodes"], goal_id)
    if node is None:
        raise KeyError(f"目標が見つかりません: {goal_id}。list_goals()で確認してください。")

    actual_id = node["id"]
    related = []
    for item in plan["nodes"]:
        if item["id"] in node["dependsOn"]:
            related.append({**_extract_node_fields(item, fields), "relation": "prerequisite"})
        elif actual_id in item["dependsOn"]:
            related.append({**_extract_node_fields(item, fields), "relation": "dependent"})

    return {"goal": _extract_node_fields(node, fields), "relatedGoals": related}


def update_plan(plan_path, *, name=_UNSET, statement=_UNSET, deadline=_UNSET, success_criteria=_UNSET):
    fields = {
        "name": name,
        "statement": statement,
        "deadline": deadline,
        "successCriteria": success_criteria,
    }
    selected = [field for field, value in fields.items() if value is not _UNSET]
    if not selected:
        raise ValueError("更新項目がありません。name、statement、deadline、success_criteriaのいずれかを指定してください。")

    def change(plan):
        if name is not _UNSET:
            plan["name"] = name
        if statement is not _UNSET:
            plan["goal"]["statement"] = statement
        if deadline is not _UNSET:
            plan["goal"]["deadline"] = deadline
        if success_criteria is not _UNSET:
            plan["goal"]["successCriteria"] = success_criteria

    return _update(plan_path, "update_plan", selected, change)


def add_goal(
    plan_path,
    name,
    *,
    target_date="",
    description="",
    next_action="",
    goal_level="minor",
    depends_on=None,
    recurrence_enabled=False,
    recurrence_cadence="",
    completed_count=0,
):
    """目標を追加する。目標名(name)はマップ表示のため10〜20文字程度を目安にし、詳細や参照ファイルはdescriptionへ記載する。"""
    goal_id = f"node-{uuid.uuid4()}"
    dependencies = [] if depends_on is None else list(depends_on)

    def change(plan):
        known_ids = {node["id"] for node in plan["nodes"]}
        missing = set(dependencies) - known_ids
        if missing:
            raise KeyError(f"前提目標が見つかりません: {', '.join(sorted(missing))}。list_goals()でIDを確認してください。")
        plan["nodes"].append({
            "id": goal_id,
            "name": name,
            "status": "not_started",
            "targetDate": target_date,
            "description": description,
            "nextAction": next_action,
            "goalLevel": goal_level,
            "recurrence": {
                "enabled": recurrence_enabled,
                "cadence": recurrence_cadence,
                "completedCount": completed_count,
            },
            "dependsOn": dependencies,
        })

    return _update(plan_path, "add_goal", goal_id, change)


def add_subgoal(
    plan_path,
    parent,
    name,
    *,
    target_date="",
    description="",
    next_action="",
    goal_level="minor",
    recurrence_enabled=False,
    recurrence_cadence="",
    completed_count=0,
):
    """親目標（IDまたは名前）の前提となるサブ目標（小目標）を追加する。"""
    goal_id = f"node-{uuid.uuid4()}"

    def change(plan):
        parent_node = _find_node_by_identifier(plan["nodes"], parent)
        if parent_node is None:
            raise KeyError(f"親目標が見つかりません: '{parent}'。list_goals()で確認してください。")

        plan["nodes"].append({
            "id": goal_id,
            "name": name,
            "status": "not_started",
            "targetDate": target_date,
            "description": description,
            "nextAction": next_action,
            "goalLevel": goal_level,
            "recurrence": {
                "enabled": recurrence_enabled,
                "cadence": recurrence_cadence,
                "completedCount": completed_count,
            },
            "dependsOn": [],
        })
        if goal_id not in parent_node["dependsOn"]:
            parent_node["dependsOn"].append(goal_id)

    return _update(plan_path, "add_subgoal", goal_id, change)


def update_goal(
    plan_path,
    goal_id,
    *,
    name=_UNSET,
    status=_UNSET,
    target_date=_UNSET,
    description=_UNSET,
    next_action=_UNSET,
    goal_level=_UNSET,
    depends_on=_UNSET,
    recurrence_enabled=_UNSET,
    recurrence_cadence=_UNSET,
    completed_count=_UNSET,
):
    """目標を更新する。目標名(name)を変更する場合は10〜20文字程度を目安にする。goal_idにはIDまたは目標名を指定可能。"""
    values = {
        "name": name,
        "status": status,
        "targetDate": target_date,
        "description": description,
        "nextAction": next_action,
        "goalLevel": goal_level,
        "dependsOn": depends_on,
    }
    recurrence_values = {
        "enabled": recurrence_enabled,
        "cadence": recurrence_cadence,
        "completedCount": completed_count,
    }
    selected = [field for field, value in {**values, **recurrence_values}.items() if value is not _UNSET]
    if not selected:
        raise ValueError("更新項目がありません。変更する値をキーワード引数で指定してください。")

    def change(plan):
        node = _find_node_by_identifier(plan["nodes"], goal_id)
        if node is None:
            raise KeyError(f"目標が見つかりません: {goal_id}。list_goals()でIDを確認してください。")
        actual_id = node["id"]
        if depends_on is not _UNSET:
            dependencies = list(depends_on)
            known_ids = {item["id"] for item in plan["nodes"]} - {actual_id}
            missing = set(dependencies) - known_ids
            if missing:
                raise KeyError(f"前提目標が見つかりません: {', '.join(sorted(missing))}。list_goals()でIDを確認してください。")
            values["dependsOn"] = dependencies
        for field, value in values.items():
            if value is not _UNSET:
                node[field] = value
        if any(value is not _UNSET for value in recurrence_values.values()):
            recurrence = node.setdefault("recurrence", {"enabled": False, "cadence": "", "completedCount": 0})
            for field, value in recurrence_values.items():
                if value is not _UNSET:
                    recurrence[field] = value

    return _update(plan_path, "update_goal", goal_id, change)


def delete_goal(plan_path, goal_id):
    def change(plan):
        node = _find_node_by_identifier(plan["nodes"], goal_id)
        if node is None:
            raise KeyError(f"目標が見つかりません: {goal_id}。list_goals()でIDを確認してください。")
        actual_id = node["id"]
        plan["nodes"] = [item for item in plan["nodes"] if item["id"] != actual_id]
        for item in plan["nodes"]:
            item["dependsOn"] = [dependency for dependency in item["dependsOn"] if dependency != actual_id]

    return _update(plan_path, "delete_goal", goal_id, change)
