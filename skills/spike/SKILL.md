---
name: spike
description: This skill should be used when the user asks to "run a spike", "test an assumption", "do a proof of concept", "de-risk", "validate an API", "check if X works", "prototype", "build a PoC", or when a design document contains risky technical unknowns that need validation before committing to implementation.
tools: Read, Glob, Grep, Bash, Write, Edit, WebFetch, WebSearch, AskUserQuestion
---

# Spike / Proof of Concept

Run time-boxed technical experiments to de-risk unknowns before committing to a design or implementation plan. A spike answers the question: "Will this actually work?"

**Announce at start:** "Running spike to validate technical assumptions before committing to the design."

## When to Use

- Before writing a design document, when technical feasibility is uncertain
- After brainstorming, when the approach depends on an unverified assumption
- When a design document references an external API, library feature, or integration pattern that has not been tested
- When the user explicitly asks to validate something

**Project context:** Check for `.spec-driven.yml` in the project root. If found, load the `stack` entries and check for matching stack-specific assumption patterns at `../../references/stacks/{name}.md`. Each stack file includes a "Risky Assumptions (for Spike)" section with common assumptions and how to test them.

**Documentation context:** If `.spec-driven.yml` has a `context7` field, query relevant Context7 libraries before designing experiments. Current documentation often reveals known limitations, deprecated APIs, or undocumented behaviors that inform what to test. For example, querying Context7 for "Supabase bulk insert limits" before spiking a batch data import can surface rate limits or payload size constraints documented in the official guides.

## When to Skip

- The feature uses only well-understood, previously tested patterns in the codebase
- All external APIs and libraries are already integrated and used in the same way
- The unknowns are about UX or product decisions, not technical feasibility

## Process

### Step 1: Identify Assumptions

Examine the context — either a design document, brainstorming output, or user description — and extract every technical assumption that could fail.

Common categories of risky assumptions:
- **External API behavior:** "Gemini can return 100 structured JSON items reliably"
- **Library capabilities:** "The installed version of cmdk supports freeform input mode"
- **Performance:** "Bulk WHOIS endpoint can handle 500 domains in under 30 seconds"
- **Data format:** "The API returns expiration dates in ISO 8601 format"
- **Rate limits:** "The free tier allows 100 requests per minute"
- **Integration:** "These two libraries work together without conflicts"

Present the list to the user:

```
I identified these technical assumptions that could block implementation:

1. [assumption] — Risk: [what happens if wrong]
2. [assumption] — Risk: [what happens if wrong]
3. [assumption] — Risk: [what happens if wrong]

Which ones should I validate? (Recommend: [highest risk items])
```

Use `AskUserQuestion` to confirm which assumptions to test.

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Test all identified assumptions and announce: `YOLO: spike — Assumptions to test → All ([N] assumptions)`

### Step 1b: Check Documentation First

Before designing experiments, check if existing documentation already answers the question:

1. If `.spec-driven.yml` has a `context7` field, query relevant Context7 libraries for the assumptions being tested
2. Check stack reference files at `../../references/stacks/{name}.md` for known gotchas related to the assumptions
3. If documentation clearly confirms or denies an assumption with evidence (code examples, explicit limits), mark it as CONFIRMED_BY_DOCS or DENIED_BY_DOCS — no experiment needed
4. If documentation is ambiguous or missing, proceed to experiment

This step avoids spending time testing things that are already documented. But documentation alone is not sufficient for performance claims or version-specific behavior — those still need experiments.

### Step 2: Design Minimal Experiments

For each selected assumption that was not resolved by documentation, design the smallest possible test that confirms or denies it. Prefer experiments that:
- Run in under 2 minutes
- Require no setup beyond what exists in the project
- Produce clear pass/fail evidence
- Do not modify production code or data

**Experiment types:**

| Assumption Type | Experiment |
|----------------|------------|
| API behavior | Write a standalone script that calls the API and logs the response |
| Library feature | Write a minimal code snippet that exercises the feature |
| Performance | Run a timed test with realistic data volume |
| Rate limits | Check API documentation, then make a burst of test calls |
| Data format | Fetch a sample response and inspect the structure |
| Compatibility | Install/import both libraries and test the integration point |

Place spike scripts in a temporary location: `scripts/spike-*.{ts,mjs,py,sh}` (or similar). These are throwaway — they validate, then get deleted.

### Step 3: Run Experiments

Execute each experiment and record results. For each:

1. **State the hypothesis:** "Gemini returns valid JSON with 100 items"
2. **Run the experiment:** Execute the script or API call
3. **Record the evidence:** Actual output, timing, error messages
4. **Verdict:** CONFIRMED or DENIED

If an experiment requires an API key or credential that is not available, mark it as CANNOT_TEST and explain what would be needed.

### Step 4: Report Findings

Present a clear summary:

```
## Spike Results

| # | Assumption | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | [assumption] | CONFIRMED | [what was observed] |
| 2 | [assumption] | DENIED | [what went wrong] |
| 3 | [assumption] | CANNOT_TEST | [what's missing] |

### Impact on Design

- [assumption 1]: Confirmed. Design can proceed as-is.
- [assumption 2]: Denied. Alternative approach needed: [suggestion].
- [assumption 3]: Cannot test without [requirement]. Proceed with caution or obtain access first.

### Recommended Changes to Design
[If any assumptions were denied, describe what needs to change]
```

### Step 5: Write Back Gotchas

Review all DENIED assumptions. Identify any that represent **reusable project-specific pitfalls** — discoveries that future features would likely hit again.

**What qualifies as a gotcha:**
- An API that behaves differently than documented or commonly assumed (e.g., "WhoisFreaks bulk endpoint uses a separate RPM bucket from single-domain endpoint")
- A library limitation that isn't obvious (e.g., "cmdk v0.2 does not support freeform input — upgrade to v1.0+ required")
- A performance constraint discovered through testing (e.g., "Gemini structured output caps at ~50 items reliably, not 100")

If any qualifying gotchas are found, present them:

```
These spike findings could prevent future bugs if added to your project gotchas:

1. "[specific gotcha phrased as a warning]"

Add to .spec-driven.yml?
```

Use `AskUserQuestion` with options: "Add", "Skip".

**YOLO behavior:** If `yolo: true` is in the skill's `ARGUMENTS`, skip this question. Auto-select "Add" and announce: `YOLO: spike — Add gotcha → Added`

If approved, append to the `gotchas` list in `.spec-driven.yml`. If the file doesn't exist, create it first using auto-detection (see `../../references/auto-discovery.md`).

### Step 6: Clean Up

Delete any spike scripts created during the experiment. These are throwaway artifacts, not production code.

If the user wants to keep any scripts for reference, move them to `docs/spikes/` instead.

## Quality Rules

- **Minimal:** Test only what is unknown. Do not build prototypes of features.
- **Time-boxed:** Each experiment should take under 2 minutes. If it takes longer, the experiment is too complex — simplify it.
- **Non-destructive:** Never modify production data, schemas, or deployed services.
- **Evidence-based:** Every verdict must include concrete evidence (output, timing, error message), not opinions.
- **Honest:** If the result is ambiguous, say so. Do not round up to CONFIRMED.

## Additional Resources

### Reference Files

For detailed guidance on identifying risky assumptions across different domains:
- **`references/assumption-patterns.md`** — Common risky assumptions by category (APIs, databases, performance, libraries, integrations)

For stack-specific risky assumptions:
- **`../../references/stacks/`** — Each stack file (supabase, next-js, react-native, vercel) includes a "Risky Assumptions (for Spike)" section with stack-specific assumptions and testing approaches
