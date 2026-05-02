#!/usr/bin/env bash
# End-to-end test for the verify-plan-criteria Pattern A pipeline (#251).
#
# Simulates the full subagent → state file → orchestrator validation flow:
#   1. Create a fake in-progress state file matching Task 1's schema (4 fixed
#      phase_summaries buckets: brainstorm, design, plan, implementation).
#   2. Run the same python3 helper that skills/verify-plan-criteria/SKILL.md
#      Step 7 uses, with PHASE_ID=plan (the bucket — NOT the lifecycle step).
#   3. Run the same orchestrator-side read python3 helper that
#      skills/start/SKILL.md "Verify Plan Criteria — Pattern A Dispatch" uses
#      to extract phase_summaries.plan.return_contract into a JSON file.
#   4. Run hooks/scripts/validate-return-contract.js against the JSON file.
#
# Exit 0 means the entire pipeline works. Exit 1 means a regression.
#
# Run: bash hooks/scripts/validate-return-contract.e2e.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SLUG="e2e-$(date +%s)-$$"
STATE_FILE="/tmp/in-progress-${SLUG}.yml"
CONTRACT_JSON="/tmp/ff-return-contract-${SLUG}.json"

cleanup() { rm -f "$STATE_FILE" "$CONTRACT_JSON"; }
trap cleanup EXIT

# Step 1: fake state file with 4-bucket schema.
SLUG="$SLUG" STATE_FILE="$STATE_FILE" python3 -c '
import os, yaml
data = {
    "schema_version": 2,
    "slug": os.environ["SLUG"],
    "issue_number": None,
    "worktree_path": "/tmp",
    "branch": "test",
    "base_branch": "main",
    "scope": "feature",
    "current_step": "verify-plan-criteria",
    "last_completed_step": "plan",
    "created_at": "2026-05-02T00:00:00Z",
    "updated_at": "2026-05-02T00:00:00Z",
    "phase_summaries": {
        "brainstorm":     {"completed": False, "key_decisions": [],                     "return_contract": None},
        "design":         {"completed": False, "issue_url": None, "key_decisions": [],  "return_contract": None},
        "plan":           {"completed": True,  "plan_path": "/tmp/test-plan.md", "open_questions": [], "return_contract": None},
        "implementation": {"completed": False, "tasks_done": 0, "tasks_total": 0, "blockers": [], "return_contract": None},
    },
    "feature_flow_version": "1.37.0",
}
yaml.dump(data, open(os.environ["STATE_FILE"], "w"), default_flow_style=False, allow_unicode=True)
'

# Step 2: skill Step 7 helper — subagent writes its return contract.
F="$STATE_FILE" PHASE_ID="plan" STATUS="success" PLAN_PATH="/tmp/test-plan.md" \
TOTAL="37" MACHINE="32" ADDED="0" MISSING='[]' python3 -c '
import os, json, yaml
f = os.environ["F"]
d = yaml.safe_load(open(f)) or {}
phase = os.environ["PHASE_ID"]
if "phase_summaries" not in d or phase not in d["phase_summaries"]:
    raise SystemExit(f"FAIL: phase_summaries.{phase} not found in {f}")
d["phase_summaries"][phase]["return_contract"] = {
    "schema_version": 1,
    "phase": "verify-plan-criteria",
    "status": os.environ["STATUS"],
    "plan_path": os.environ["PLAN_PATH"],
    "criteria_total": int(os.environ["TOTAL"]),
    "criteria_machine_verifiable": int(os.environ["MACHINE"]),
    "criteria_added_by_agent": int(os.environ["ADDED"]),
    "tasks_missing_criteria": json.loads(os.environ["MISSING"]),
}
yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
'

# Step 3: orchestrator read helper.
STATE_FILE="$STATE_FILE" CONTRACT_JSON="$CONTRACT_JSON" python3 -c '
import os, json, yaml
d = yaml.safe_load(open(os.environ["STATE_FILE"]))
rc = (d.get("phase_summaries", {}).get("plan") or {}).get("return_contract")
if not rc:
    raise SystemExit("FAIL: phase_summaries.plan.return_contract is missing")
json.dump(rc, open(os.environ["CONTRACT_JSON"], "w"))
'

# Step 4: orchestrator validator.
node "${SCRIPT_DIR}/validate-return-contract.js" "$CONTRACT_JSON"

echo "  e2e PASS: subagent → state-file → orchestrator-read → validator pipeline works"
