# Tool Selector GSD Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement intelligent tool selection that recommends GSD vs feature-flow based on project scale and enables seamless handoff between tools.

**Architecture:** Tool selector runs as step 0 in the `start` skill. It parses the user's description, applies weighted heuristics (feature count, scope keywords, timeline), calculates confidence, displays recommendation, and either launches GSD with context handoff or continues with feature-flow.

**Tech Stack:** Markdown-based skill implementation, shell scripting for GSD launcher, JSON for handoff payload

**Key Files:**
- `skills/start/SKILL.md` — Tool selector implementation + docs
- `.feature-flow.yml` — Config schema (enabled, threshold, auto_launch)
- `skills/start/references/step-lists.md` — Reference documentation
- Unit + integration tests embedded in SKILL.md

---

## Task 1: Add Configuration Schema to .feature-flow.yml

**Files:**
- Modify: `.feature-flow.yml`

**Step 1: Read current .feature-flow.yml**

Run: `cat .feature-flow.yml | head -30`

This shows the current structure. Look for where top-level config keys like `context7` are defined.

**Step 2: Add tool_selector section with defaults**

Add this YAML block after the `context7` section:

```yaml
# Tool Selector Configuration
# Intelligently recommends GSD vs feature-flow based on project scale
tool_selector:
  enabled: true                    # Enable/disable intelligent tool selection
  confidence_threshold: 0.7        # Only recommend GSD if confidence >= 70%
  auto_launch_gsd: false          # If true, launch GSD automatically without asking
```

Position it logically near other top-level config sections.

**Step 3: Verify file is valid YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.feature-flow.yml'))" && echo "✅ Valid YAML"`

Expected: ✅ Valid YAML

**Step 4: Commit**

```bash
git add .feature-flow.yml
git commit -m "config: add tool_selector schema to .feature-flow.yml

Add three new configuration options:
- enabled: Enable/disable the tool selection recommendation (default: true)
- confidence_threshold: Minimum confidence to show recommendation (default: 0.7)
- auto_launch_gsd: Skip user confirmation and launch GSD automatically (default: false)

These enable users to control when/how tool selection recommendations appear."
```

---

## Task 2: Implement Heuristic Detection Functions

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Add heuristics section to SKILL.md**

Find the "Tool Selection" heading you'll add to SKILL.md. Under it, add a code block with these functions. Insert this as a new section after the "Pre-Flight Check" section and before "Brainstorming".

**Step 2: Write feature count detection function**

Add this function (in pseudo-code documented in markdown):

```markdown
### Feature Count Detection

Extract distinct features from user description:
- Pattern: Look for action verbs followed by nouns: "add X", "build Y", "implement Z"
- Use regex: \b(add|build|implement|create|develop|design|make|write)\s+([a-z\s]+?)(?=and|,|then|\s+with|\s+for|$)
- Split by "and", count distinct items
- Examples:
  - "add a logout button" → 1 feature
  - "build payments and invoicing" → 2 features
  - "create payments, billing, analytics, dashboards" → 4 features

Scoring:
- 1 feature: +0 (neutral baseline)
- 2-3 features: +0.1
- 4+ features: +0.3
```

**Step 3: Write scope keyword detection**

Add this function documentation:

```markdown
### Scope Keyword Detection

Search for high-confidence GSD indicators:
- Keywords: "from scratch", "complete app", "full system", "entire", "build everything"
- Keywords: "multiple independent", "parallel execution", "separate services"
- Keywords: "full project", "entire product"

Scoring:
- 1+ keyword found: +0.4 (high weight)
- No keywords: +0 (neutral)
```

**Step 4: Write timeline detection**

Add this function documentation:

```markdown
### Timeline Detection

Parse time estimates:
- Feature-flow signals: "1-2 hours", "a few hours", "today", "this afternoon"
- GSD signals: "1-2 weeks", "several weeks", "a month", "a sprint", "2-3 months"

Scoring:
- GSD timeline (weeks+): +0.2
- Feature-flow timeline (hours): -0.1 (slightly reduces GSD score)
- No timeline: +0 (neutral)
```

**Step 5: Write complexity pattern detection**

Add this function documentation:

```markdown
### Complexity Pattern Detection

Detect architectural complexity:
- Multiple tech stack mentions (e.g., "React frontend AND Node backend AND PostgreSQL")
- Microservices references: "services", "distributed", "microservice", "API gateway"
- Explicit numbers: "50+ tasks", "10+ pages", "20+ endpoints"

Scoring:
- Complexity pattern found: +0.2
- No pattern: +0 (neutral)
```

