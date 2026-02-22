# PRD: GitHub Issue Dispatcher for Feature-Flow

**Status:** Draft
**Date:** 2026-02-22
**Source:** Ideation session `ideation-gh-issue-automation-20260222-103255`

---

## 1. Background

This section provides the context a developer needs to understand the systems this dispatcher integrates with. If you are already familiar with feature-flow, Claude Code's headless mode, and YOLO mode, skip to Section 2.

### 1.1 Feature-Flow

Feature-flow is a Claude Code plugin that orchestrates a full development lifecycle — from brainstorming through PR creation — via a sequence of agent skills. When a user says "start a feature for issue #42," the plugin's `start` skill triggers and drives through up to 19 steps: brainstorming, design document, implementation planning, TDD implementation, code review, CHANGELOG generation, and PR creation.

Feature-flow is installed as a Claude Code plugin and loaded via `--plugin-dir /path/to/feature-flow`. Its skills are defined in `SKILL.md` files with `description` frontmatter that enables automatic invocation — Claude matches the user's prompt against skill descriptions and invokes the appropriate skill without explicit commands.

### 1.2 Claude Code Headless Mode (`claude -p`)

`claude -p` runs Claude Code as a non-interactive subprocess. It accepts a prompt via stdin or argument, executes it, and exits. Key properties:

- **Billing:** Uses the Claude Max subscription ($200/month) directly. No API key required.
- **Plugin loading:** `--plugin-dir /path/to/plugin` loads plugins identically to interactive mode.
- **Structured output:** `--output-format json` returns a JSON object with fields: `result` (string), `is_error` (bool), `session_id` (string), `num_turns` (int), `total_cost_usd` (float).
- **Schema enforcement:** `--json-schema '<json>'` forces the model to return JSON conforming to the provided JSON Schema. The schema is passed as an inline JSON string on the command line. Requires `--output-format json`.
- **Stream output:** `--output-format stream-json` provides real-time progress as newline-delimited JSON messages during execution, with the same final summary fields.
- **Turn limit:** `--max-turns N` caps the number of agentic turns. A session hitting the turn limit signals the task was too complex or underspecified.
- **Session resume:** `--resume SESSION_ID` continues a previous session from where it left off.
- **Model selection:** `--model MODEL_ID` selects the Claude model (e.g., `claude-sonnet-4-20250514`, `claude-opus-4-20250514`).
- **Tool allowlist:** `--allowedTools "Tool1,Tool2,..."` restricts which tools the agent can use.
- **Auto-compaction:** At ~83.5% of the 200K context window, Claude automatically summarizes and compresses the conversation. This works identically in headless mode — no manual `/compact` needed.

### 1.3 YOLO Mode

YOLO mode is feature-flow's fully unattended execution mode. When activated (via `--yolo` flag or "yolo mode" in the prompt), the lifecycle suppresses all interactive prompts and auto-selects decisions:

- Brainstorming questions are self-answered from issue context
- Execution strategy is auto-selected (subagent-driven)
- Worktree setup is auto-configured
- PR creation proceeds without confirmation
- Context window checkpoints are suppressed

The result: a single prompt like "Start a feature for issue #42 in YOLO mode" drives the entire lifecycle from issue to PR without human input.

### 1.4 Richness Scoring

Feature-flow assesses linked GitHub issues for context richness using four binary signals:

| # | Signal | Criteria |
|---|--------|----------|
| 1 | Acceptance criteria | Has acceptance criteria or clear requirements sections |
| 2 | Resolved discussion | Has answered questions in comments |
| 3 | Concrete examples | Has mockups, specifications, or examples |
| 4 | Structured content | Body >200 words with headings, lists, or tables |

**Score range:** 0–4 (count of signals present). A score of 3+ means "detailed" — the issue has enough context for unattended processing.

### 1.5 Scope Classification

Feature-flow classifies work into four scope levels:

| Scope | Description |
|-------|-------------|
| Quick fix | Single-file bug fix, typo, config change |
| Small enhancement | 1–3 files, well-understood change |
| Feature | Multiple files, new UI or API, possible data model changes |
| Major feature | New page/workflow, data model changes, external API integration |

Scope and richness together determine how much autonomy is safe. This is the foundation of the dispatcher's triage logic.

---

### 1.6 Prerequisites

The dispatcher requires the following to be installed and configured before use:

| Dependency | Purpose | Install |
|-----------|---------|---------|
| **Python 3.11+** | Runtime | System package manager or pyenv |
| **Claude Code CLI** (`claude`) | Headless execution | `npm install -g @anthropic-ai/claude-code` |
| **Claude Max subscription** | Billing for `claude -p` calls | Subscribe at claude.ai ($200/month) |
| **GitHub CLI** (`gh`) | Issue fetching, PR verification, comment posting | `brew install gh` then `gh auth login` |
| **feature-flow plugin** | Development lifecycle skills | `git clone` the feature-flow repo; path goes in `dispatcher.yml` |
| **git** | Branch management | System package manager |
| **textual** | TUI framework | `pip install textual` |
| **pyyaml** | Config file parsing | `pip install pyyaml` |

