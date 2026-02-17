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

### Step 2: Design Minimal Experiments

For each selected assumption, design the smallest possible test that confirms or denies it. Prefer experiments that:
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

### Step 5: Clean Up

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