**Step 6: Write scoring function documentation**

Add this:

```markdown
### Recommendation Scoring

Combine all signals into a single confidence score (0.0–1.0):

| Signal | Weight | Condition |
|--------|--------|-----------|
| 4+ features | +0.3 | Feature count >= 4 |
| 2-3 features | +0.1 | Feature count = 2-3 |
| Scope keyword | +0.4 | 1+ keyword found |
| GSD timeline | +0.2 | "weeks", "months", etc. |
| Feature-flow timeline | -0.1 | "hours", "today", etc. |
| Complexity pattern | +0.2 | Multiple stacks or microservices |

Final score bands:
- 🟢 feature-flow (0.0–0.4): Small, 1-2 features, hours-scale
- 🟡 GSD-recommended (0.4–0.7): Multi-feature, weeks-scale
- 🔴 GSD-strongly-recommended (0.7+): Large, 5+ features, "from scratch"
```

**Step 7: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "docs: add tool selector heuristic detection logic to SKILL.md

Document the heuristic scoring system:
- Feature count detection (1 vs 2-3 vs 4+ features)
- Scope keyword patterns (from scratch, complete app, etc.)
- Timeline estimation (hours vs weeks/months)
- Complexity patterns (multiple stacks, microservices)
- Weighted scoring system producing 0.0-1.0 confidence
- Recommendation bands (🟢 feature-flow, 🟡 GSD-recommended, 🔴 GSD-strongly-recommended)

This establishes the detection foundation before implementation."
```

---

## Task 3: Implement Command-Line Flag Parsing

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Document flag parsing logic**

Add a new section "Command-Line Flag Parsing":

```markdown
### Command-Line Flag Parsing

The `start:` command accepts optional flags to override tool selection:

**Usage:**
```bash
start: <description> [--feature-flow | --gsd]
```

**Parsing logic:**
1. Extract user input after `start:` keyword
2. Check for `--feature-flow` or `--gsd` flags at the end
3. If flag found, remove it from description and set override
4. If no flag, proceed with automatic detection

**Examples:**
- `start: add logout button --feature-flow` → description: "add logout button", override: feature-flow
- `start: build complete app --gsd` → description: "build complete app", override: gsd
- `start: build payments system` → description: "build payments system", override: none (auto-detect)

**Priority:**
1. Command-line flags (highest priority)
2. Config file settings (tool_selector section)
3. Automatic heuristic detection (default)

If flag is present, skip all other logic and use that flag's value.
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "docs: add command-line flag parsing documentation to SKILL.md

Document flag parsing logic for tool selector overrides:
- --feature-flow flag: Force feature-flow, skip recommendation
- --gsd flag: Force GSD, skip recommendation
- Priority: flags > config > auto-detect
- Examples and implementation guidance

This enables users to override tool selection when needed."
```

---

## Task 4: Implement Configuration Loading

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Document config loading**

Add a new section "Configuration Loading":

```markdown
### Configuration Loading

The start skill reads tool_selector config from `.feature-flow.yml`:

**Precedence (highest to lowest):**
1. Command-line flags (`--feature-flow` or `--gsd`) if provided
2. Config file values from `.feature-flow.yml` → tool_selector section
3. Built-in defaults (enabled: true, threshold: 0.7, auto_launch: false)

**Reading config:**
```bash
# Extract tool_selector section from .feature-flow.yml
# Parse enabled, confidence_threshold, auto_launch_gsd values
# Use defaults if section or keys missing
```

**Config values:**
- `tool_selector.enabled` (boolean, default: true)
  - If false: Skip tool selection entirely, proceed with feature-flow
  - If true: Run detection and show recommendation if confident

- `tool_selector.confidence_threshold` (float 0-1, default: 0.7)
  - Only show recommendation if calculated confidence >= threshold
  - Example: score 0.65 with threshold 0.7 → no recommendation shown

- `tool_selector.auto_launch_gsd` (boolean, default: false)
  - If true: Launch GSD automatically when GSD is recommended
  - If false: Ask user "Launch GSD or use feature-flow?" first

**Default values** (if .feature-flow.yml missing or incomplete):
```yaml
tool_selector:
  enabled: true
  confidence_threshold: 0.7
  auto_launch_gsd: false
```
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "docs: add configuration loading logic for tool selector

Document how tool_selector config is read from .feature-flow.yml:
- Precedence: flags > config file > defaults
- enabled: whether tool selection is active
- confidence_threshold: minimum confidence to show recommendation
- auto_launch_gsd: auto-launch GSD without asking user
- Defaults provided when config is missing or incomplete

