"""Dependency graph navigation and normalization."""


def _has_dependency_path(nodes_by_id, start_id, end_id, visited=None):
    """start_id の前提ツリーを辿って end_id に到達可能か判定する。"""
    if start_id == end_id:
        return True
    if visited is None:
        visited = set()
    visited.add(start_id)
    node = nodes_by_id.get(start_id)
    if not node:
        return False
    for dep_id in node.get("dependsOn", []):
        if dep_id not in visited and _has_dependency_path(nodes_by_id, dep_id, end_id, visited):
            return True
    return False


def _normalize_dependencies(nodes, target_id, raw_dependencies):
    """循環参照を検出し、推移的迂回路（冗長な依存エッジ）を自動除去して正規化する。"""
    nodes_by_id = {n["id"]: n for n in nodes}

    # 1. 循環参照の検出
    for dep_id in raw_dependencies:
        if dep_id == target_id or _has_dependency_path(nodes_by_id, dep_id, target_id):
            raise ValueError(
                f"目標が循環する依存関係は設定できません: '{target_id}' と '{dep_id}'。"
                "ACTION: 前後の道筋がループしないよう、前提・後続の向きまたは接続先を見直してください。"
            )

    # 2. 推移的冗長エッジ（迂回路）の自動除外（A -> ... -> B がある場合、A は直接の前提として冗長）
    cleaned = []
    for u in raw_dependencies:
        is_redundant = any(
            v != u and _has_dependency_path(nodes_by_id, v, u)
            for v in raw_dependencies
        )
        if not is_redundant:
            cleaned.append(u)
    return cleaned