The `claude` CLI must be authenticated to a Max plan account. Verify with `claude --version`. The `gh` CLI must be authenticated to a GitHub account with write access to the target repository.

**Label setup:** The selection TUI filters by a GitHub label (default: `dispatcher-ready`). Create this label in your repository if it doesn't exist:

```bash
gh label create dispatcher-ready --description "Ready for automated processing by dispatcher"
```

Apply this label to issues you want the dispatcher to pick up.

---

## 2. Product Overview

### 2.1 What It Does

The dispatcher is a Python CLI tool that processes GitHub issues through feature-flow's YOLO mode. It fetches open issues by label, presents them for selection in a terminal UI, triages each selected issue to determine the appropriate level of autonomy, presents the triage results for human review via a second terminal UI, then executes approved issues sequentially via `claude -p` subprocess calls.

### 2.2 User Experience

**Default flow (no arguments):**

```
$ python dispatcher.py
Fetching open issues labeled "dispatcher-ready"... 7 found.

[Selection TUI — user checks issues to process]

Triaging 4 selected issues...
Triaging issue #42: "Add CSV export to results page"... done (Full YOLO, confidence: 0.92)
Triaging issue #43: "Fix null check in login handler"... done (Full YOLO, confidence: 0.97)
Triaging issue #47: "Build notification system"... done (Parked, confidence: 0.34)
Triaging issue #51: "Add loading spinner to search"... done (Full YOLO, confidence: 0.88)

[Triage Review TUI — user reviews, overrides, approves]

Executing 3 issues (1 parked)...
[#43] Creating branch fix/43-null-check-login... Running YOLO lifecycle... PR #102 created.
[#42] Creating branch feat/42-csv-export... Running YOLO lifecycle... PR #103 created.
[#51] Creating branch feat/51-loading-spinner... Running YOLO lifecycle... PR #104 created.
[#47] Posting clarification comment on issue #47...

Run complete.
  3 PRs created: #102, #103, #104
  1 issue parked: #47 (clarification requested)
  Duration: 47m
  Turns used: 312/600
```

**Power-user flow (explicit issues):**

```
$ python dispatcher.py --issues 42,43,47,51
Fetching 4 issues...
Triaging issue #42...
```

When `--issues` is provided, the selection TUI is skipped and the dispatcher proceeds directly to triage with the specified issues.

### 2.3 Outcomes

For each issue in the batch, the dispatcher produces one of three outcomes:

| Outcome | What Happens |
|---------|-------------|
| **PR created** (Full YOLO) | A pull request is created and ready to merge |
| **PR created, labeled** (Supervised YOLO) | A pull request is created with `needs-human-review` label — human reviews before merge |
| **Clarification comment** (Parked) | A structured comment is posted on the issue listing what information is missing |

---

## 3. Architecture

### 3.1 Five-Stage Pipeline

```
┌───────────┐     ┌─────────┐     ┌─────────┐     ┌───────────┐     ┌─────────┐
│ SELECTION │────▶│ TRIAGE  │────▶│ REVIEW  │────▶│ EXECUTION │────▶│ LOGGING │
│   (TUI)   │     │         │     │  (TUI)  │     │           │     │         │
│ gh issue  │     │ claude  │     │ textual │     │ claude -p │     │ SQLite  │
│ list +    │     │ -p      │     │ app     │     │ + feature │     │         │
│ textual   │     │ Sonnet  │     │         │     │ -flow     │     │         │
│           │     │ 1 turn  │     │         │     │ Opus      │     │         │
└───────────┘     └─────────┘     └─────────┘     └───────────┘     └─────────┘
                  (skipped if --issues provided)
```

### 3.2 Data Flow

```
GitHub Issues (via gh CLI)
        │
        ▼
   ┌───────────┐
   │ SELECTION │  1. Fetch open issues with configured label
   │   (TUI)   │     (gh issue list --label dispatcher-ready)
   │           │  2. Present checkboxes in Textual TUI
   │           │  3. User selects issues to process
   │           │  (Skipped when --issues is provided)
   └─────┬─────┘
         │  List[int] (selected issue numbers)
         ▼
   ┌─────────┐
   │ TRIAGE  │  For each issue:
   │         │  1. Fetch issue data (gh issue view)
   │         │  2. Call claude -p with Sonnet, --max-turns 1
   │         │  3. Parse JSON response → TriageResult
   └────┬────┘
        │  List[TriageResult]
        ▼
   ┌─────────┐
   │ REVIEW  │  Present all triage results in TUI
   │  (TUI)  │  User approves/overrides/skips/edits
   │         │  Output: List[ReviewedIssue] with final tiers
   └────┬────┘
        │  List[ReviewedIssue]
        ▼
   ┌───────────┐
   │ EXECUTION │  For each approved issue (sequential):
   │           │  1. Create git branch
   │           │  2. Run claude -p with Opus + feature-flow
   │           │  3. Parse JSON output → ExecutionResult
   │           │  4. Verify PR via gh pr list
   │           │  For each parked issue:
   │           │  1. Post clarification comment via gh
   └─────┬─────┘
         │  List[ExecutionResult]
         ▼
   ┌─────────┐
   │ LOGGING │  Write all results to SQLite
   │         │  Print summary to terminal
   └─────────┘
```