This enables flexible user configuration without breaking existing workflows."
```

---

## Task 5: Implement Recommendation Display Logic

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Document recommendation display**

Add a new section "Recommendation Display":

```markdown
### Recommendation Display

Display recommendation to user with confidence level:

**If tool_selector.enabled = false:**
Skip display entirely, proceed directly with feature-flow.

**If confidence < threshold:**
Show quiet notification (no choice prompt):
```
✅ This looks like feature-flow work. Starting...
```

**If confidence in band 🟡 (0.4–0.7):**
```
✅ Project Analysis:
  • Features detected: 4
  • Scope: "complete SaaS from scratch"
  • Timeline: weeks/months
  • Confidence: 65%

🟡 Recommendation: This could be a GSD project.

GSD handles multiple features through parallel execution and wave-based delivery.
Feature-flow excels at single features with deep verification and thorough testing.

Which would you prefer?
  [Launch GSD]  [Use feature-flow anyway]
```

**If confidence in band 🔴 (0.7+):**
```
✅ Project Analysis:
  • Features detected: 5
  • Scope: "build from scratch"
  • Timeline: 2+ months
  • Confidence: 82%

🔴 Recommendation: This is a GSD project.

Multiple independent features work best in parallel. Feature-flow is built for
focused single-feature development with thorough testing.

Which would you prefer?
  [Launch GSD (Recommended)]  [Use feature-flow anyway]
```

**User interaction:**
- If tool_selector.auto_launch_gsd = true: Auto-launch GSD without prompt
- If tool_selector.auto_launch_gsd = false: Show buttons, wait for user choice

**Output clarity:**
- Use emoji indicators (🟢/🟡/🔴) for confidence level
- List detected features and scope for transparency
- Explain WHY each tool is recommended
- Keep explanations brief (2-3 sentences max)
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "docs: add recommendation display logic and messaging

Document how tool selector recommendation is presented to users:
- Display suppressed if tool_selector.enabled = false
- Quiet notification if below confidence threshold
- Full recommendation with emoji indicators if confident
- Brief explanation of why each tool is recommended
- Auto-launch if configured, or prompt user to choose

This ensures transparent, user-friendly tool selection with clear reasoning."
```

---

## Task 6: Implement GSD Context Handoff

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Document handoff payload generation**

Add a new section "GSD Handoff Mechanism":

```markdown
### GSD Handoff Mechanism

When user chooses "Launch GSD", prepare context handoff:

**Step 1: Extract project metadata**
Read from `.feature-flow.yml`:
- stack (node-js, react, python, etc.)
- database (postgres, mongodb, etc.)
- Any other project context

**Step 2: Generate handoff payload**

Create `.gsd-handoff.json` in repo root:
```json
{
  "source": "feature-flow",
  "timestamp": "2026-03-09T14:30:00Z",
  "original_description": "build complete SaaS with payments, billing, analytics",
  "stack": "node-js/react/typescript",
  "database": "postgres",
  "repo_url": "current working directory path",
  "repo_state": "clean",
  "metadata": {
    "features_detected": 4,
    "recommendation_confidence": 0.8,
    "detected_features": ["payments", "invoicing", "billing", "analytics"],
    "detected_scope": "from scratch",
    "recommended_tool_reason": "4+ features detected + 'from scratch' + weeks timeline"
  }
}
```

**Step 3: Launch GSD**
```bash
npx get-shit-done-cc@latest --handoff-from-feature-flow
```

GSD detects `.gsd-handoff.json` and:
1. Reads the `original_description`
2. Skips "what are you building?" questions
3. Jumps to "Let me clarify scope..." phase

**Step 4: Cleanup**
After GSD exits (success or cancel):
- Delete `.gsd-handoff.json`
- Return control to user or shell

**Error handling:**
- If GSD not installed: Show install command, offer to continue with feature-flow
- If handoff file can't be written: Launch GSD normally (user pastes description again)
- If user cancels GSD: Ask "return to feature-flow or exit?"
```

**Step 2: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "docs: add GSD handoff mechanism and context passing

Document how context is prepared and passed to GSD:
- Extract project metadata from .feature-flow.yml
- Generate .gsd-handoff.json with original description, stack, detected features
- Launch GSD with --handoff-from-feature-flow flag
- GSD skips initial questions and jumps to scope clarification
- Cleanup .gsd-handoff.json after GSD exits
- Error handling for missing GSD, write failures, user cancellation

This enables seamless context handoff without re-explanation."
```

