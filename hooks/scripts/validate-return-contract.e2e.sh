#!/usr/bin/env bash
# End-to-end test for the subagent-driven phase architecture pipelines (#251).
#
# Two round-trips are exercised:
#   Pattern A — verify-plan-criteria (PR #262, Wave 3 phase 1):
#     subagent writes contract to phase_summaries.plan.return_contract,
#     orchestrator reads + validates.
#   Pattern B — design-document (Wave 3 phase 3):
#     consolidator subagent writes contract to phase_summaries.design.return_contract,
#     orchestrator reads + validates.
#
# Both round-trips use:
#   - the same in-progress state file (4 fixed phase_summaries buckets)
#   - PHASE_ID = bucket key (e.g. "plan", "design"), NOT the lifecycle step name
#   - contract `phase` = lifecycle step name (e.g. "verify-plan-criteria", "design-document")
#   - validator looks up schema by obj.phase
#
# Exit 0 means both pipelines work. Exit 1 means a regression.
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
# NOTE: this block intentionally mirrors the Step 7 helper in
# skills/verify-plan-criteria/SKILL.md exactly (bucket from PHASE_ID env;
# contracts `phase` field hardcoded to the lifecycle step name per #251).
# Mirroring rather than duplicating the spec catches drift between the two.
d["phase_summaries"][phase]["return_contract"] = {
    "schema_version": 1,
    "phase": "verify-plan-criteria",  # lifecycle step name per #251 — NOT the bucket
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

echo "  e2e PASS (verify-plan-criteria Pattern A): subagent → state-file → orchestrator-read → validator pipeline works"

# ----------------------------------------------------------------------------
# Pattern B round-trip — design-document (Wave 3 phase 3, #251)
# Same shape as Pattern A but writes to the `design` bucket and validates
# against the design-document SCHEMAS entry.
# ----------------------------------------------------------------------------

DD_CONTRACT_JSON="/tmp/ff-return-contract-${SLUG}-dd.json"
trap 'rm -f "$STATE_FILE" "$CONTRACT_JSON" "$DD_CONTRACT_JSON"' EXIT

# Step 5 (Pattern B): consolidator subagent writes design-document return
# contract to the `design` bucket. Mirrors the Step 8 helper in
# skills/design-document/SKILL.md exactly (PHASE_ID=design bucket key;
# contracts `phase` field hardcoded to the lifecycle step name `design-document`).
F="$STATE_FILE" PHASE_ID="design" STATUS="success" \
DESIGN_URL="https://github.com/uta2000/feature-flow/issues/251" \
ISSUE_NUM="251" PRESENT="true" \
DECISIONS='["Pattern B: hoist + consolidator","Inline-fallback target is bare Skill()"]' \
QUESTIONS='[]' TBD="0" python3 -c '
import os, json, yaml
f = os.environ["F"]
d = yaml.safe_load(open(f)) or {}
bucket = os.environ["PHASE_ID"]
if "phase_summaries" not in d or bucket not in d["phase_summaries"]:
    raise SystemExit(f"FAIL: phase_summaries.{bucket} not found in {f}")
d["phase_summaries"][bucket]["return_contract"] = {
    "schema_version": 1,
    "phase": "design-document",  # lifecycle step name per #251 — NOT the bucket key
    "status": os.environ["STATUS"],
    "design_issue_url": os.environ["DESIGN_URL"],
    "issue_number": int(os.environ["ISSUE_NUM"]),
    "design_section_present": os.environ["PRESENT"].lower() == "true",
    "key_decisions": json.loads(os.environ["DECISIONS"]),
    "open_questions": json.loads(os.environ["QUESTIONS"]),
    "tbd_count": int(os.environ["TBD"]),
}
yaml.dump(d, open(f, "w"), default_flow_style=False, allow_unicode=True)
'

# Step 6 (Pattern B): orchestrator read helper extracts design bucket contract.
STATE_FILE="$STATE_FILE" DD_CONTRACT_JSON="$DD_CONTRACT_JSON" python3 -c '
import os, json, yaml
d = yaml.safe_load(open(os.environ["STATE_FILE"]))
rc = (d.get("phase_summaries", {}).get("design") or {}).get("return_contract")
if not rc:
    raise SystemExit("FAIL: phase_summaries.design.return_contract is missing")
json.dump(rc, open(os.environ["DD_CONTRACT_JSON"], "w"))
'

# Step 7 (Pattern B): orchestrator validator.
node "${SCRIPT_DIR}/validate-return-contract.js" "$DD_CONTRACT_JSON"

echo "  e2e PASS (design-document Pattern B): consolidator → state-file → orchestrator-read → validator pipeline works"
