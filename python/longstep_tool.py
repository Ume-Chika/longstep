"""Longstep Python tool: Plan inspection and mutation for AI agents."""

from constants import _RELATED_FIELDS, _UNSET
from goal_ops import (
    add_goal_op,
    add_next_goal_op,
    add_subgoal_op,
    delete_goal_op,
    update_goal_op,
)
from node_ops import _extract_node_fields, _find_node_by_identifier
from storage import _read_plan, _update
from validation import _validate_goal_text_limits


def get_plan_summary(plan_path):
    """計画ID・計画名・最終目標・revisionを辞書で返す。作業開始時に全体の方向性を把握するために呼ぶ。"""
    plan = _read_plan(plan_path)
    return {
        "id": plan["id"],
        "name": plan["name"],
        "goal": dict(plan["goal"]),
        "revision": plan["meta"]["revision"],
    }


def list_goals(plan_path, *, status=None, goal_level=None, fields=None):
    """目標一覧を返す。着手可能な目標を探すときは status='actionable' を指定する。
    Negative Trigger: 一覧の確認に fields='all' を使うとコンテキストを浪費するため非推奨。個別詳細は get_goal() を使うこと。
    """
    all_nodes = _read_plan(plan_path)["nodes"]
    nodes = all_nodes
    if status == "actionable":
        completed_ids = {n["id"] for n in all_nodes if n.get("status") == "completed"}
        nodes = [
            n for n in all_nodes
            if n.get("status") == "not_started"
            and n.get("goalLevel") != "loop"
            and all(dep in completed_ids for dep in n.get("dependsOn", []))
        ]
    elif status is not None:
        nodes = [n for n in nodes if n.get("status") == status]
    if goal_level is not None:
        nodes = [n for n in nodes if n.get("goalLevel") == goal_level]
    return [_extract_node_fields(n, fields) for n in nodes]


def get_goal(plan_path, goal_id, *, fields="all"):
    """指定目標（IDまたは名前）の全項目と前後の関連目標サマリを返す。"""
    plan = _read_plan(plan_path)
    node = _find_node_by_identifier(plan["nodes"], goal_id)
    if node is None:
        raise KeyError(f"目標が見つかりません: '{goal_id}'。ACTION: list_goals() でIDまたは目標名を確認してください。")

    actual_id = node["id"]
    related_fields = _RELATED_FIELDS if fields == "all" else fields
    related = []
    for item in plan["nodes"]:
        if item["id"] in node.get("dependsOn", []):
            related.append({**_extract_node_fields(item, related_fields), "relation": "prerequisite"})
        elif actual_id in item.get("dependsOn", []):
            related.append({**_extract_node_fields(item, related_fields), "relation": "dependent"})

    return {"goal": _extract_node_fields(node, fields), "relatedGoals": related}


def update_plan(plan_path, *, name=_UNSET, statement=_UNSET, description=_UNSET, deadline=_UNSET, success_criteria=_UNSET):
    """計画名や最終目標の指定項目を更新する。中・小目標の変更には update_goal() を使うこと。"""
    _validate_goal_text_limits(name=statement, description=description)
    fields = {"name": name, "statement": statement, "description": description, "deadline": deadline, "successCriteria": success_criteria}
    selected = [k for k, v in fields.items() if v is not _UNSET]
    if not selected:
        raise ValueError("更新項目がありません。ACTION: name, statement, description, deadline, success_criteria のいずれかを指定してください。")

    def change(plan):
        if name is not _UNSET:
            plan["name"] = name
        if statement is not _UNSET:
            plan["goal"]["statement"] = statement
        if description is not _UNSET:
            if description:
                plan["goal"]["description"] = description
            else:
                plan["goal"].pop("description", None)
        if deadline is not _UNSET:
            plan["goal"]["deadline"] = deadline
        if success_criteria is not _UNSET:
            plan["goal"]["successCriteria"] = success_criteria

    return _update(plan_path, "update_plan", selected, change)


def add_goal(plan_path, name, **kwargs):
    """独立した目標、または明示的な前提タスクIDリストを持つ目標を追加する。
    Negative Trigger: 大・中目標のサブタスクには add_subgoal()、直前タスクの次には add_next_goal() を優先すること。
    """
    return add_goal_op(plan_path, name, **kwargs)


def add_subgoal(plan_path, target_goal, name, **kwargs):
    """上位目標（大・中目標）を達成するための前提サブ目標を追加する（新目標 ──> target_goal）。
    Negative Trigger: 直前の小目標の続きとして手順を追加する場合は add_next_goal() を使うこと。
    """
    return add_subgoal_op(plan_path, target_goal, name, **kwargs)


def add_next_goal(plan_path, prev_goal, name, **kwargs):
    """直前の目標（prev_goal）の完了後に着手する後続目標を直列に追加する（prev_goal ──> 新目標 ──> 後続）。"""
    return add_next_goal_op(plan_path, prev_goal, name, **kwargs)


def update_goal(plan_path, goal_id, **kwargs):
    """目標を更新する。完了時は status='completed' を指定する。作業ログ・メモの description 追記は禁止。"""
    return update_goal_op(plan_path, goal_id, **kwargs)


def delete_goal(plan_path, goal_id):
    """目標を削除する。Negative Trigger: 達成した目標は削除せず update_goal(..., status='completed') にすること。"""
    return delete_goal_op(plan_path, goal_id)
