# Plugin Version Drift Detection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `plugin_version` field to `.feature-flow.yml` that auto-stamps the running plugin version and surfaces upgrade notices when drift is detected.

**Architecture:** A new Node.js hook script (`hooks/scripts/version-check.js`) handles version extraction, comparison, stamping, and notice output. The SessionStart hook wires it in. The `start` skill Step 0 adds LLM-side version comparison and stamping instructions. The schema reference documents the new field.

**Tech Stack:** Node.js (hooks), Markdown (skills/references)

---

### Task 1: Create version-check.js hook script

**Files:**
- Create: `hooks/scripts/version-check.js`

**Step 1: Write the version-check.js script**

Create `hooks/scripts/version-check.js` that:
1. Extracts the running plugin version from `CLAUDE_PLUGIN_ROOT` env var (last path segment)
2. Reads `.feature-flow.yml` and extracts `plugin_version` field value
3. Compares versions using semver-aware logic (major/minor/patch)
4. Outputs an upgrade notice to stdout if drift is detected
5. Stamps the current running version into `.feature-flow.yml`

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.feature-flow.yml';

function getRunningVersion() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return null;
  return path.basename(pluginRoot);
}

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function classifyDrift(stored, running) {
  if (stored.major !== running.major) return 'major';
  if (stored.minor !== running.minor) return 'minor';
  if (stored.patch !== running.patch) return 'patch';
  return null;
}

function readPluginVersion(content) {
  const match = content.match(/^plugin_version:\s*(.+)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function stampVersion(content, version) {
  if (/^plugin_version:/m.test(content)) {
    return content.replace(/^plugin_version:\s*.+$/m, `plugin_version: ${version}`);
  }
  return `plugin_version: ${version}\n${content}`;
}

function main() {
  if (!fs.existsSync(CONFIG_FILE)) return;

  const runningVersion = getRunningVersion();
  if (!runningVersion || !parseSemver(runningVersion)) return;

  const content = fs.readFileSync(CONFIG_FILE, 'utf8');
  const storedVersion = readPluginVersion(content);

  if (storedVersion && storedVersion !== runningVersion) {
    const stored = parseSemver(storedVersion);
    const running = parseSemver(runningVersion);

    if (stored && running) {
      const drift = classifyDrift(stored, running);
      if (drift) {
        const label = { major: 'Major', minor: 'Minor', patch: 'Patch' }[drift];
        console.log('');
        console.log(
          `UPGRADE NOTICE: ${label} version drift detected — ` +
          `config was stamped by v${storedVersion}, now running v${runningVersion}. ` +
          `Review CHANGELOG.md for what changed.`
        );
      }
    }
  }

  const updated = stampVersion(content, runningVersion);
  if (updated !== content) {
    fs.writeFileSync(CONFIG_FILE, updated, 'utf8');
  }
}

main();
```

**Step 2: Verify script runs without errors**

Run: `node hooks/scripts/version-check.js`
Expected: Exits cleanly with no output (no `.feature-flow.yml` in cwd or CLAUDE_PLUGIN_ROOT not set)

**Step 3: Commit**

```bash
git add hooks/scripts/version-check.js
git commit -m "feat(hooks): add version-check.js for plugin version drift detection"
```

**Acceptance Criteria:**
- [ ] `hooks/scripts/version-check.js` exists and is executable by node
- [ ] `getRunningVersion()` extracts version from `CLAUDE_PLUGIN_ROOT` path's last segment
- [ ] `parseSemver()` parses `X.Y.Z` strings into `{major, minor, patch}` objects
- [ ] `parseSemver()` returns `null` for non-semver strings (e.g., `"abc"`, `""`, `"1.2"`)
- [ ] `classifyDrift()` returns `'major'`, `'minor'`, `'patch'`, or `null` for equal versions
- [ ] `readPluginVersion()` extracts the value from a YAML string containing `plugin_version: X.Y.Z`
- [ ] `readPluginVersion()` returns `null` when `plugin_version` field is absent
- [ ] `stampVersion()` replaces existing `plugin_version:` line when present
- [ ] `stampVersion()` prepends `plugin_version:` line when field is absent
- [ ] Script exits silently when `.feature-flow.yml` does not exist
- [ ] Script exits silently when `CLAUDE_PLUGIN_ROOT` is not set
- [ ] Script exits silently when `CLAUDE_PLUGIN_ROOT` path does not end in a valid semver
- [ ] When stored version differs from running version, upgrade notice is printed to stdout
- [ ] Upgrade notice includes drift level label (Major/Minor/Patch), stored version, and running version
- [ ] When stored version equals running version, no notice is printed
- [ ] When `plugin_version` field is absent (first-time), no notice is printed and version is stamped
- [ ] After running, `.feature-flow.yml` contains `plugin_version: <running_version>`

**Quality Constraints:**
- Error handling: wrap file I/O in try/catch; log error and exit cleanly on failure (match `lint-file.js` pattern)
- Types: N/A (plain JS, no TypeScript in hooks)
- Function length: each function ≤15 lines; `main()` orchestrates with early returns
- Pattern reference: follow `hooks/scripts/lint-file.js` for structure (shebang, strict mode, small focused functions)

---

### Task 2: Wire version-check.js into SessionStart hook

**Files:**
- Modify: `hooks/hooks.json` (SessionStart section, lines 65-74)

**Step 1: Add version-check hook to SessionStart array**

Add a second hook command in the SessionStart hooks array that runs the version-check script. The existing hook displays the feature-flow banner; the new hook runs version checking and stamping.

In `hooks/hooks.json`, add a new hook entry inside the existing SessionStart hooks array (after the existing shell command):

```json
{
  "type": "command",
  "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js"
}
```

The SessionStart hooks array entry should become:
```json
"SessionStart": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "if [ -f .feature-flow.yml ]; then echo '...existing banner...'; ... fi"
      },
      {
        "type": "command",
        "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js"
      }
    ]
  }
]
```

**Step 2: Verify hooks.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): wire version-check.js into SessionStart hook"
```