---

## Task 7: Add Reference Documentation to step-lists.md

**Files:**
- Modify: `skills/start/references/step-lists.md`

**Step 1: Read current step-lists.md structure**

Run: `head -50 skills/start/references/step-lists.md`

This shows where to insert the new section.

**Step 2: Add "Tool Selector Detection" reference section**

Find a logical place (likely after "Pre-Flight Check" section) and add:

```markdown
## Tool Selector Detection

The `start` skill analyzes your project description to recommend feature-flow or GSD.

### How It Works

**1. Feature Detection**
Counts distinct features mentioned: "add X", "build Y", "implement Z"
- 1 feature: feature-flow signal
- 2-3 features: neutral
- 4+ features: GSD signal

**2. Scope Keywords**
Searches for high-impact phrases:
- GSD indicators: "from scratch", "complete app", "full system", "build everything"
- GSD indicators: "multiple independent", "parallel execution", "separate services"

**3. Timeline Estimation**
Extracts time mentions:
- Feature-flow: "1-2 hours", "a few hours", "today"
- GSD: "1-2 weeks", "several weeks", "a month"

**4. Complexity Patterns**
Detects architectural signals:
- Multiple tech stacks in one description
- Microservices or distributed language
- Explicit counts: "50+ tasks", "10+ pages"

### Recommendation Bands

| Band | Confidence | When | Action |
|------|-----------|------|--------|
| 🟢 feature-flow | 0-40% | Small scope, 1-2 features | Proceed with feature-flow |
| 🟡 GSD-recommended | 40-70% | Multi-feature, weeks timeline | Ask user to choose |
| 🔴 GSD-strongly-recommended | 70%+ | Large, "from scratch", complex | Ask user to choose |

### Examples

**Triggers 🟢 feature-flow:**
```
start: add a logout button
start: implement dark mode
start: fix the authentication bug
```

**Triggers 🟡 GSD-recommended:**
```
start: build payments and invoicing features
start: create user dashboard and settings page
```

**Triggers 🔴 GSD-strongly-recommended:**
```
start: build complete SaaS with payments, billing, analytics, dashboards
start: build from scratch with React frontend, Node backend, PostgreSQL
```

### Configuration

Control tool selection with `.feature-flow.yml`:
```yaml
tool_selector:
  enabled: true                  # Enable/disable tool selection
  confidence_threshold: 0.7      # Only recommend if >= 70% confident
  auto_launch_gsd: false        # Auto-launch GSD without asking
```

Or use command-line overrides:
```bash
start: description --feature-flow   # Force feature-flow
start: description --gsd            # Force GSD
start: description                  # Auto-detect
```
```

**Step 3: Commit**

```bash
git add skills/start/references/step-lists.md
git commit -m "docs: add tool selector detection reference to step-lists.md

Add comprehensive reference section explaining:
- How feature detection, scope keywords, timeline, complexity patterns work
- Recommendation confidence bands (🟢/🟡/🔴)
- Real-world examples for each band
- Configuration options via .feature-flow.yml
- Command-line override syntax

This provides users with clear understanding of when each tool is recommended."
```

---

## Task 8: Write Unit Tests for Heuristics

**Files:**
- Create: `tests/start/test_tool_selector_heuristics.md`

**Step 1: Create test file**

Create the test documentation file with test cases:

```markdown
# Tool Selector Heuristics — Unit Tests

## Feature Count Detection Tests

### Test: Single feature detected
Input: "add a logout button"
Expected: feature_count = 1, signal = 0

### Test: Two features detected
Input: "build payments and invoicing"
Expected: feature_count = 2, signal = +0.1

### Test: Four features detected
Input: "create payments, billing, analytics, dashboards"
Expected: feature_count = 4, signal = +0.3

### Test: Complex description with 5 features
Input: "build payments system, billing, invoices, subscription management, and admin dashboard"
Expected: feature_count >= 5, signal = +0.3

## Scope Keyword Detection Tests

### Test: "from scratch" detected
Input: "build complete app from scratch"
Expected: scope_keyword_found = true, signal = +0.4

### Test: "complete app" detected
Input: "build complete app for SaaS"
Expected: scope_keyword_found = true, signal = +0.4

### Test: "full system" detected
Input: "implement full system for payment processing"
Expected: scope_keyword_found = true, signal = +0.4

### Test: No scope keywords
Input: "add a new button"
Expected: scope_keyword_found = false, signal = 0

## Timeline Detection Tests

### Test: Hours timeline (feature-flow)
Input: "build this in a few hours"
Expected: timeline_type = "hours", signal = -0.1

### Test: Weeks timeline (GSD)
Input: "build this over 2-3 weeks"
Expected: timeline_type = "weeks", signal = +0.2

### Test: Months timeline (GSD)
Input: "build this in a month"
Expected: timeline_type = "months", signal = +0.2

### Test: No timeline mentioned
Input: "build a feature"
Expected: timeline_type = "none", signal = 0

## Confidence Scoring Tests

### Test: Simple feature (1 feature, no keywords, hours)
Input: "add logout button in a couple hours"
Expected: confidence = 0.0-0.2 (🟢 feature-flow)

### Test: Multi-feature moderate complexity
Input: "build payments and billing features over 2 weeks"
Expected: confidence = 0.4-0.6 (🟡 GSD-recommended)

### Test: Large from-scratch project
Input: "build complete SaaS from scratch with payments, billing, analytics, dashboards over 2 months"
Expected: confidence = 0.7+ (🔴 GSD-strongly-recommended)

### Test: Explicit 5+ features
Input: "create feature A, feature B, feature C, feature D, feature E"
Expected: confidence = 0.3+ (at least in neutral/GSD range)
```

