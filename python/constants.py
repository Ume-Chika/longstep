"""Longstep tool constants and constraints."""

_UNSET = object()
_STATUSES = {"not_started", "completed"}
_GOAL_LEVELS = {"major", "middle", "minor", "loop"}
_THEMES = {"fire", "water", "wind", "earth", "gold", "space", "fancy"}

MAX_NAME_LENGTH = 40
MAX_DESCRIPTION_LENGTH = 120

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
_RELATED_FIELDS = ("id", "name", "status", "goalLevel", "targetDate")

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

_LEVEL_RANK = {"minor": 1, "middle": 2, "major": 3}
_LEVEL_LABEL = {"minor": "小目標(minor)", "middle": "中目標(middle)", "major": "大目標(major)"}
_WIP_LIMITS = {"major": 2, "middle": 3, "minor": 3}