### 3.3 Component Responsibilities

| Component | Responsibility | Does NOT Do |
|-----------|---------------|-------------|
| **Selection (TUI)** | Fetch labeled issues and let user choose which to process | Triage or classify — it only picks which issues enter the pipeline |
| **Triage** | Classify issues into tiers using a lightweight `claude -p` call | Make execution decisions — that is the user's job in Review |
| **Review (TUI)** | Present triage results; let user approve, override, skip, or edit | Execute anything — it only produces a reviewed list |
| **Execution** | Run `claude -p` sessions, create branches, verify PRs, post comments | Make triage decisions — it executes what Review approved |
| **Logging** | Persist all run data to SQLite for later analysis | Make decisions — it records what happened |

---

## 4. CLI Interface

### 4.1 Command

```
python dispatcher.py [OPTIONS]
```

When run with no arguments, the dispatcher fetches open issues with the configured label and launches the selection TUI. When `--issues` is provided, it skips selection and proceeds directly to triage.

### 4.2 Arguments and Flags

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--issues` | No | — | Comma-separated list of issue numbers: `42,43,47,51`. If omitted, the selection TUI launches. |
| `--label` | No | `dispatcher-ready` | Label filter for the selection TUI. Only issues with this label are shown. Ignored when `--issues` is provided. |
| `--repo` | No | Current directory | GitHub repo in `owner/repo` format |
| `--auto` | No | `false` | Skip all TUIs (selection and review) and execute immediately. When combined with no `--issues`, auto-selects all labeled issues. Use for cron jobs or trusted batches. |
| `--config` | No | `dispatcher.yml` | Path to configuration file (see Section 12) |
| `--dry-run` | No | `false` | Run selection and triage, show both TUIs, but do not execute or post comments |
| `--resume` | No | — | Resume a previous run by run ID. Re-executes failed issues using `claude -p --resume`. |
| `--limit` | No | `50` | Maximum number of issues to show in the selection TUI. Ignored when `--issues` is provided. |
| `--verbose` | No | `false` | Print full `claude -p` output for each execution |

### 4.3 Output

**Standard output:** Progress lines as shown in Section 2.2.

**Exit codes:**

| Code | Meaning |
|------|---------|
| 0 | All approved issues processed successfully |
| 1 | One or more issues failed during execution |
| 2 | Configuration or argument error |
| 3 | All issues were parked (nothing to execute) |

---

## 5. Issue Selection TUI

### 5.1 When It Appears

The selection TUI launches when `dispatcher.py` is run without `--issues`. It is skipped entirely when:
- `--issues` is provided (backward compatible)
- `--auto` is passed — all labeled issues are auto-selected without interaction, enabling fully unattended cron-style runs

### 5.2 Fetching Candidate Issues

The dispatcher fetches open issues matching the configured label:

```bash
gh issue list --label ${LABEL} --state open --limit ${LIMIT} --repo ${REPO} \
  --json number,title,labels,createdAt
```

`${LABEL}` defaults to `dispatcher-ready` and can be overridden via `--label` or the `default_label` config key. `${LIMIT}` defaults to `50` and can be overridden via `--limit`. `${REPO}` is omitted when not provided (gh defaults to the current directory's remote), or set via `--repo` or config.

### 5.3 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Issue Dispatcher — Select Issues           7 available   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [ ] #  Issue                        Labels               Age   │
│  ─── ── ──────────────────────────── ──────────────────── ───── │
│  [x] 55 Add dark mode toggle         enhancement, ui       2d   │
│  [x] 53 Fix login redirect loop      bug                   3d   │
│  [ ] 51 Add loading spinner          enhancement           5d   │
│  [ ] 47 Build notification system    feature  ↻ parked     1w   │
│  [x] 43 Fix null check in login      bug                   1w   │
│  [ ] 42 Add CSV export to results    enhancement           2w   │
│  [x] 38 Update README links          docs                  3w   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [Space] Toggle  [Enter] Confirm  [a] Select all  [q] Quit      │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Sorting

Issues are sorted by creation date, most recent first.

### 5.5 Keyboard Controls

| Key | Action | Description |
|-----|--------|-------------|
| `Space` | Toggle | Check or uncheck the highlighted issue |
| `Enter` | Confirm | Proceed to triage with the checked issues |
| `a` | Select all | Toggle all issues on |
| `q` | Quit | Cancel the run (exit code 0) |
| `↑` / `↓` | Navigate | Move the selection cursor |

### 5.6 Empty State

If no issues match the label filter:

```
No open issues with label "dispatcher-ready" found.
```

The dispatcher exits with code 0.

### 5.7 Previously Parked Issues

When the selection TUI loads, the dispatcher queries SQLite for any displayed issues that have a prior `parked` outcome. These issues are shown with a `↻ parked` indicator in the table to help the user decide whether to re-triage them (e.g., after the author has added context). Previously parked issues are not auto-selected or auto-deselected — the user makes the choice.

### 5.8 Output

The checked issue numbers are passed to the triage stage as the issue list, identical in shape to what `--issues` would have provided.

---

## 6. Triage Specification

### 6.1 Fetching Issue Data

Before triage, the dispatcher fetches each issue's data using the GitHub CLI:

```bash
gh issue view ${ISSUE_NUMBER} --json title,body,comments,labels \
  --jq '{title, body, labels: [.labels[].name], comments: [.comments[].body]}'
