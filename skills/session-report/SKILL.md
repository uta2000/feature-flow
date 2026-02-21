---
name: session-report
description: Use when the user asks to "analyze a session", "session report", "review session performance", "how did that session go", "token usage report", or wants to understand the performance, cost, and quality of a completed Claude Code session. Accepts a session JSON file path as input.
tools: Read, Bash, Write, Glob, Grep, AskUserQuestion, WebSearch
---

# Session Performance Report

Analyze a Claude Code session JSON file and produce a comprehensive performance report covering token usage, model distribution, timing bottlenecks, tool errors, redundant calls, out-of-scope findings, and optimization recommendations.

**Announce at start:** "Analyzing session performance. Let me collect the session file."

## Step 1: Get the Session File

Ask the user for the path to the session JSON file:

```
AskUserQuestion: "Which session file should I analyze?"
Options:
- "Let me provide a path" — user gives an explicit file path
- "Find the latest" — search docs/plans/ for the most recent session-*.json
```

If "Find the latest": use Glob to find `docs/plans/session-*.json` and pick the most recently modified file. Confirm with the user: "Found `<filename>` — analyze this one?"

Validate the file:
1. Check it exists (Read the first 30 lines)
2. Confirm it has `session` and `messages` keys
3. If invalid, tell the user and ask for a different file

## Step 2: Run the Analysis Script

Run the extraction script bundled with this skill:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/session-report/scripts/analyze-session.py "<session-file-path>"
```

This outputs a JSON blob with all extracted metrics. Read the full output — it contains every data point you need for the report.

**If the script fails:** Fall back to manual analysis — Read the session file in chunks and extract the data using Grep and targeted reads. The script is a convenience, not a hard dependency.

## Step 3: Enrich with Context

The script extracts raw data. You need to add interpretation:

### Token Usage Interpretation

Explain what the token types mean for the user's subscription:

- **Cache read tokens** — Re-reading system prompts, conversation history, and skill text on every API call. These typically represent 95-99% of total tokens. On the Max plan, all token types (including cache reads) count toward the weekly allotment.
- **Cache creation tokens** — First-time caching of new content entering the conversation (new skill loads, tool results, new messages).
- **Output tokens** — Tokens the model generated (text + tool calls). Usually <1% of total.
- **Input tokens (uncached)** — Genuinely new content not yet cached. Usually negligible.

Reference: [Claude Code Issue #24147](https://github.com/anthropics/claude-code/issues/24147) documents that cache reads consume quota at the same rate as regular input tokens.

### Subagent Token Estimation

The session file only records token usage for the **parent orchestrator**. Subagent usage is not captured. Estimate it:

- A subagent running 5-15 tool calls typically consumes 500K-3M tokens (mostly cache reads)
- Multiply by the number of subagents for the estimated range
- Flag this as an estimate and note the data gap

### Model Efficiency Analysis

For each subagent, assess whether the model used was appropriate:

| Task Type | Appropriate Model | Notes |
|-----------|------------------|-------|
| Mechanical code edits (extract function, rename, move) | Sonnet or Haiku | Opus is overkill |
| Bug detection, convention checking | Sonnet | Pattern-matching, not deep reasoning |
| Security analysis, architectural review | Opus | Benefits from deeper reasoning |
| Pattern study, file exploration | Haiku | Read-only, low complexity |
| Acceptance criteria verification | Haiku | Checklist comparison |

Flag any subagent that used a higher model than needed: "Task X used **Opus** but is a **mechanical code edit** — Sonnet would suffice."

### Bottleneck Identification

From the timing data, identify the top 3 time sinks. Common patterns:

- **Repeated quality gates** — typecheck/lint running more than needed
- **Sequential tasks that could parallelize** — independent subagents dispatched one-by-one
- **Agent startup overhead** — time between dispatch and first result
- **Context compaction** — when it happened and how much context was lost
- **Tool error recovery** — time spent retrying after errors

### Tool Error Analysis

For each error, determine:
1. **Root cause** — what went wrong
2. **Impact** — did the session recover? How much time was lost?
3. **Fix** — what should change in the skill/hook/config to prevent this
4. **Owner** — which plugin/skill/hook needs the fix

### Out-of-Scope Findings

The script finds messages where the LLM noticed issues outside the task scope (pre-existing bugs, tech debt, anti-patterns). For each:
1. Read the surrounding context to understand what was found
2. Assess severity (High/Medium/Low)
3. Recommend whether it warrants a follow-up issue

## Step 4: Generate the Report

Write the report to `docs/plans/session-report-<session-id-prefix>.md` using this structure:

```markdown
# Session Performance Report

**Session ID:** `<id>`
**Date:** <date>
**Project:** <project>
**Feature:** <first message>
**Duration:** <human readable>
**Result:** <what was accomplished — PR number, commits, etc.>

---

## Token Usage & Plan Impact

### Token breakdown

| Token Type | What It Is | Count | % of Total |
|-----------|-----------|------:|----------:|
| Cache read | ... | ... | ... |
| Cache creation | ... | ... | ... |
| Output | ... | ... | ... |
| Input (uncached) | ... | ... | ... |
| **Grand total** | | **...** | |

### Parent vs. subagent usage

| Agent | Model | Token Usage |
|-------|-------|-------------|
| Parent orchestrator | ... | ... (recorded) |
| <each subagent> | ... | **Not recorded** / estimated |

### Model efficiency findings

<Flag any subagents using higher models than needed>

---

## Time Analysis & Bottlenecks

<Phase timing table>

### Top bottlenecks

1. ...
2. ...
3. ...

---

## Tool Errors

### Error N: <title>

**Command/Tool:** ...
**What happened:** ...
**Impact:** ...
**Fix:** ...
**Owner:** <which plugin/skill/hook>

---

## Repeated & Redundant Calls

| Command | Count | Redundant? | Recommendation |
|---------|------:|-----------|----------------|
| ... | ... | ... | ... |

---

## Out-of-Scope Findings

<For each finding: what was found, severity, whether to create a follow-up issue>

---

## Optimization Recommendations

### High Impact
1. ...

### Medium Impact
1. ...

### Low Impact
1. ...

---

## Session Summary

| Metric | Value |
|--------|-------|
| Duration | ... |
| API calls (parent) | ... |
| Subagents dispatched | ... |
| Total tokens (recorded) | ... |
| Estimated total (incl. subagents) | ... |
| Cache read % | ... |
| Tool errors | ... |
| Redundant calls | ... |
| ... | ... |
```

## Step 5: Present and Offer Next Steps

After writing the report, present a summary to the user and offer:

```
AskUserQuestion: "What would you like to do with these findings?"
Options:
- "Create GitHub issues" — file targeted issues for each actionable finding
- "Done for now" — just keep the report
- "Dig deeper into [area]" — investigate a specific finding further
```

## Quality Rules

- **Do not fabricate data.** Every number in the report must come from the session file or be clearly marked as an estimate.
- **Mark estimates explicitly.** Subagent token usage is always an estimate — say so.
- **Attribute findings to agents.** When the code review pipeline found something, say which agent flagged it.
- **Separate "introduced" from "pre-existing."** If the session involved code changes, distinguish between issues introduced by the changes and issues that existed before.
- **Be actionable.** Every finding should have a clear recommendation — fix it, file an issue, or explicitly decide to ignore it.
- **Reference the source.** When recommending a fix in a specific file, include the file path and line number.
