# Model Detection Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the passive "Session Model Recommendation" announcement with an active model detection gate that prompts Opus users to switch to Sonnet.

**Architecture:** Modify a single section of `skills/start/SKILL.md` (lines 170–184) to add model detection logic, an `AskUserQuestion` prompt for Opus users, and graceful fallback when detection fails. Follow existing YOLO/Express behavior patterns.

**Tech Stack:** Markdown (SKILL.md skill definition file)

---

### Task 1: Replace the Session Model Recommendation section with model detection gate

**Files:**
- Modify: `skills/start/SKILL.md:170-184`

**Step 1: Read the current section**

Read `skills/start/SKILL.md` lines 170–184 to confirm the exact text of the current "Session Model Recommendation" section.

**Step 2: Output change plan**

The current section (lines 170–184) contains:
- A `**Session Model Recommendation:**` heading
- A paragraph explaining Sonnet-first routing
- A numbered list with an announcement code block
- An informational-only note
- A YOLO behavior line

Replace the entire section with a new version that:
1. Keeps the `**Session Model Recommendation:**` heading
2. Adds **Model Detection** as step 1 — parse the system prompt for model ID containing `opus`
3. Adds **Opus detected → AskUserQuestion gate** as step 2 — prompt to switch with cost savings info
4. Adds **User selects "Yes"** handling as step 3 — instruct `/model sonnet`, pause
5. Adds **User selects "No"** handling as step 4 — proceed without further prompts
6. Adds **Already on Sonnet/Haiku** handling as step 5 — announce, no prompt
7. Adds **Detection failure fallback** as step 6 — fall back to informational announcement
8. Replaces YOLO behavior line with: skip prompt, announce detection result
9. Adds Express behavior line: same as Interactive (show prompt, model switch requires user action)

**Step 3: Write the edit**

Use `Edit` to replace lines 170–184 with the new section. The replacement text:

```markdown
**Session Model Recommendation:**

After detecting the base branch, detect the current model and recommend Sonnet-first routing. The lifecycle's mechanical phases (implementation, review, verification, git operations) do not require Opus-level reasoning — Sonnet handles them equally well at significantly lower cost (see Model Routing Defaults for figures).

1. **Detect model:** The system prompt contains `"You are powered by the model named X. The exact model ID is Y"`. Check if the model ID contains `opus`.

2. **If Opus detected**, use `AskUserQuestion`:
   - Question: `"You're on Opus. Sonnet-first routing saves ~70% with no quality loss on mechanical phases. Switch?"`
   - Option 1: `"Yes — I'll run /model sonnet"` with description: `"*Recommended — estimated ~70% cost reduction for lifecycle phases that don't need Opus reasoning*"`
   - Option 2: `"No — stay on Opus"` with description: `"Opus for all phases. Higher cost but maximum reasoning quality throughout."`

3. **If user selects "Yes"** — instruct: `"Run '/model sonnet' now, then type 'continue' to resume the lifecycle."` Pause until the user's next message (which confirms the switch happened). On resume, announce: `"Model switched. Continuing lifecycle on Sonnet."` Then proceed.

4. **If user selects "No"** — announce: `"Staying on Opus. No further model prompts."` Proceed without further model-related prompts for the remainder of the lifecycle.

5. **If already on Sonnet/Haiku** — no prompt needed. Announce: `"Model check: running on [model] — Sonnet-first routing active."`

6. **If model detection fails** (model ID string not found in system prompt) — fall back to the informational announcement:
   ```
   Model routing: Sonnet-first is recommended for this lifecycle.
   - Brainstorming and design phases benefit from Opus (deep reasoning)
   - Implementation, review, and verification phases run well on Sonnet
   - All subagent dispatches set explicit model parameters (see Model Routing Defaults)
   If you're on Opus, consider `/model sonnet` — the skill will suggest `/model opus` before phases that benefit from it.
   ```

**YOLO behavior:** Skip the prompt (YOLO users opted into unattended execution). Detect the model and announce: `YOLO: start — Model detection → [model ID] (Sonnet-first recommended, no gate in YOLO mode)`

**Express behavior:** Same as Interactive — show the `AskUserQuestion` prompt. Express auto-selects decisions but model switching requires user action (`/model` command), so it must pause.
```

**Step 4: Verify the edit**

Read lines 170–210 of `skills/start/SKILL.md` to confirm:
- The new section starts with `**Session Model Recommendation:**`
- All 6 numbered items are present
- YOLO and Express behavior lines are at the end
- The next section (`### Step 1: Determine Scope`) follows immediately after

**Step 5: Commit**

```bash
git add skills/start/SKILL.md
git commit -m "feat(start): replace informational model recommendation with active detection gate

Detects current model from system prompt and prompts Opus users to switch
to Sonnet with ~70% cost savings. Falls back to informational announcement
if detection fails. YOLO skips the prompt; Express shows it.

Related: #105"
```

**Acceptance Criteria:**
- [ ] The `**Session Model Recommendation:**` section in `skills/start/SKILL.md` contains model detection logic (step 1: detect model ID containing `opus`)
- [ ] An `AskUserQuestion` gate is defined for Opus users with two options: "Yes — I'll run /model sonnet" and "No — stay on Opus"
- [ ] "Yes" handling instructs the user to run `/model sonnet` and pauses until next message
- [ ] "No" handling announces staying on Opus and suppresses further model prompts
- [ ] Sonnet/Haiku detection announces model check with no prompt
- [ ] Detection failure falls back to the original informational announcement block
- [ ] YOLO behavior skips the prompt and announces model detection result
- [ ] Express behavior shows the AskUserQuestion prompt (same as Interactive)
- [ ] The section immediately follows the `**Base Branch Detection:**` section's YOLO behavior line
- [ ] The `### Step 1: Determine Scope` heading follows immediately after the new section

**Quality Constraints:**
- Error handling: graceful fallback if model detection fails (step 6)
- Pattern reference: follow existing YOLO/Express behavior patterns — match style of "Version drift check" YOLO line (line 117) and "Base Branch Detection" YOLO line (line 168)
- Files modified: `skills/start/SKILL.md` (design-first — 900+ lines)
- Design-first files: `skills/start/SKILL.md` — implementer must output change plan before editing
