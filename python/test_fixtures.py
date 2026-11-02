"""Common test fixtures and helper data."""


def plan_data():
    return {
        "id": "plan-1",
        "name": "確認用計画",
        "goal": {"statement": "目標", "deadline": "2026-12-31", "successCriteria": ["完了"]},
        "nodes": [{
            "id": "node-1",
            "name": "開始",
            "status": "not_started",
            "targetDate": "2026-09-01",
            "description": "",
            "nextAction": "",
            "goalLevel": "minor",
            "recurrence": {"enabled": False, "cadence": "", "completedCount": 0},
            "dependsOn": [],
        }],
        "meta": {
            "theme": "fire",
            "revision": 2,
            "createdAt": "2026-08-01T00:00:00.000Z",
            "updatedAt": "2026-08-01T00:00:00.000Z",
        },
    }
