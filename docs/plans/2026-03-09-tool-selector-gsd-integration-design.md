# Tool Selector — Intelligent GSD Integration

**Date:** 2026-03-09
**Status:** Design Complete
**Author:** Claude + User Collaborative Brainstorm

---

## Overview

The `start` skill gains an intelligent pre-flight check that analyzes the user's project description and recommends feature-flow or GSD based on project scale. If GSD is recommended and the user accepts, the skill launches GSD with pre-filled context, eliminating duplicate explanation and enabling smooth handoff between tools.

This solves the decision problem: "Should I use feature-flow for this, or GSD?" by making the recommendation automatic, intelligent, and always user-confirmable.

---

## Problem Statement

Currently, users must manually decide whether to use feature-flow (single feature, deep verification) or GSD (multi-feature project, parallel execution). Users often:
- Choose the wrong tool, then realize mid-project they should have used the other
- Re-explain their project to GSD even though they just described it to feature-flow
- Lack clear guidance on when each tool is appropriate

---

## Solution

Add a **Tool Selection** step as the first action in the `start` skill:

1. Parse user's project description
2. Apply heuristics to detect project scale (feature count, scope, timeline)
3. Calculate recommendation confidence
4. Display recommendation with visual indicators
5. Let user confirm or override
6. If GSD chosen: prepare context handoff and launch GSD
7. If feature-flow chosen: continue with normal lifecycle

---

## Architecture

### Detection Heuristics

Analyze user input for three categories of signals:

#### 1. Feature Count
- Regex pattern: Extract distinct items after action verbs ("add X", "build Y", "implement Z")
- **1 feature** → feature-flow signal
- **2-3 features** → neutral
- **4+ features** → GSD signal

#### 2. Scope Keywords (High-Confidence GSD Indicators)
- "from scratch", "complete app", "full system", "entire", "build everything"
- "multiple independent", "parallel execution", "separate services"
- "full project", "entire product"

#### 3. Time Estimates
- "1-2 hours", "a few hours", "today" → feature-flow
- "1-2 weeks", "several weeks", "a month", "sprint" → GSD

#### 4. Complexity Patterns
- Multiple tech stack mentions in one description
- Microservices/distributed references
- Explicit numbers: "50+ tasks", "10+ pages", "20+ endpoints"

### Recommendation Scoring

Calculate weighted confidence score (0.0 to 1.0):

| Signal | Weight | Triggering Condition |
|--------|--------|----------------------|
| Feature count 4+ | +0.3 | Count >= 4 |
| Feature count 2-3 | +0.1 | Count = 2-3 |
| Scope keyword hit | +0.4 | 1+ keywords found |
| Time estimate weeks+ | +0.2 | Weeks/months mentioned |
| Complexity pattern | +0.2 | Multiple stacks or micro pattern |

**Recommendation bands:**
- **🟢 feature-flow** (0.0–0.4): Small scope, 1-2 features, hours-scale
- **🟡 GSD-recommended** (0.4–0.7): Multi-feature, weeks-scale, moderate complexity
- **🔴 GSD-strongly-recommended** (0.7+): Large project, 5+ features, "from scratch", complexity patterns

### Display Format

```
✅ Project Analysis:
  • Features detected: 4 (payments, invoicing, billing, analytics)
  • Scope: "complete SaaS from scratch"
  • Timeline: weeks/months
  • Confidence: 80%

🟡 Recommendation: This looks like a GSD project.

GSD handles multiple independent features better through parallel execution
and wave-based delivery. Feature-flow excels at single features with deep
verification.

Which would you prefer?
  [Launch GSD (Recommended)]  [Use feature-flow anyway]
```

---

## Context Handoff Mechanism

When user chooses GSD:

### 1. Metadata Extraction
Extract from `.feature-flow.yml`:
- Stack (Node.js, React, TypeScript, etc.)
- Database type
- Repository info
- Tech preferences

### 2. Prepare Handoff Payload
Create `.gsd-handoff.json`:
```json
{
  "source": "feature-flow",
  "original_description": "build complete SaaS with payments, billing, analytics",
  "stack": "node-js/react/typescript",
  "repo_url": "/Users/weee/Dev/my-project",
  "repo_state": "clean",
  "metadata": {
    "features_detected": 4,
    "recommendation_confidence": 0.8,
    "detected_features": ["payments", "invoicing", "billing", "analytics"],
    "detected_scope": "from scratch",
    "recommended_tool_reason": "4+ features detected, weeks timeline"
  }
}
```

### 3. Launch GSD
```bash
npx get-shit-done-cc@latest --handoff-from-feature-flow
```

GSD detects handoff file and skips initial "what are you building?" questions, jumping straight to:
```
I see you want to build: [original_description]

Let me clarify the scope and break this into waves...
```

### 4. Cleanup
After GSD launch completes, delete `.gsd-handoff.json`

