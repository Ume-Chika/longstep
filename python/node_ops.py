"""Node field extraction, alias resolution, and identifier lookup."""

from constants import (
    _ALL_FIELDS,
    _DEFAULT_FIELDS,
    _FIELD_ALIASES,
)


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
            f"複数の目標が一致しました（{len(candidates)}件）: {', '.join(names)}。"
            "ACTION: より具体的な名前、または上記の一意な目標IDで指定してください。"
        )
    return None