```

This produces a JSON object with:
- `title` — the issue title (string)
- `body` — the issue body in markdown (string)
- `labels` — array of label names
- `comments` — array of comment bodies (chronological)

These values are interpolated into the triage prompt as `${TITLE}`, `${BODY}`, and `${COMMENTS}`. Labels are included in the prompt for context but are not used in tier routing.

### 6.2 The Triage Call

For each issue, the dispatcher runs a single `claude -p` call using Sonnet for fast, cheap classification:

```bash
claude -p "Assess this GitHub issue for automated processing eligibility.

Issue title: ${TITLE}
Issue body:
${BODY}

Issue comments:
${COMMENTS}

Evaluate:
1. Scope: classify as quick-fix, small-enhancement, feature, or major-feature
2. Richness: count how many of these signals are present:
   - Has acceptance criteria or clear requirements
   - Has resolved discussion in comments (answered questions)
   - Has concrete examples, mockups, or specifications
   - Body >200 words with structured content (headings, lists, tables)
3. Risk flags: note any mentions of auth, secrets, payment, database migration, or breaking changes
4. Missing info: list what information would be needed to implement this unattended
5. Confidence: your confidence (0.0-1.0) that this issue can be processed correctly by an automated system" \
  --model claude-sonnet-4-20250514 \
  --output-format json \
  --json-schema '${TRIAGE_SCHEMA}' \
  --max-turns 1
