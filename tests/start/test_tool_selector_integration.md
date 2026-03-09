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
