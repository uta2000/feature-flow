#!/bin/bash
# Reference integrity check for skills/*.md files (issue #255).
# Run from repo root: bash scripts/check-skill-references.sh
#
# For every *.md under skills/, extracts Read `references/...` and
# Read `../../references/...` paths, resolves each relative to the
# nearest ancestor SKILL.md directory (skill-root), and reports any
# missing files.
#
# Exits 0 with a success message when all references resolve.
# Exits 1 and prints per-file error lines for any broken reference.

set -u
cd "$(git rev-parse --show-toplevel)" 2>/dev/null || { echo "not in a git repo"; exit 1; }

errors=0

# find_skill_root <dir>
# Walk up from <dir> until a sibling SKILL.md is found.
# Prints the skill-root directory path, or "" if not found.
find_skill_root() {
  local dir="$1"
  local depth=0
  while [ "$depth" -lt 10 ]; do
    if [ -f "$dir/SKILL.md" ]; then
      echo "$dir"
      return 0
    fi
    local parent
    parent="$(dirname "$dir")"
    # Stop when dirname returns the same dir (filesystem root or '.').
    if [ "$parent" = "$dir" ]; then
      echo ""
      return 1
    fi
    dir="$parent"
    depth=$((depth + 1))
  done
  echo ""
  return 1
}

# check_file <md_file>
# Greps the file for Read `references/...` tokens and checks each resolved path.
check_file() {
  local file="$1"
  local file_dir
  file_dir="$(dirname "$file")"

  local skill_root
  skill_root="$(find_skill_root "$file_dir")"
  if [ -z "$skill_root" ]; then
    echo "WARNING: no SKILL.md ancestor found for $file — skipping"
    return
  fi

  # Match: Read `references/...` or Read `../../references/...`
  # grep -nE prints line numbers; -o extracts each match.
  # We run grep twice in a pipeline to get both line number and match.
  while IFS= read -r match_line; do
    [ -z "$match_line" ] && continue

    # Format from grep -nE: "<lineno>:Read `<path>`"
    local lineno ref_path
    lineno="${match_line%%:*}"
    # Strip leading "N:Read `" and trailing "`" (and anything after it)
    local raw="${match_line#*:}"          # remove "N:"
    raw="${raw#*\`}"                      # remove up to first backtick
    ref_path="${raw%%\`*}"                # take up to next backtick

    # Resolve against skill-root
    if (cd "$skill_root" && [ -f "$ref_path" ]); then
      : # exists — ok
    else
      local resolved="$skill_root/$ref_path"
      echo "$file:$lineno: broken reference -> $ref_path (resolved: $resolved, file not found)"
      errors=$((errors + 1))
    fi
  done < <(grep -nE "Read \`(\.\./)*references/[^\`]+\.md\`" "$file" 2>/dev/null || true)
}

# --- Main scan loop
while IFS= read -r md_file; do
  check_file "$md_file"
done < <(find skills -name "*.md" -type f | sort)

# --- Summary
if [ "$errors" -eq 0 ]; then
  echo "OK: all skill references resolve correctly"
  exit 0
else
  echo ""
  echo "FAIL: $errors broken reference(s) found"
  exit 1
fi