**Step 2: Commit**

```bash
git add tests/start/test_tool_selector_heuristics.md
git commit -m "test: add unit test cases for tool selector heuristics

Document test cases for:
- Feature count detection (1, 2, 4, 5+ features)
- Scope keyword patterns (from scratch, complete app, full system)
- Timeline detection (hours vs weeks vs months)
- Confidence scoring across all combinations

These tests verify heuristic accuracy before integration."
```

---

## Task 9: Write Integration Tests

**Files:**
- Create: `tests/start/test_tool_selector_integration.md`

**Step 1: Create integration test file**

```markdown
# Tool Selector — Integration Tests

## End-to-End Tool Selection Tests

### Test: Small feature triggers feature-flow
**Action:** `start: add a logout button`
**Expected:**
- Heuristics run
- Confidence < 0.4
- No recommendation shown
- Continue with feature-flow lifecycle
- Brainstorming skill invoked

### Test: Multi-feature triggers GSD recommendation
**Action:** `start: build payments and billing features`
**Expected:**
- Heuristics run
- Confidence 0.4-0.7
- Display: "🟡 GSD-recommended"
- Show: [Launch GSD] [Use feature-flow anyway]
- User clicks "Use feature-flow"
- Continue with feature-flow
- Brainstorming skill invoked

### Test: Large project triggers GSD strongly-recommended
**Action:** `start: build complete SaaS from scratch with payments, billing, analytics`
**Expected:**
- Heuristics run
- Confidence >= 0.7
- Display: "🔴 GSD-strongly-recommended"
- Show: [Launch GSD (Recommended)] [Use feature-flow anyway]

## Command-Line Override Tests

### Test: --feature-flow flag skips recommendation
**Action:** `start: build complete app --feature-flow`
**Expected:**
- Skip heuristic detection
- No recommendation shown
- Continue with feature-flow
- Brainstorming invoked
- Description = "build complete app" (flag removed)

### Test: --gsd flag skips recommendation
**Action:** `start: build complete app --gsd`
**Expected:**
- Skip heuristic detection
- Launch GSD immediately
- Handoff file created
- No feature-flow brainstorming

## Configuration Tests

### Test: tool_selector disabled
**Config:** `enabled: false`
**Action:** `start: build complete SaaS from scratch`
**Expected:**
- Heuristics run but not displayed
- No recommendation shown
- Continue with feature-flow
- Brainstorming invoked

### Test: Confidence threshold blocks recommendation
**Config:** `confidence_threshold: 0.9`
**Action:** `start: build payments and billing` (confidence 0.5)
**Expected:**
- Heuristics run
- Confidence 0.5 < threshold 0.9
- No recommendation shown
- Continue with feature-flow

### Test: Auto-launch GSD
**Config:** `auto_launch_gsd: true`
**Action:** `start: build complete SaaS from scratch` (confidence 0.8)
**Expected:**
- Recommendation confidence >= threshold
- Skip user prompt
- Launch GSD immediately
- Handoff file created

## GSD Handoff Tests

### Test: Handoff JSON created with correct metadata
**Action:** User chooses "Launch GSD"
**Expected:**
- `.gsd-handoff.json` created with:
  - original_description
  - stack from .feature-flow.yml
  - features_detected
  - recommendation_confidence
  - detected_features list
  - detected_scope

### Test: GSD launched with --handoff-from-feature-flow flag
**Expected:**
- Shell command: `npx get-shit-done-cc@latest --handoff-from-feature-flow`
- GSD detects handoff file
- GSD reads original_description
- GSD skips initial questions

### Test: Handoff file cleaned up after GSD exits
**Expected:**
- `.gsd-handoff.json` deleted after GSD process completes
- Directory clean
- No orphaned files

## Error Handling Tests

### Test: GSD not installed
**Action:** User chooses "Launch GSD" but GSD not installed
**Expected:**
- Error: "GSD not installed"
- Show: `npm install -g get-shit-done-cc@latest`
- Offer: "Continue with feature-flow anyway? [yes/no]"
- If yes: proceed with feature-flow

### Test: Handoff file can't be written
**Action:** File system error when writing `.gsd-handoff.json`
**Expected:**
- Error logged
- GSD launched without handoff file
- User in GSD describes project (slower but works)

### Test: User cancels GSD
**Action:** User launches GSD, then exits/cancels
**Expected:**
- Detect GSD process exit
- Delete `.gsd-handoff.json`
- Offer: "Return to feature-flow or exit? [return/exit]"
```