**Acceptance Criteria:**
- [ ] `hooks/hooks.json` contains a second hook entry in the SessionStart hooks array
- [ ] The new hook command is `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/version-check.js`
- [ ] `hooks/hooks.json` is valid JSON (parseable by `JSON.parse`)
- [ ] Existing SessionStart banner hook is unchanged
- [ ] The version-check hook runs after the banner hook (second position in the array)

**Quality Constraints:**
- Error handling: N/A (JSON config file, not code)
- Types: N/A (JSON)
- Function length: N/A
- Pattern reference: follow existing hook array structure in `hooks/hooks.json` PostToolUse entries (multiple hooks per matcher)

---

### Task 3: Update start skill Step 0 with version comparison

**Files:**
- Modify: `skills/start/SKILL.md` (Step 0: Load or Create Project Context section)

**Step 1: Add version comparison after loading `.feature-flow.yml`**

In the "If found" branch of Step 0 (after reading and extracting fields), add a new section for version comparison. Insert after the existing step 1 ("Read it and extract `platform`, `stack`, `context7`, and `gotchas`"):

```markdown
**Version drift check:**

After reading `.feature-flow.yml`, check for version drift:
1. Extract `plugin_version` from the loaded YAML
2. Determine the running plugin version from the `CLAUDE_PLUGIN_ROOT` environment variable (last path segment, e.g., `/path/to/1.19.2` → `1.19.2`)
3. If `plugin_version` is present and differs from the running version:
   - Compare semver components (major.minor.patch)
   - Classify drift as major, minor, or patch
   - Announce: `"Version drift detected: config stamped by v[stored], running v[running] ([drift level] update). Review CHANGELOG.md for what changed."`
4. If `plugin_version` is absent: no notice (first-time upgrade path — the SessionStart hook will stamp it)

**YOLO behavior:** No prompt — always auto-detected. Announce: `YOLO: start — Version drift check → [no drift | drift level from vX.Y.Z to vA.B.C]`
```

**Step 2: Add auto-stamp to "If found" branch**

After the stack cross-check step (step 3 in the existing "If found" list), add:

```markdown
4. Ensure `plugin_version` is current — if it differs from the running version (or is absent), update it in `.feature-flow.yml` using `Edit`
```

**Step 3: Add auto-stamp to "If not found — auto-detect and create" branch**

In the "Write `.feature-flow.yml` with confirmed values" step (step 5), update to include `plugin_version`:

```markdown
5. Write `.feature-flow.yml` with confirmed values (include `plugin_version` set to the running plugin version; gotchas starts empty — skills will populate it as they discover issues)
```

**Step 4: Update the field extraction list**

Update the "Read it and extract" step to include the new field:

