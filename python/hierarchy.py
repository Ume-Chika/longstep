"""Goal hierarchy, level validation, and WIP limit rules."""

from constants import _LEVEL_LABEL, _LEVEL_RANK, _WIP_LIMITS


def _is_loop_node(node):
    return node.get("goalLevel") == "loop" or bool(node.get("recurrence", {}).get("enabled"))


def _validate_hierarchy(nodes, target_id):
    """目標間の粒度階層（逆流禁止・中/大目標の直列禁止）を検証する。"""
    nodes_by_id = {n["id"]: n for n in nodes}
    target = nodes_by_id.get(target_id)
    if not target or _is_loop_node(target):
        return

    edges_to_check = []
    for dep_id in target.get("dependsOn", []):
        if dep_id in nodes_by_id:
            edges_to_check.append((nodes_by_id[dep_id], target))
    for other in nodes:
        if target_id in other.get("dependsOn", []):
            edges_to_check.append((target, other))

    for prereq, succ in edges_to_check:
        if _is_loop_node(prereq) or _is_loop_node(succ):
            continue
        p_level = prereq.get("goalLevel", "minor")
        s_level = succ.get("goalLevel", "minor")
        p_rank = _LEVEL_RANK.get(p_level, 1)
        s_rank = _LEVEL_RANK.get(s_level, 1)
        if p_rank > s_rank:
            raise ValueError(
                f"粒度の逆流は設定できません: '{prereq['name']}'({_LEVEL_LABEL.get(p_level, p_level)}) ──> '{succ['name']}'({_LEVEL_LABEL.get(s_level, s_level)})。"
                "ACTION: 道筋は『小(minor) → 中(middle) → 大(major) → 最終目標』の順になるよう goal_level または接続先を変更してください。"
            )
        if p_rank == s_rank and p_level in ("middle", "major"):
            raise ValueError(
                f"同じ粒度の直列接続は小目標（小 → 小）のみ許容されます: '{prereq['name']}' ──> '{succ['name']}' ({_LEVEL_LABEL.get(p_level, p_level)})。"
                "ACTION: 中目標同士・大目標同士は直列に繋げず、前提側をより小さい粒度にするか、上位目標へ並列に接続してください。"
            )


def _find_non_minor_parents(nodes, successors, start_id):
    parents = set()
    visited = set()
    stack = list(successors.get(start_id, []))
    while stack:
        curr = stack.pop()
        cid = curr["id"]
        if cid in visited or _is_loop_node(curr):
            continue
        visited.add(cid)
        clevel = curr.get("goalLevel", "minor")
        if clevel in ("middle", "major"):
            parents.add(cid)
        else:
            stack.extend(successors.get(cid, []))
    return parents


def _validate_wip_and_focus(nodes, target_id):
    """未達成数の上限（大2・中3・小3）と小目標の集中（1つの中目標に揃える）を検証する。"""
    nodes_by_id = {n["id"]: n for n in nodes}
    target = nodes_by_id.get(target_id)
    if not target or _is_loop_node(target) or target.get("status") == "completed":
        return

    level = target.get("goalLevel", "minor")
    limit = _WIP_LIMITS.get(level)
    if limit is not None:
        active_same = [
            n for n in nodes
            if not _is_loop_node(n)
            and n.get("status") != "completed"
            and n.get("goalLevel", "minor") == level
        ]
        if len(active_same) > limit:
            existing = "、".join(f"'{n['name']}'" for n in active_same if n["id"] != target_id)
            raise ValueError(
                f"未達成の{_LEVEL_LABEL.get(level, level)}は同時に{limit}件までです（現在未達成: {existing}）。"
                "ACTION: 未来のタスクを先回りして登録しないでください（別ファイルへのTODO書き出しや説明文への詰め込みも禁止）。"
                "些細な作業や手順はノードを作らず現在の小目標の作業として直接実行し、"
                f"新しい{_LEVEL_LABEL.get(level, level)}は既存の目標を完了（update_goal(..., status='completed')）させて枠を空けてから追加してください。"
            )

    if level == "minor":
        successors = {}
        for n in nodes:
            for dep_id in n.get("dependsOn", []):
                successors.setdefault(dep_id, []).append(n)

        active_minors = [
            n for n in nodes
            if not _is_loop_node(n)
            and n.get("status") != "completed"
            and n.get("goalLevel", "minor") == "minor"
        ]
        all_parents = set()
        for m in active_minors:
            all_parents.update(_find_non_minor_parents(nodes, successors, m["id"]))

        if len(all_parents) > 1:
            parent_names = "、".join(
                f"'{nodes_by_id[pid]['name']}'" for pid in sorted(all_parents) if pid in nodes_by_id
            )
            raise ValueError(
                f"未達成の小目標は現在進める1つの中目標（または大目標）に集中させる必要があります（複数の接続先: {parent_names}）。"
                "ACTION: 複数の中目標を同時に小目標へ分解しないでください。まず現在進行中の中目標の小目標を完了（status='completed'）させてから、次の中目標を分解してください。"
            )
        if len(all_parents) == 1 and not _find_non_minor_parents(nodes, successors, target_id):
            parent_id = next(iter(all_parents))
            parent_name = nodes_by_id[parent_id]["name"]
            raise ValueError(
                f"未達成の小目標は現在進める目標 '{parent_name}' に集中させる必要があります（独立した小目標は追加できません）。"
                f"ACTION: add_subgoal('{parent_name}', ...) または add_next_goal() を使って '{parent_name}' へ向かう道筋に接続してください。"
            )
