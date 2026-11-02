"""High-density CLI interface for AI agents and terminals."""

import sys
import longstep_tool
from storage import _read_plan


def _format_status_summary(plan):
    nodes = plan["nodes"]
    completed_ids = {n["id"] for n in nodes if n.get("status") == "completed"}
    actionable = [
        n for n in nodes
        if n.get("status") == "not_started"
        and n.get("goalLevel") != "loop"
        and all(dep in completed_ids for dep in n.get("dependsOn", []))
    ]
    minors = [n for n in nodes if n.get("status") != "completed" and n.get("goalLevel", "minor") == "minor"]
    middles = [n for n in nodes if n.get("status") != "completed" and n.get("goalLevel") == "middle"]
    majors = [n for n in nodes if n.get("status") != "completed" and n.get("goalLevel") == "major"]

    lines = [
        f"PLAN: {plan['name']} (rev:{plan['meta']['revision']})",
        f"GOAL: {plan['goal']['statement']}",
        f"WIP: minor={len(minors)}/3, middle={len(middles)}/3, major={len(majors)}/2",
    ]
    if actionable:
        lines.append(f"ACTIONABLE ({len(actionable)}):")
        for a in actionable:
            lvl = a.get("goalLevel", "minor")
            lines.append(f"  * [{a['id']}] ({lvl}) {a['name']}")
    else:
        lines.append("ACTIONABLE: (none)")
    return "\n".join(lines)


def _cmd_list(path, args):
    status = None
    level = None
    for arg in args:
        if arg.startswith("--status="):
            val = arg.split("=", 1)[1]
            status = None if val == "all" else val
        elif arg.startswith("--level="):
            level = arg.split("=", 1)[1]
    goals = longstep_tool.list_goals(path, status=status, goal_level=level, fields="summary")
    if not goals:
        print("(no goals matched)")
        return
    for g in goals:
        gid = g["id"]
        lvl = g.get("goalLevel", "minor")
        st = g.get("status", "not_started")
        deps = ",".join(g.get("dependsOn", []))
        dep_str = f" <- [{deps}]" if deps else ""
        print(f"[{gid}] [{st}] [{lvl}] {g['name']}{dep_str}")


def _cmd_get(path, args):
    if not args:
        print("ERROR: 目標IDまたは名前を指定してください。例: python3 longstep.py get <ID>")
        return
    res = longstep_tool.get_goal(path, args[0])
    g = res["goal"]
    print(f"ID: {g['id']}")
    print(f"NAME: {g['name']}")
    print(f"STATUS: {g['status']}")
    print(f"LEVEL: {g.get('goalLevel', 'minor')}")
    if g.get("description"):
        print(f"DESC: {g['description']}")
    if g.get("dependsOn"):
        print(f"DEPENDS: {', '.join(g['dependsOn'])}")
    if res.get("relatedGoals"):
        print("RELATED:")
        for r in res["relatedGoals"]:
            print(f"  - [{r['id']}] {r['relation']}: {r['name']} ({r['status']})")


def run_cli(plan_path, argv):
    if not argv or argv[0] in ("status", "summary", "-s"):
        plan = _read_plan(plan_path)
        print(_format_status_summary(plan))
        return

    cmd = argv[0]
    args = argv[1:]

    try:
        if cmd == "list":
            _cmd_list(plan_path, args)
        elif cmd in ("get", "show"):
            _cmd_get(plan_path, args)
        elif cmd in ("complete", "done"):
            if not args:
                print("ERROR: 目標IDまたは名前を指定してください。例: python3 longstep.py complete <ID>")
                return
            res = longstep_tool.update_goal(plan_path, args[0], status="completed")
            print(f"STATUS: COMPLETED | target={res['target']} revision={res['revision']}")
        elif cmd == "next":
            if len(args) < 2:
                print("ERROR: 直前目標と新目標名を指定してください。例: python3 longstep.py next <直前目標> <新目標名>")
                return
            res = longstep_tool.add_next_goal(plan_path, args[0], args[1])
            print(f"STATUS: ADDED | target={res['target']} revision={res['revision']}")
        elif cmd == "subgoal":
            if len(args) < 2:
                print("ERROR: 親目標と新目標名を指定してください。例: python3 longstep.py subgoal <親目標> <新目標名>")
                return
            res = longstep_tool.add_subgoal(plan_path, args[0], args[1])
            print(f"STATUS: ADDED | target={res['target']} revision={res['revision']}")
        elif cmd == "add":
            if not args:
                print("ERROR: 目標名を指定してください。例: python3 longstep.py add <目標名>")
                return
            res = longstep_tool.add_goal(plan_path, args[0])
            print(f"STATUS: ADDED | target={res['target']} revision={res['revision']}")
        else:
            print(f"UNKNOWN COMMAND: {cmd}\nAVAILABLE: status, list, get, complete, next, subgoal, add")
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
