# Brief format

The brief sent to codex follows this skeleton exactly. Each section is populated by per-mode builders in `scripts/modes/*.js`. The total brief is capped at 12 KB; content that exceeds is truncated with a `[truncated]` marker.

```
# Feature-flow consultation — mode: <mode>

## Feature
<feature name from session state>

## Goal
<mode-specific>

## Current state
<mode-specific>

## What's already been tried
<entries from attempts_log, filtered by mode>
<or: "Nothing yet — this is a proactive review.">

## Signals
<mode-specific; stuck mode includes failing test / error / criterion>

## What I need from you
<mode-specific question>

## Constraints
- You have read-only access to the worktree at <abs path>
- Do NOT suggest any approach listed in "What's already been tried"
- If you think the goal itself is wrong, say so explicitly and briefly
- Keep your response under 400 words unless complexity truly demands more
- Structure your response as: (1) diagnosis, (2) recommendation, (3) confidence (high/medium/low)
```

Each mode's brief builder returns `{ goal, currentState, signals, question }` which `build-brief.js` stitches into the skeleton above.