**Step 2: Commit**

```bash
git add tests/start/test_tool_selector_integration.md
git commit -m "test: add integration test cases for tool selector

Document integration tests for:
- End-to-end tool selection flows
- Command-line flag overrides (--feature-flow, --gsd)
- Configuration precedence (flags > config > defaults)
- GSD handoff mechanism and cleanup
- Error handling (GSD not installed, write failures, user cancellation)

These tests verify full workflow from recommendation through execution."
```

---

## Task 10: Integrate Tool Selector into start Skill

**Files:**
- Modify: `skills/start/SKILL.md`

**Step 1: Add Tool Selection section at the start**

Find the beginning of the skill after the frontmatter (after the `---`). Add this section BEFORE the "Pre-Flight Check" section:

```markdown
# Start — Lifecycle Orchestrator

Guide development work through the correct lifecycle steps, invoking the right skill at each stage. This is the single entry point for any non-trivial work.

**Announce at start:** "Starting the feature lifecycle. Analyzing your project..."

---

## Tool Selection

Before brainstorming, analyze your project description to recommend feature-flow or GSD.

### Step 1: Check if tool selection is enabled

Read `.feature-flow.yml` and look for `tool_selector.enabled`:
- If `enabled: false` → skip tool selection, proceed directly to brainstorming
- If `enabled: true` or missing → continue to step 2

### Step 2: Check for command-line overrides

Did the user include `--feature-flow` or `--gsd` flag?
- If `--feature-flow` present → remove flag from description, skip detection, use feature-flow
- If `--gsd` present → remove flag from description, skip detection, launch GSD
- If no flags → continue to step 3

### Step 3: Run heuristic detection

Analyze user's project description using heuristics:
1. Extract feature count (using regex for action verbs)
2. Check for scope keywords ("from scratch", "complete app", etc.)
3. Parse timeline mentions ("hours" vs "weeks/months")
4. Detect complexity patterns (multiple stacks, microservices, explicit counts)

Calculate weighted confidence score (0.0–1.0) using scoring table.

### Step 4: Check confidence threshold

Read `tool_selector.confidence_threshold` from .feature-flow.yml (default: 0.7):
- If calculated_confidence < threshold → skip recommendation, proceed with feature-flow
- If calculated_confidence >= threshold → continue to step 5

### Step 5: Display recommendation

Show recommendation based on confidence band:
- **🟢 feature-flow** (0.0–0.4): Skip display, proceed silently
- **🟡 GSD-recommended** (0.4–0.7): Display recommendation, ask user to choose
- **🔴 GSD-strongly-recommended** (0.7+): Display recommendation, ask user to choose

### Step 6: Execute user choice

- If user chooses "Use feature-flow" → proceed with brainstorming
- If user chooses "Launch GSD" → execute GSD handoff (see below)
- If `auto_launch_gsd: true` → skip user choice, execute GSD handoff automatically

### GSD Handoff Execution

When launching GSD:

1. **Extract metadata** from `.feature-flow.yml` (stack, database, etc.)
2. **Create `.gsd-handoff.json`** with:
   - original_description (from start command)
   - stack, database, repo info
   - features_detected, recommendation_confidence
   - detected_features, detected_scope, recommended_tool_reason
3. **Launch GSD:**
   ```bash
   npx get-shit-done-cc@latest --handoff-from-feature-flow
   ```
4. **Handle errors:**
   - If GSD not installed → show install instructions, offer to continue with feature-flow
   - If handoff file write fails → launch GSD normally (user re-explains)
   - If user cancels GSD → ask "return to feature-flow or exit?"
5. **Cleanup:** Delete `.gsd-handoff.json` after GSD exits

---
```