From: `Read it and extract platform, stack, context7, and gotchas`
To: `Read it and extract platform, stack, context7, gotchas, and plugin_version`

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(skills): add version drift check and auto-stamp to start Step 0"
```

**Acceptance Criteria:**
- [ ] `skills/start/SKILL.md` Step 0 "If found" branch extracts `plugin_version` from the YAML
- [ ] Step 0 includes a "Version drift check" section with semver-aware comparison instructions
- [ ] Drift is classified as major, minor, or patch with appropriate announcement
- [ ] No notice is shown when `plugin_version` is absent (first-time upgrade path)
- [ ] "If found" branch includes auto-stamp instruction to update `plugin_version` via `Edit`
- [ ] "If not found" branch includes `plugin_version` in the initial file creation
- [ ] YOLO behavior section documents auto-detection with drift level announcement
- [ ] Field extraction list includes `plugin_version`

**Quality Constraints:**
- Error handling: skill instructs graceful handling — absent field is not an error, just first-time
- Types: N/A (markdown skill file)
- Function length: N/A
- Pattern reference: follow existing version check pattern (Context7 upgrade notice in the same file)

---

### Task 4: Document plugin_version in project-context-schema.md

**Files:**
- Modify: `references/project-context-schema.md` (Schema section and Fields section)

**Step 1: Add `plugin_version` to the schema example**

In the YAML example at the top of the file (lines 7-26), add `plugin_version` as the first field (since it's auto-managed metadata):

```yaml
# .feature-flow.yml
plugin_version: 1.19.2   # Auto-managed: stamped by plugin on SessionStart/start:
platform: web
# ... rest of existing fields
```

**Step 2: Add `plugin_version` field documentation**

Add a new `### \`plugin_version\`` section after the Schema section and before the `### \`platform\`` section. Follow the existing field documentation pattern (description, behavior, format, when needed):

```markdown
### `plugin_version`

Auto-managed field that tracks which plugin version last stamped this config file. Used for version drift detection — when the running plugin version differs from the stamped version, an upgrade notice is displayed.

**Auto-stamped:** The SessionStart hook and `start` skill automatically write the current plugin version to this field on every session. This field should not be manually edited.

**Version source:** Extracted from the `CLAUDE_PLUGIN_ROOT` environment variable's last path segment (e.g., `/path/to/cache/feature-flow/1.19.2` → `1.19.2`).

**Drift detection:** When the stamped version differs from the running version, the plugin classifies drift by semver component:
- **Major drift** (e.g., 1.x → 2.x): Breaking changes likely — review CHANGELOG carefully
- **Minor drift** (e.g., 1.19.x → 1.20.x): New features available — review CHANGELOG for additions
- **Patch drift** (e.g., 1.19.1 → 1.19.2): Bug fixes — informational only

**Committed to git:** Yes — this enables team-wide drift detection. When one team member updates the plugin and stamps a new version, other team members see the drift notice on their next session.

**Format:** Semver string.

\`\`\`yaml
plugin_version: 1.19.2
\`\`\`

**When absent:** First-time upgrade path. No notice is shown; the field is stamped on the next SessionStart or `start:` invocation.
```

**Step 3: Update "How Skills Use This File" section**

Add a `plugin_version` usage entry to the `start` section:

```markdown
### start (reads + writes)
- **Reads** context at lifecycle start. Adjusts step list based on platform and stack.
- **Reads** `plugin_version` field to detect version drift and display upgrade notices.
- **Creates** `.feature-flow.yml` via auto-detection if it doesn't exist (includes `plugin_version`).
- **Updates** stack list if new dependencies are detected that aren't declared.
- **Writes** `plugin_version` to current running version on every lifecycle start.
- **Reads** `context7` field to query relevant documentation before the design phase.
- **Reads** `default_branch` field to determine the PR target branch. If absent, runs the detection cascade.
```

And add a new section for the SessionStart hook:

```markdown
### SessionStart hook (reads + writes)
- **Reads** `plugin_version` to detect drift against the running plugin version.
- **Writes** `plugin_version` to current running version on every session start.
```

**Step 4: Commit**

```bash
git add references/project-context-schema.md
git commit -m "docs: add plugin_version field to project context schema"
```

**Acceptance Criteria:**
- [ ] `plugin_version` field appears in the YAML schema example with a comment indicating it's auto-managed
- [ ] A `### \`plugin_version\`` section exists in the Fields section, before `### \`platform\``
- [ ] Documentation describes auto-stamping behavior (SessionStart + start skill)
- [ ] Documentation describes version source (CLAUDE_PLUGIN_ROOT path)
- [ ] Documentation describes semver-aware drift classification (major/minor/patch)
- [ ] Documentation states the field is committed to git (team-wide drift detection)
- [ ] Documentation describes the first-time upgrade path (absent field → no notice, stamp on next run)
- [ ] "How Skills Use This File" section includes `plugin_version` usage for `start` (reads + writes)
- [ ] "How Skills Use This File" section includes a new `SessionStart hook` entry

**Quality Constraints:**
- Error handling: N/A (documentation)
- Types: N/A (documentation)
- Function length: N/A
- Pattern reference: follow existing field documentation pattern (`default_branch` section for structure and depth)
