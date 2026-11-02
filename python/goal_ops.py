"""Goal mutation operations: add, subgoal, next, update, delete."""

import uuid
from constants import _LEVEL_RANK, _UNSET
from dependencies import _normalize_dependencies
from hierarchy import _validate_hierarchy, _validate_wip_and_focus
from node_ops import _find_node_by_identifier
from storage import _update
from validation import _validate_goal_text_limits


def _build_node(gid, name, tdate, desc, act, lvl, rec_en, rec_cad, rec_cnt, deps):
    return {
        "id": gid,
        "name": name,
        "status": "not_started",
        "targetDate": tdate,
        "description": desc,
        "nextAction": act,
        "goalLevel": lvl,
        "recurrence": {"enabled": rec_en, "cadence": rec_cad, "completedCount": rec_cnt},
        "dependsOn": deps,
    }


def add_goal_op(plan_path, name, *, target_date="", description="", next_action="", goal_level="minor", depends_on=None, recurrence_enabled=False, recurrence_cadence="", completed_count=0):
    _validate_goal_text_limits(name=name, description=description)
    gid = f"node-{uuid.uuid4()}"
    raw_deps = [] if depends_on is None else list(depends_on)

    def change(plan):
        known = {n["id"] for n in plan["nodes"]}
        resolved = []
        for d in raw_deps:
            found = _find_node_by_identifier(plan["nodes"], d)
            if found:
                resolved.append(found["id"])
            elif d in known:
                resolved.append(d)
            else:
                raise KeyError(f"前提目標が見つかりません: '{d}'。ACTION: list_goals() で確認してください。")
        node = _build_node(gid, name, target_date, description, next_action, goal_level, recurrence_enabled, recurrence_cadence, completed_count, _normalize_dependencies(plan["nodes"], gid, resolved))
        plan["nodes"].append(node)
        _validate_hierarchy(plan["nodes"], gid)
        _validate_wip_and_focus(plan["nodes"], gid)

    return _update(plan_path, "add_goal", gid, change)


def add_subgoal_op(plan_path, target_goal, name, *, target_date="", description="", next_action="", goal_level="minor", recurrence_enabled=False, recurrence_cadence="", completed_count=0):
    _validate_goal_text_limits(name=name, description=description)
    gid = f"node-{uuid.uuid4()}"

    def change(plan):
        parent = _find_node_by_identifier(plan["nodes"], target_goal)
        if parent is None:
            raise KeyError(f"対象の目標が見つかりません: '{target_goal}'。ACTION: list_goals() で確認してください。")
        node = _build_node(gid, name, target_date, description, next_action, goal_level, recurrence_enabled, recurrence_cadence, completed_count, [])
        plan["nodes"].append(node)
        raw = list(parent.get("dependsOn", []))
        if gid not in raw:
            raw.append(gid)
        parent["dependsOn"] = _normalize_dependencies(plan["nodes"], parent["id"], raw)
        _validate_hierarchy(plan["nodes"], gid)
        _validate_wip_and_focus(plan["nodes"], gid)

    return _update(plan_path, "add_subgoal", gid, change)


def add_next_goal_op(plan_path, prev_goal, name, *, target_date="", description="", next_action="", goal_level="minor", recurrence_enabled=False, recurrence_cadence="", completed_count=0):
    _validate_goal_text_limits(name=name, description=description)
    gid = f"node-{uuid.uuid4()}"

    def change(plan):
        prev = _find_node_by_identifier(plan["nodes"], prev_goal)
        if prev is None:
            raise KeyError(f"直前の目標が見つかりません: '{prev_goal}'。ACTION: list_goals() で確認してください。")
        deps = _normalize_dependencies(plan["nodes"], gid, [prev["id"]])
        node = _build_node(gid, name, target_date, description, next_action, goal_level, recurrence_enabled, recurrence_cadence, completed_count, deps)
        plan["nodes"].append(node)

        new_rank = _LEVEL_RANK.get(goal_level, 1)
        for succ in plan["nodes"]:
            if succ["id"] != gid and prev["id"] in succ.get("dependsOn", []):
                succ_rank = _LEVEL_RANK.get(succ.get("goalLevel", "minor"), 1)
                if succ_rank >= new_rank:
                    sdeps = [d for d in succ.get("dependsOn", []) if d != prev["id"]]
                    sdeps.append(gid)
                    succ["dependsOn"] = _normalize_dependencies(plan["nodes"], succ["id"], sdeps)

        _validate_hierarchy(plan["nodes"], gid)
        _validate_wip_and_focus(plan["nodes"], gid)

    return _update(plan_path, "add_next_goal", gid, change)


def update_goal_op(plan_path, goal_id, *, name=_UNSET, status=_UNSET, target_date=_UNSET, description=_UNSET, next_action=_UNSET, goal_level=_UNSET, depends_on=_UNSET, recurrence_enabled=_UNSET, recurrence_cadence=_UNSET, completed_count=_UNSET):
    _validate_goal_text_limits(name=name, description=description)
    vals = {"name": name, "status": status, "targetDate": target_date, "description": description, "nextAction": next_action, "goalLevel": goal_level, "dependsOn": depends_on}
    rec_vals = {"enabled": recurrence_enabled, "cadence": recurrence_cadence, "completedCount": completed_count}
    selected = [k for k, v in {**vals, **rec_vals}.items() if v is not _UNSET]
    if not selected:
        raise ValueError("更新項目がありません。ACTION: name=, status= 等の引数を指定してください。")

    def change(plan):
        node = _find_node_by_identifier(plan["nodes"], goal_id)
        if node is None:
            raise KeyError(f"目標が見つかりません: '{goal_id}'。ACTION: list_goals() で確認してください。")
        actual_id = node["id"]
        if depends_on is not _UNSET:
            resolved = []
            known = {item["id"] for item in plan["nodes"]} - {actual_id}
            for dep in list(depends_on):
                found = _find_node_by_identifier(plan["nodes"], dep)
                if found and found["id"] != actual_id:
                    resolved.append(found["id"])
                elif dep in known:
                    resolved.append(dep)
                else:
                    raise KeyError(f"前提目標が見つかりません: '{dep}'。ACTION: list_goals() で確認してください。")
            vals["dependsOn"] = _normalize_dependencies(plan["nodes"], actual_id, resolved)
        for k, v in vals.items():
            if v is not _UNSET:
                node[k] = v
        if any(v is not _UNSET for v in rec_vals.values()):
            rec = node.setdefault("recurrence", {"enabled": False, "cadence": "", "completedCount": 0})
            for k, v in rec_vals.items():
                if v is not _UNSET:
                    rec[k] = v
        if goal_level is not _UNSET or depends_on is not _UNSET or status is not _UNSET:
            _validate_hierarchy(plan["nodes"], actual_id)
            if node.get("status") != "completed":
                _validate_wip_and_focus(plan["nodes"], actual_id)

    return _update(plan_path, "update_goal", goal_id, change)


def delete_goal_op(plan_path, goal_id):
    def change(plan):
        node = _find_node_by_identifier(plan["nodes"], goal_id)
        if node is None:
            raise KeyError(f"目標が見つかりません: '{goal_id}'。ACTION: list_goals() で確認してください。")
        actual_id = node["id"]
        plan["nodes"] = [item for item in plan["nodes"] if item["id"] != actual_id]
        for item in plan["nodes"]:
            item["dependsOn"] = [dep for dep in item["dependsOn"] if dep != actual_id]

    return _update(plan_path, "delete_goal", goal_id, change)