### Error Handling
- **GSD not installed:** Show installation instructions, offer to proceed with feature-flow
- **Handoff file write fails:** Launch GSD normally (user can re-paste description)
- **User cancels GSD:** Offer to return to feature-flow or exit cleanly

---

## Configuration & Override System

### Configuration in `.feature-flow.yml`

```yaml
tool_selector:
  enabled: true                    # Enable/disable tool selection
  confidence_threshold: 0.7        # Only recommend if >= 70% confident
  auto_launch_gsd: false          # Auto-launch GSD without asking
```

### Command-Line Overrides

```bash
start: build my app                    # Normal: show recommendation if triggered
start: build my app --feature-flow    # Force feature-flow, skip recommendation
start: build my app --gsd             # Force GSD, skip recommendation
```

### Priority Order (Highest to Lowest)
1. Command-line flags (`--feature-flow`, `--gsd`)
2. Config file (`tool_selector` section in `.feature-flow.yml`)
3. Automatic detection (heuristic scoring)

---

## Supported User Workflows

| Workflow | Config | Behavior |
|----------|--------|----------|
| Always use feature-flow | `enabled: false` | Skip tool selector entirely |
| Smart defaults | Default config | Show recommendation when confident, let user choose |
| Auto-decide for me | `auto_launch_gsd: true` | Launch GSD automatically when detected |
| Override per session | Use `--feature-flow` or `--gsd` | Command-line flag takes precedence |

---

## Implementation Scope

### Files to Create/Modify

1. **`skills/start/SKILL.md`** — Add Tool Selection section at the beginning
   - Heuristic detection logic
   - Recommendation display
   - Configuration documentation
   - Command-line flag parsing

2. **`.feature-flow.yml`** — Add `tool_selector` configuration section
   - Three new config keys with sensible defaults

3. **`skills/start/references/step-lists.md`** — Add reference section
   - "Tool Selector Detection" step-by-step
   - Heuristics reference table with examples

4. **Implementation in `start` skill** — Parse and execute
   - Command parsing for flags
   - Heuristic scoring function
   - Recommendation display
   - Handoff file generation
   - GSD launcher with proper error handling

### Non-Breaking Changes
- Default config enables detection but requires user confirmation (safe)
- Users can disable entirely if they prefer current behavior
- All existing feature-flow workflows unaffected (tool selector is additive)

---

## Acceptance Criteria

- [ ] Detection correctly identifies 1-3 features as feature-flow, 4+ as GSD
- [ ] All scope keywords in heuristics are detected in descriptions
- [ ] Time estimate parsing extracts weeks/months and triggers GSD recommendation
- [ ] Recommendation displays with correct confidence level (🟢/🟡/🔴)
- [ ] User can click "Launch GSD" and context handoff works
- [ ] User can click "Use feature-flow anyway" and lifecycle continues normally
- [ ] `.gsd-handoff.json` is created with all required metadata
- [ ] GSD is launched with `--handoff-from-feature-flow` flag
- [ ] `.feature-flow.yml` config options (enabled, threshold, auto_launch) are respected
- [ ] Command-line flags (`--feature-flow`, `--gsd`) skip recommendation
- [ ] Handoff file is cleaned up after GSD process exits
- [ ] Graceful error handling if GSD not installed
- [ ] Graceful fallback if handoff file can't be written

---

## Testing Strategy

### Unit Tests
- Heuristic scoring: Test each signal alone and in combination
- Recommendation binning: Verify correct band for each score range
- Feature extraction: Parse descriptions with varying complexity
- Config parsing: Load and respect `.feature-flow.yml` values

### Integration Tests
- End-to-end: `start: description` → correct recommendation shown
- Override: `start: description --feature-flow` → skips recommendation
- Handoff: `start: description` → choose GSD → handoff file created with correct metadata
- Config disabled: `enabled: false` → recommendation never shown
- Threshold: Score 0.65 with threshold 0.7 → no recommendation shown

### Manual Testing
- User says: "start: add a logout button" → 🟢 feature-flow
- User says: "start: build complete SaaS with payments, billing, analytics" → 🔴 GSD-recommended
- User says: "start: build from scratch" → 🟡/🔴 GSD recommended
- User chooses GSD → handoff works, GSD launches with context

---

## Success Metrics

1. **Reduction in wrong tool choice** — Users select appropriate tool first time
2. **Zero re-explanation friction** — Context passes smoothly from feature-flow to GSD
3. **User control maintained** — Config/flags allow full override
4. **Non-disruptive** — Normal feature-flow workflows unaffected; tool selector is optional/additive

---

## Notes for Implementation

- Heuristic weights are initial estimates; may need tuning based on real usage
- Consider adding telemetry: track how often each recommendation band is triggered
- Future enhancement: Learn from user choices to improve confidence thresholds
- Keep detection logic stateless (no session memory needed)
- Handoff JSON should be human-readable for debugging
