#!/bin/bash
# Drift check for quick-path triage fixtures (issue #234).
# Run from repo root: bash tests/start/quick_path/check-drift.sh
#
# Exits 0 if fixtures are consistent with skills/start/SKILL.md.
# Exits 1 on any drift, printing the specific mismatch.
#
# This is a manual/pre-merge check; wire it into CI by calling it from
# a GitHub Actions workflow.

set -u
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || { echo "not in a git repo"; exit 1; }

FIXTURE_DIR="tests/start/quick_path"
SKILL="skills/start/SKILL.md"
errors=0

# --- Check 1: Gate count (skill has 5 gates 0-4)
skill_gate_rows=$(grep -cE '^\| [0-4] \| \*\*' "$SKILL")
if [ "$skill_gate_rows" -ne 5 ]; then
  echo "DRIFT: $SKILL has $skill_gate_rows gate rows, expected 5 (gates 0-4)"
  errors=$((errors+1))
fi

# --- Check 2: Fixture gate tables have 5 rows each (gates 0-4)
for f in "$FIXTURE_DIR"/*.md; do
  [ "$(basename "$f")" = "README.md" ] && continue
  n=$(grep -cE '^\| [0-4] (—|[|])' "$f")
  if [ "$n" -ne 5 ]; then
    echo "DRIFT: $f has $n gate rows, expected 5"
    errors=$((errors+1))
  fi
done

# --- Check 3: No references to dropped Gate 5
stale=$(grep -lE "Gate 5|gates 0[-–—]5|gate 5" "$SKILL" "$FIXTURE_DIR"/*.md skills/start/references/step-lists.md CHANGELOG.md 2>/dev/null || true)
if [ -n "$stale" ]; then
  echo "DRIFT: stale Gate 5 references in:"
  echo "$stale" | sed 's/^/  /'
  errors=$((errors+1))
fi

# --- Check 4: Verbatim Gate 0 hint present in SKILL and dirty-tree fixture (italic form)
if ! grep -q 'Working tree is dirty — running normal lifecycle to avoid trampling in-progress work' "$SKILL"; then
  echo "DRIFT: $SKILL missing verbatim Gate 0 hint"
  errors=$((errors+1))
fi
if ! grep -q '\*"Working tree is dirty' "$FIXTURE_DIR/dirty-tree.md"; then
  echo "DRIFT: $FIXTURE_DIR/dirty-tree.md missing italic-formatted Gate 0 hint"
  errors=$((errors+1))
fi

# --- Check 5: Verbatim Gate 1 hint present
if ! grep -q 'No specific target named — running normal lifecycle' "$SKILL"; then
  echo "DRIFT: $SKILL missing verbatim Gate 1 hint"
  errors=$((errors+1))
fi
if ! grep -q '\*"No specific target named' "$FIXTURE_DIR/untargeted-trivial.md"; then
  echo "DRIFT: $FIXTURE_DIR/untargeted-trivial.md missing italic-formatted Gate 1 hint"
  errors=$((errors+1))
fi

# --- Check 6: Budget rule includes Glob
if ! grep -q 'Bash/Grep/Read/Glob' "$SKILL"; then
  echo "DRIFT: $SKILL budget rule missing Glob — should be 'Bash/Grep/Read/Glob'"
  errors=$((errors+1))
fi

# --- Check 7: Escape hatch uses git clean before git checkout
if ! grep -q 'git clean -f' "$SKILL"; then
  echo "DRIFT: $SKILL escape hatch missing 'git clean -f' (newly-created file rollback)"
  errors=$((errors+1))
fi

# --- Check 8: Fixture count
fixture_count=$(ls -1 "$FIXTURE_DIR"/*.md | grep -v README.md | wc -l | tr -d ' ')
if [ "$fixture_count" -ne 14 ]; then
  echo "DRIFT: $fixture_count fixtures found, expected 14"
  errors=$((errors+1))
fi

if [ "$errors" -eq 0 ]; then
  echo "✓ all drift checks pass (5 gates, 14 fixtures, verbatim hints, Glob budget, git clean rollback)"
  exit 0
else
  echo ""
  echo "✗ $errors drift check(s) failed"
  exit 1
fi