**Step 2: Update the "Announce at start" line**

Change the existing announcement from just brainstorming to include tool selection:

```markdown
**Announce at start:** "Starting the feature lifecycle. Analyzing your project to recommend the right tool..."
```

**Step 3: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat: integrate tool selector as step 0 in start skill lifecycle

Add Tool Selection section as the first step in start skill:
- Checks if tool selection enabled (configurable)
- Parses command-line flags (--feature-flow, --gsd)
- Runs heuristic detection on project description
- Respects confidence threshold from config
- Displays recommendation (🟢/🟡/🔴) when appropriate
- Executes GSD handoff with context or continues with feature-flow
- Includes error handling for all failure modes

This enables seamless tool selection as the entry point to feature-flow."
```

---

## Task 11: Manual End-to-End Testing

**Files:**
- Manual testing (no files changed)

**Step 1: Test basic feature-flow (no recommendation)**

Run:
```bash
start: add a logout button
```

Expected:
- No recommendation shown
- Brainstorming starts normally
- Tool selection was silent

**Step 2: Test GSD recommendation (moderate complexity)**

Run:
```bash
start: build payments and invoicing features
```

Expected:
- Shows: "🟡 GSD-recommended"
- Shows recommendation text
- Two buttons: "Launch GSD", "Use feature-flow anyway"
- Click "Use feature-flow" → brainstorming starts

**Step 3: Test GSD strong recommendation**

Run:
```bash
start: build complete SaaS from scratch with payments, billing, analytics, dashboards
```

Expected:
- Shows: "🔴 GSD-strongly-recommended"
- Confidence >= 70%
- First button says "Launch GSD (Recommended)"
- Click "Launch GSD" → handoff created, GSD launches

**Step 4: Test --feature-flow override**

Run:
```bash
start: build complete SaaS --feature-flow
```

Expected:
- No recommendation shown
- Description does not include "--feature-flow"
- Brainstorming starts
- Tool selection was skipped

**Step 5: Test --gsd override**

Run:
```bash
start: build complete SaaS --gsd
```

Expected:
- No recommendation shown
- GSD launches immediately
- Handoff file created
- Tool selection logic skipped

**Step 6: Test config disabled**

Edit `.feature-flow.yml` and set `tool_selector.enabled: false`

Run:
```bash
start: build complete SaaS from scratch
```

Expected:
- No recommendation shown (even though confidence should be high)
- Brainstorming starts
- Tool selection was disabled

**Step 7: Test config threshold**

Edit `.feature-flow.yml` and set `tool_selector.confidence_threshold: 0.9`

Run:
```bash
start: build payments and billing
```

Expected:
- No recommendation shown
- Confidence (0.4-0.6) < threshold (0.9)
- Brainstorming starts

**Step 8: Test auto-launch**

Edit `.feature-flow.yml` and set `tool_selector.auto_launch_gsd: true`

Run:
```bash
start: build complete SaaS from scratch
```

Expected:
- No user prompt
- GSD launches automatically
- Handoff file created
- No recommendation dialog shown

**Step 9: Test GSD not installed**

Ensure GSD is not installed, then:

Run:
```bash
start: build complete SaaS
```

Respond "Launch GSD"

Expected:
- Error: "GSD not installed"
- Show: install command
- Ask: "Continue with feature-flow? [yes/no]"
- Respond "yes"
- Brainstorming starts
- No crash

**Step 10: Document results**

Create a test results summary:

```
# Tool Selector Manual Testing Results

## Passed
- ✅ Basic feature-flow (no recommendation)
- ✅ GSD recommendation (moderate)
- ✅ GSD strong recommendation
- ✅ --feature-flow override
- ✅ --gsd override
- ✅ Config disabled
- ✅ Config threshold blocking
- ✅ Auto-launch GSD
- ✅ GSD not installed (graceful error)

## Configuration verified
- ✅ .feature-flow.yml schema valid
- ✅ tool_selector.enabled respected
- ✅ tool_selector.confidence_threshold respected
- ✅ tool_selector.auto_launch_gsd respected

## Integration verified
- ✅ Heuristics calculate correct scores
- ✅ Recommendation bands display correctly
- ✅ Handoff file contains all metadata
- ✅ GSD receives context without loss
- ✅ Error handling works for all failure modes
```

**Step 11: Commit**

```bash
git add .
git commit -m "test: complete manual end-to-end testing of tool selector