```

### 6.3 Triage JSON Schema

```json
{
  "type": "object",
  "properties": {
    "scope": {
      "type": "string",
      "enum": ["quick-fix", "small-enhancement", "feature", "major-feature"]
    },
    "richness_score": {
      "type": "integer",
      "minimum": 0,
      "maximum": 4
    },
    "richness_signals": {
      "type": "object",
      "properties": {
        "has_acceptance_criteria": { "type": "boolean" },
        "has_resolved_discussion": { "type": "boolean" },
        "has_concrete_examples": { "type": "boolean" },
        "has_structured_content": { "type": "boolean" }
      },
      "required": [
        "has_acceptance_criteria",
        "has_resolved_discussion",
        "has_concrete_examples",
        "has_structured_content"
      ]
    },
    "yolo_tier": {
      "type": "string",
      "enum": ["full-yolo", "supervised-yolo", "parked"]
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "risk_flags": {
      "type": "array",
      "items": { "type": "string" }
    },
    "missing_info": {
      "type": "array",
      "items": { "type": "string" }
    },
    "reasoning": {
      "type": "string"
    }
  },
  "required": [
    "scope",
    "richness_score",
    "richness_signals",
    "yolo_tier",
    "confidence",
    "risk_flags",
    "missing_info",
    "reasoning"
  ]
}
```

### 6.4 Tier Routing Logic

The triage model determines the tier, but the dispatcher should validate the tier against this matrix and override if the model's classification is inconsistent:

| Scope | Richness < 3 | Richness >= 3 |
|-------|-------------|---------------|
| Quick fix | Full YOLO | Full YOLO |
| Small enhancement | Full YOLO | Full YOLO |
| Feature | Parked | Full YOLO |
| Major feature | Parked | Supervised YOLO |

**Override rules:**
- If the model returns `full-yolo` but the matrix says `parked`, downgrade to `parked`
- If the model returns `parked` but the matrix says `full-yolo`, upgrade to `full-yolo`
- Risk flags do not change the tier automatically — they are displayed in the TUI for the user to consider

### 6.5 Confidence-First Ordering

After triage, issues are sorted for execution in descending confidence order. High-confidence issues are processed first to maximize guaranteed throughput. If a rate limit is hit mid-batch, the easy wins are already done.

---

## 7. Triage Review TUI

### 7.1 Framework

The TUI is built with [Textual](https://textual.textualize.io/) (`pip install textual`), a Python framework for terminal user interfaces.

### 7.2 Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Issue Dispatcher — Triage Review            4 issues     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  #   Issue                        Tier        Conf   Flags       │
│  ─── ──────────────────────────── ─────────── ────── ──────────  │
│  43  Fix null check in login      Full YOLO   0.97               │
│  42  Add CSV export to results    Full YOLO   0.92               │
│  51  Add loading spinner          Full YOLO   0.88               │
│  47  Build notification system    Parked      0.34   major-scope │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  [a] Approve all  [enter] Edit selected  [s] Skip  [x] Execute  │
│  [↑↓] Navigate    [t] Override tier      [c] Edit comment       │
│  [q] Quit (cancel run)                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 7.3 Actions

| Key | Action | Description |
|-----|--------|-------------|
| `Enter` | Edit selected | Open detail view for the selected issue |
| `t` | Override tier | Cycle through tiers: Full YOLO → Supervised YOLO → Parked → Full YOLO |
| `c` | Edit comment | Open an editor for the clarification comment (parked issues only) |
| `s` | Skip | Exclude the selected issue from this run |
| `a` | Approve all | Confirm all non-skipped issues and jump directly to the execute prompt |
| `x` | Execute | Proceed to execution with current approvals |
| `q` | Quit | Cancel the entire run |

### 7.4 Detail View

When `Enter` is pressed on an issue, a detail panel slides in showing:

- Full issue title and body (truncated to terminal height)
- Triage reasoning (from the `reasoning` field)
- Richness signals (which 4 signals were present/absent)
- Risk flags (if any)
- Missing info (if any)
- Current tier assignment (editable via `t`)
- Clarification comment preview (if parked, editable via `c`)

### 7.5 Auto Mode

When `--auto` is passed, both TUIs are skipped:

- **Selection TUI:** If `--issues` is omitted, all labeled issues are auto-selected. If `--issues` is provided, the explicit list is used.
- **Review TUI:** All triage results are accepted as-is and execution begins immediately.

This enables fully unattended runs — `dispatcher.py --auto` is a valid cron job that processes all `dispatcher-ready` issues without human interaction.

---

## 8. Execution Specification

### 8.1 Pre-Execution Setup

For each approved issue, before launching `claude -p`:

1. **Ensure clean working tree:**
   ```bash
   git status --porcelain
   ```
   If the working tree is dirty, stash changes: `git stash push -m "dispatcher-pre-exec"`

2. **Create a branch:**
   ```bash
   git checkout -b ${BRANCH_PREFIX}/${ISSUE_NUMBER}-${SLUG} ${BASE_BRANCH}
   ```
   Branch prefix defaults to `feat` for features/enhancements, `fix` for quick fixes. The slug is derived from the issue title (lowercase, hyphens, max 50 chars).

3. **Verify branch is clean:**
   ```bash
   git log --oneline ${BASE_BRANCH}...HEAD
   ```
   Should be empty (no commits on the new branch).

### 8.2 The Execution Call

```bash
claude --plugin-dir ${FEATURE_FLOW_PLUGIN_PATH} \
  -p "Start a feature for GitHub issue #${ISSUE_NUMBER} in YOLO mode. \
      The issue title is: ${TITLE}. \
      The issue body is: ${BODY}" \
  --model claude-opus-4-20250514 \
  --allowedTools "Skill,Read,Write,Edit,Bash,Glob,Grep,WebFetch,WebSearch,Task,ToolSearch,AskUserQuestion,EnterPlanMode,ExitPlanMode,TaskCreate,TaskGet,TaskUpdate,TaskList" \
  --max-turns ${MAX_TURNS} \
  --output-format json
```

**Model:** Opus is used for execution because the full feature-flow lifecycle requires deep reasoning, multi-step planning, and complex code generation across 19 potential steps.

**Turn limit:** Configurable via `dispatcher.yml` (default: 200). Feature-flow's YOLO lifecycle can require 50+ turns for a feature-scope issue (19 lifecycle steps, many involving subagent dispatches and multi-file edits). The 200-turn default provides headroom for complex issues while still acting as a safety leash. For quick-fix or small-enhancement batches, consider lowering to 50–100 via config. A session hitting the turn limit signals the issue was too complex. The dispatcher records this and can retry with `--resume`.

**Tool allowlist:** Includes all tools the feature-flow lifecycle needs. `Skill` is required for skill invocation. `Task` and related tools are needed for subagent-driven development. `ToolSearch` is needed for MCP tool discovery (Context7).

### 8.3 Supervised YOLO Execution

Identical to Full YOLO execution, but after a PR is verified:

```bash
gh pr edit ${PR_NUMBER} --add-label "needs-human-review"
```

### 8.4 Outcome Detection

Parse the JSON output from `claude -p`:

| Field | Success | Leash Hit | Error |
|-------|---------|-----------|-------|
| `is_error` | `false` | `false` | `true` |
| `num_turns` | `< max_turns` | `== max_turns` | any |
| PR exists | yes (via `gh pr list`) | maybe | no |

**PR verification:**
```bash
gh pr list --head ${BRANCH_NAME} --json number,title,state --jq '.[0]'
```

If `is_error` is `false` but no PR exists, the session completed without producing a PR. This is logged as a partial success — the branch may have useful work that can be continued.

### 8.5 Resume Recovery

When an execution fails or hits the turn limit:

1. Record the `session_id` from the JSON output
2. On `--resume`, re-run:
   ```bash
   claude --plugin-dir ${FEATURE_FLOW_PLUGIN_PATH} \
     -p "Continue working on the feature. Pick up where you left off." \
     --model claude-opus-4-20250514 \
     --resume ${SESSION_ID} \
     --allowedTools "..." \
     --max-turns ${MAX_TURNS} \
     --output-format json
   ```
3. Re-check for PR after the resumed session completes

**Resume limit:** Maximum 2 resume attempts per issue per run. After 2 failures, the issue is logged as failed and the user is notified.

### 8.6 Post-Execution Cleanup

After each issue (success or failure):

1. Return to the base branch: `git checkout ${BASE_BRANCH}`
2. If stashed: `git stash pop` (only after the final issue in the batch)

---

## 9. Data Model

### 9.1 SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS runs (
    id          TEXT PRIMARY KEY,   -- UUID
    started_at  TEXT NOT NULL,      -- ISO 8601
    finished_at TEXT,               -- ISO 8601, NULL if still running
    issue_list  TEXT NOT NULL,      -- JSON array of issue numbers
    config      TEXT NOT NULL,      -- JSON snapshot of dispatcher config
    status      TEXT NOT NULL       -- 'running', 'completed', 'failed', 'cancelled'
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS issues (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT NOT NULL REFERENCES runs(id),
    issue_number    INTEGER NOT NULL,
    issue_title     TEXT NOT NULL,
    issue_url       TEXT NOT NULL,

    -- Triage results
    scope           TEXT,           -- 'quick-fix', 'small-enhancement', 'feature', 'major-feature'
    richness_score  INTEGER,
    richness_signals TEXT,          -- JSON object of 4 booleans
    triage_tier     TEXT,           -- 'full-yolo', 'supervised-yolo', 'parked'
    confidence      REAL,
    risk_flags      TEXT,           -- JSON array of strings
    missing_info    TEXT,           -- JSON array of strings
    triage_reasoning TEXT,

    -- Review overrides
    reviewed_tier   TEXT,           -- Final tier after user review (NULL if --auto)
    skipped         INTEGER DEFAULT 0,  -- 1 if user skipped in TUI

    -- Execution results
    branch_name     TEXT,
    session_id      TEXT,           -- claude -p session ID for --resume
    num_turns       INTEGER,
    is_error        INTEGER,        -- 0 or 1
    pr_number       INTEGER,
    pr_url          TEXT,
    error_message   TEXT,
    outcome         TEXT,           -- 'pr_created', 'pr_created_review', 'parked', 'failed', 'leash_hit', 'skipped'
        CHECK (outcome IN ('pr_created', 'pr_created_review', 'parked', 'failed', 'leash_hit', 'skipped')),

    -- Parked issue handling
    clarification_comment TEXT,     -- The comment posted (or to be posted)
    comment_posted  INTEGER DEFAULT 0,  -- 1 if comment was successfully posted

    -- Resume tracking
    resume_count    INTEGER DEFAULT 0,  -- Number of --resume attempts for this issue

    -- Timestamps
    triage_started_at   TEXT,
    triage_finished_at  TEXT,
    exec_started_at     TEXT,
    exec_finished_at    TEXT
);

CREATE INDEX idx_issues_run_id ON issues(run_id);
CREATE INDEX idx_issues_outcome ON issues(outcome);
CREATE INDEX idx_issues_issue_number ON issues(issue_number);
```

### 9.2 Usage

- **Before triage:** Insert a row with `run_id`, `issue_number`, `issue_title`, `issue_url`
- **After triage:** Update with triage fields
- **After review:** Update with `reviewed_tier`, `skipped`
- **After execution:** Update with execution result fields
- **Query previous runs:** `SELECT * FROM issues WHERE issue_number = 42 ORDER BY triage_started_at DESC`
- **Resume:** `SELECT session_id FROM issues WHERE run_id = ? AND outcome IN ('failed', 'leash_hit')`

---

## 10. Error Handling

### 10.1 Turn Limit Hit

**Detection:** `num_turns == max_turns` and `is_error == false`.

**Handling:**
1. Log outcome as `leash_hit`
2. Check if a PR was created anyway (some issues complete on the last turn)
3. If no PR, the issue is eligible for `--resume` in a subsequent run
4. Report to user: `"Issue #N hit the turn limit (${MAX_TURNS} turns). Branch ${BRANCH} has partial work. Use --resume to continue."`

### 10.2 Subprocess Failure

**Detection:** `is_error == true` in the JSON output, or `claude -p` exits with a non-zero code.

**Handling:**
1. Log the error message from `result` field
2. Log outcome as `failed`
3. Do not retry automatically within the same run — proceed to the next issue
4. The issue is eligible for `--resume` in a subsequent run

### 10.3 Git Conflicts

**Detection:** `claude -p` reports git errors in its output, or the branch checkout fails.

**Handling:**
1. If branch creation fails (branch already exists): attempt checkout of existing branch, or create with a `-2` suffix
2. If the base branch has diverged during execution: the PR will show the conflict. This is acceptable — the human reviewer resolves it.
3. If the working tree is dirty at the start of execution: stash and restore after

### 10.4 Rate Limiting

**Detection:** `claude -p` takes significantly longer than expected, returns an error about rate limits, or the process hangs.

**Handling:**
1. If an execution takes more than 2x the average turn time: log a warning but continue waiting
2. If `claude -p` returns a rate limit error: pause for 5 minutes, then retry once
3. If the retry also fails: skip the issue and move to the next
4. After 2 consecutive rate limit errors: pause the entire batch for 15 minutes before continuing
5. Report rate limit events in the run summary

### 10.5 Resume Retry Logic

When `--resume RUN_ID` is passed:

1. Open the SQLite database. If the database file does not exist, exit with code 2 and message: `"No dispatcher database found at ${DB_PATH}. Nothing to resume."`
2. Load the specified run. If no run with that ID exists, exit with code 2 and message: `"Run ${RUN_ID} not found. Use --resume with a valid run ID from a previous dispatcher invocation."`
3. Find all issues with outcome `failed` or `leash_hit` that have a `session_id`
4. For each, re-execute using `claude -p --resume ${SESSION_ID}`
5. Update the database with new results
6. Maximum 2 resume attempts per issue (tracked in a `resume_count` field)
7. Issues without a `session_id` (e.g., pre-triage failures) are re-triaged from scratch

---

## 11. Parked Issue Handling

### 11.1 Clarification Comment Format

When an issue is triaged as `parked`, the dispatcher generates a structured comment requesting the missing information:

```markdown
## Automated Triage — Clarification Needed

This issue was reviewed for automated processing but needs more detail before work can begin.

### What's Missing

- [ ] ${MISSING_ITEM_1}
- [ ] ${MISSING_ITEM_2}
- [ ] ${MISSING_ITEM_3}

### What Would Help

${SPECIFIC_SUGGESTIONS}

---

*Once the above information is added, this issue will be re-evaluated on the next dispatcher run.*
*Posted by [feature-flow dispatcher](https://github.com/uta2000/feature-flow)*
```

The `missing_info` array from the triage response populates the checklist. The `reasoning` field informs the "What Would Help" section.

### 11.2 TUI Editing

In the Review TUI, when the user presses `c` on a parked issue, an inline editor opens with the generated comment. The user can:

- Edit the text directly
- Add additional items to the checklist
- Remove items they disagree with
- Replace the comment entirely

The edited comment is stored in the `clarification_comment` column and used verbatim when posting.

### 11.3 Posting

Clarification comments for parked issues are posted **after all YOLO/Supervised YOLO executions complete**, as the final action in the Execution stage. This ordering ensures that execution failures don't leave orphaned comments on parked issues if the run is interrupted.

```bash
gh issue comment ${ISSUE_NUMBER} --body "${COMMENT_BODY}"
```

If the `gh` command fails (network error, auth issue), the dispatcher logs a warning and continues. The comment is stored in SQLite regardless, so it can be retried manually.

In `--auto` mode, comments are posted using the auto-generated text without user review.

### 11.4 Re-Triage on Next Run

When an issue that was previously parked is included in a new `--issues` batch:

1. The dispatcher fetches the issue including new comments since the last run
2. The triage call receives the updated context (including the author's response)
3. If the author addressed the missing items, the richness score should increase, potentially upgrading the tier
4. The previous triage result is available in the TUI detail view for comparison

---

## 12. Configuration

### 12.1 Configuration File

The dispatcher reads `dispatcher.yml` (or the path specified by `--config`):

```yaml
# dispatcher.yml

# Path to the feature-flow plugin directory
plugin_path: /Users/you/projects/feature-flow

# GitHub repository (owner/repo format)
# If omitted, detected from the current git remote
repo: uta2000/my-project

# Base branch for PR targets
# If omitted, detected from git (main, master, or staging)
base_branch: main

# Models
triage_model: claude-sonnet-4-20250514
execution_model: claude-opus-4-20250514

# Turn limits
triage_max_turns: 1
execution_max_turns: 200

# Resume limits
max_resume_attempts: 2

# SQLite database path
db_path: ./dispatcher.db

# Branch naming
branch_prefix_fix: fix
branch_prefix_feat: feat

# Issue selection
default_label: dispatcher-ready  # Label filter for the selection TUI
selection_limit: 50              # Max issues to fetch for the selection TUI

# Rate limit handling
rate_limit_pause_seconds: 300      # 5 minutes on first rate limit
rate_limit_batch_pause_seconds: 900  # 15 minutes after 2 consecutive limits
```

### 12.2 Precedence

1. CLI arguments (highest priority)
2. `dispatcher.yml` configuration file
3. Auto-detected defaults (lowest priority)

---

## 13. Acceptance Criteria

v1 is done when all of the following are true:

### Issue Selection

- [ ] `dispatcher.py` with no arguments fetches open issues with the configured label and shows the selection TUI
- [ ] User can check/uncheck issues in the selection TUI and proceed to triage with Enter
- [ ] `--issues` bypasses the selection TUI (backward compatible)
- [ ] `--label` overrides the default label filter for the selection TUI
- [ ] `--limit` caps the number of issues fetched for the selection TUI (default: 50)
- [ ] `--auto` without `--issues` auto-selects all labeled issues (no selection TUI)
- [ ] Empty state displays a message and exits cleanly when no issues match the label
- [ ] Previously parked issues are shown with a `↻ parked` indicator in the selection TUI

### Core Pipeline

- [ ] `dispatcher.py --issues N,N,N` fetches issues via `gh issue view`, triages each via `claude -p` with Sonnet, and produces structured `TriageResult` objects
- [ ] Triage results are validated against the scope/richness tier matrix (Section 6.3) and overridden if inconsistent
- [ ] Issues are sorted by confidence (descending) before execution
- [ ] Each approved issue is executed via `claude -p` with Opus and `--plugin-dir` pointing to feature-flow
- [ ] Execution outcomes are detected from structured JSON output (`is_error`, `num_turns`, `session_id`)
- [ ] PR creation is verified via `gh pr list --head ${BRANCH}`
- [ ] Supervised YOLO PRs receive the `needs-human-review` label

### Review TUI

- [ ] The Textual TUI displays all triage results in a table with tier, confidence, and risk flags
- [ ] User can override tiers, skip issues, edit clarification comments, and approve all
- [ ] `--auto` flag bypasses both the selection and review TUIs

### Parked Issues

- [ ] Parked issues receive a structured clarification comment via `gh issue comment`
- [ ] The comment includes a checklist of missing information from the triage response
- [ ] Comments are editable in the TUI before posting

### Error Handling

- [ ] Turn limit hits are detected and logged as `leash_hit`
- [ ] Subprocess failures are logged and do not halt the batch
- [ ] `--resume RUN_ID` re-executes failed/leash-hit issues using `claude -p --resume`
- [ ] Rate limit errors trigger a pause-and-retry mechanism

### Logging

- [ ] All triage and execution results are persisted to SQLite
- [ ] `--dry-run` runs triage and shows the TUI but does not execute or post comments

### Configuration

- [ ] `dispatcher.yml` is loaded and merged with CLI arguments and auto-detected defaults
- [ ] Plugin path, models, turn limits, and database path are all configurable

---

## 14. Out of Scope (v2+)

The following features are explicitly deferred:

| Feature | Why Deferred | v2+ Consideration |
|---------|-------------|-------------------|
| **Feedback loop** | Requires enough run data to identify patterns | SQLite logging in v1 provides the data foundation. v2 augments the triage prompt with historical outcome patterns. |
| **Poll mode** | Event-driven architecture adds complexity | v1 validates the batch pipeline. v2 adds GitHub webhook or scheduled `gh` polling with a `feature-flow-ready` label trigger. |
| **Parallel processing** | Concurrent `claude -p` sessions on the Max plan are unvalidated | v1 processes sequentially. v2 tests concurrent sessions with git worktrees for isolation. |
| **Quota optimization** | Requires empirical rate limit data | v1 logs turn counts and timing. v2 uses this data to build a quota portfolio manager that allocates issues against remaining monthly quota. |
| **SDK execution tier** | `claude -p` is simpler and sufficient for v1 | The `claude-agent-sdk` with OAuth token provides more programmatic control (streaming, hooks, custom tools). Worth evaluating if `claude -p` proves insufficient. |
| **Multi-repo support** | Adds configuration complexity | v1 targets a single repo. v2 could accept a `--repos` flag or iterate over a config list. |
| **Security exclusion rules** | Risk flags are shown in TUI but not auto-enforced | v2 could auto-park issues touching auth, secrets, payments, or migration paths regardless of richness score. |
| **Concurrent run locking** | Adds complexity; single-user usage is the v1 target | The dispatcher does not prevent concurrent runs against the same repository. Running multiple instances simultaneously may produce duplicate branches or conflicting PRs. v2 could add a lockfile or SQLite-based advisory lock. |

---

## Appendix A: Design Decisions Beyond the Vision Document

This PRD adds several features not present in the ideation session's vision document. These additions were made during PRD planning to address gaps that would block implementation.

| Addition | Rationale |
|----------|-----------|
| **Issue Selection TUI** (Section 5) | The vision required `--issues` with known issue numbers. The selection TUI lets users just run `dispatcher.py` and pick from labeled issues interactively — a simpler default workflow. `--issues` remains available for power users and automation. |
| **Triage Review TUI** (Section 7) | The vision described a "fire and forget" CLI. The TUI adds a human review checkpoint between triage and execution — the user sees all triage decisions at once and can override before any execution begins. This is the safety layer that makes the dispatcher trustworthy for real use. |
| **`--auto` flag** | Preserves the vision's original "run and walk away" experience for users who trust the triage. The TUI is the default; `--auto` opts out. |
| **Dispatcher-level `--resume`** (Section 10.5) | The vision discussed `claude -p --resume` for individual session recovery. The dispatcher-level `--resume` adds batch-level recovery — if the dispatcher is interrupted mid-batch, the user can resume the entire run. |
| **Turn limit default of 200** | The vision used 50 as an example. Feature-flow's full lifecycle (19 steps with subagent dispatches) requires more headroom. 200 is the default; it's configurable down to 50 for simpler batches. |
| **Tier matrix follows the IDEA report, not the Vision prose** | The Vision's prose description of tiers was simplified. The IDEA report's detailed matrix (quick-fix/small-enhancement always Full YOLO; feature+rich=Full YOLO; major+rich=Supervised) is the authoritative source and is what this PRD implements. |

## Appendix B: Dependencies

| Dependency | Purpose | Install |
|------------|---------|---------|
| Python 3.11+ | Runtime | — |
| `textual` | TUI framework for Review stage | `pip install textual` |
| `pyyaml` | Configuration file parsing | `pip install pyyaml` |
| `gh` | GitHub CLI (issue fetching, PR verification, comments) | `brew install gh` or [cli.github.com](https://cli.github.com) |
| `claude` | Claude Code CLI (triage and execution) | [claude.ai/download](https://claude.ai/download) |
| `sqlite3` | Database (Python stdlib) | Included with Python |
| Feature-flow | Claude Code plugin | `claude plugins add /path/to/feature-flow` |
