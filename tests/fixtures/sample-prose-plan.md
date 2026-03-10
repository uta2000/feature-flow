# Sample Prose Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Setup — STATUS: pending
Task 2: Implementation — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.

**Goal:** Minimal prose plan fixture for testing backward compatibility.

---

### Task 1: Setup

**Acceptance Criteria:**
- [ ] Configuration file exists measured by file existence verified by `ls config.yml`
- [ ] [MANUAL] Setup completes without errors

**Quality Constraints:**
- Error handling: N/A
- Parallelizable: yes

**Files:**
- Create: `config.yml`

**Steps:**
1. Create config file
2. Verify it exists

---

### Task 2: Implementation

**Acceptance Criteria:**
- [ ] Feature function is exported measured by export presence verified by `grep -q 'export' src/feature.ts`

**Quality Constraints:**
- Error handling: typed errors
- Parallelizable: no

**Files:**
- Create: `src/feature.ts`

**Steps:**
1. Write the implementation
2. Verify exports
