"""Validate the end-to-end DDS demo snapshot without third-party packages."""

import json
import sys
from pathlib import Path
from typing import Dict, List


def fail(message: str) -> None:
    raise AssertionError(message)


def events_for(events: List[Dict], task_id: str, kind: str) -> List[Dict]:
    return [event for event in events if event.get("task_id") == task_id and event.get("kind") == kind]


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    snapshot = root / "dashboard" / "telemetry.json"
    if not snapshot.is_file():
        fail(f"Missing snapshot: {snapshot}. Run scripts/run_demo.ps1 first.")

    data = json.loads(snapshot.read_text(encoding="utf-8"))
    tasks = {task["id"]: task for task in data.get("tasks", [])}
    vehicles = {vehicle["id"]: vehicle for vehicle in data.get("vehicles", [])}
    events = data.get("events", [])

    survey_id = "INC-2026-001-SURVEY"
    delivery_id = "INC-2026-001-DELIVERY"
    if set(tasks) != {survey_id, delivery_id}:
        fail(f"Expected exactly the survey and delivery tasks, found {sorted(tasks)}")
    if tasks[survey_id].get("assigned_to") != "uav-alpha":
        fail("Survey task was not allocated to uav-alpha")
    if tasks[delivery_id].get("assigned_to") != "ugv-bravo":
        fail("Delivery task was not allocated to ugv-bravo")
    if tasks[delivery_id].get("predecessor") != survey_id:
        fail("Delivery task dependency does not reference the survey")
    if vehicles.get("uav-alpha", {}).get("phase") != "COMPLETED":
        fail("uav-alpha did not complete its task")
    if vehicles.get("ugv-bravo", {}).get("phase") != "COMPLETED":
        fail("ugv-bravo did not complete its task")

    survey_completed = events_for(events, survey_id, "TASK_COMPLETED")
    delivery_assigned = events_for(events, delivery_id, "TASK_ASSIGNED")
    delivery_completed = events_for(events, delivery_id, "TASK_COMPLETED")
    if not survey_completed or not delivery_assigned or not delivery_completed:
        fail("Missing completion or assignment events needed to prove the dependency chain")
    if survey_completed[-1]["occurred_at_ms"] >= delivery_assigned[0]["occurred_at_ms"]:
        fail("Delivery was assigned before the prerequisite survey completed")

    print("Telemetry verification passed: two tasks completed in dependency order.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError, ValueError, KeyError) as error:
        print(f"Telemetry verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