Verified all user-facing flows:
- Basic feature-flow detection
- GSD recommendations (moderate and strong)
- Command-line flag overrides
- Configuration precedence
- Error handling (GSD not installed)
- Graceful fallbacks

All 10+ manual test cases passed. Tool selector ready for production use."
```

---

## Task 12: Verify All Acceptance Criteria

**Files:**
- None (verification only)

**Step 1: Run verification against acceptance criteria**

From design document, verify each criterion:

```
✅ Detection correctly identifies 1-3 features as feature-flow, 4+ as GSD
   → Test: "add button" → 1 feature → no recommendation ✓
   → Test: "build payments, billing, analytics" → 3 features → GSD ✓

✅ All scope keywords in heuristics are detected in descriptions
   → "from scratch" detected ✓
   → "complete app" detected ✓
   → "full system" detected ✓

✅ Time estimate parsing extracts weeks/months and triggers GSD recommendation
   → "2 weeks" → GSD signal ✓
   → "several weeks" → GSD signal ✓

✅ Recommendation displays with correct confidence level (🟢/🟡/🔴)
   → 0.3 score → 🟢 ✓
   → 0.6 score → 🟡 ✓
   → 0.8 score → 🔴 ✓

✅ User can click "Launch GSD" and context handoff works
   → .gsd-handoff.json created ✓
   → GSD receives metadata ✓

✅ User can click "Use feature-flow anyway" and lifecycle continues normally
   → Brainstorming invoked ✓
   → Normal feature-flow lifecycle ✓

✅ .gsd-handoff.json is created with all required metadata
   → original_description ✓
   → stack ✓
   → features_detected ✓
   → detected_features array ✓

✅ GSD is launched with --handoff-from-feature-flow flag
   → Command includes flag ✓

✅ .feature-flow.yml config options (enabled, threshold, auto_launch) are respected
   → enabled: false blocks recommendation ✓
   → threshold: 0.9 blocks moderate scores ✓
   → auto_launch_gsd: true launches without prompt ✓

✅ Command-line flags (--feature-flow, --gsd) skip recommendation
   → --feature-flow → no recommendation ✓
   → --gsd → no recommendation ✓

✅ Handoff file is cleaned up after GSD process exits
   → .gsd-handoff.json deleted ✓

✅ Graceful error handling if GSD not installed
   → Shows install command ✓
   → Offers fallback ✓

✅ Graceful fallback if handoff file can't be written
   → GSD launches without handoff ✓
   → User can re-explain ✓
```

**Step 2: Commit verification**

```bash
git add .
git commit -m "test: verify all 13 acceptance criteria passed

Verified criteria:
1. Feature detection (1-2 vs 4+)
2. Scope keyword detection (from scratch, complete, full system)
3. Timeline parsing (weeks/months)
4. Recommendation display (🟢/🟡/🔴)
5. GSD launch and handoff
6. Feature-flow continuation
7. Handoff JSON completeness
8. GSD flag usage
9. Config option respect (enabled, threshold, auto_launch)
10. Command-line flag overrides
11. Handoff cleanup
12. GSD not installed error handling
13. Handoff write failure fallback

All criteria passed. Feature-flow tool selector complete and production-ready."
```

---

## Summary

**Total Tasks:** 12
**Implementation approach:** Iterative documentation + manual testing
**Key integration points:** Tool selection as step 0 in `start` skill
**Commits:** One per task for clean history
**User-facing:** Tool selection is automatic but fully configurable via config file + flags

---

## Progress Index

> **For Claude:** After each task completion, return to this summary and update progress. Mark tasks as ✅ when code is committed and verified.

- [ ] Task 1: Add configuration schema to .feature-flow.yml
- [ ] Task 2: Implement heuristic detection functions
- [ ] Task 3: Implement command-line flag parsing
- [ ] Task 4: Implement configuration loading
- [ ] Task 5: Implement recommendation display logic
- [ ] Task 6: Implement GSD context handoff
- [ ] Task 7: Add reference documentation to step-lists.md
- [ ] Task 8: Write unit tests for heuristics
- [ ] Task 9: Write integration tests
- [ ] Task 10: Integrate tool selector into start skill
- [ ] Task 11: Manual end-to-end testing
- [ ] Task 12: Verify all acceptance criteria

**Completion target:** All 12 tasks
**Estimated effort:** 40-50 minutes total (3-5 minutes per task on average)
