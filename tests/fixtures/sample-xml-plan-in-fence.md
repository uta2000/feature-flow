# XML Plan Example — Prose Plan With Embedded XML Example

This document is itself a prose plan. It embeds an XML example inside a
code fence to demonstrate the format — the fenced tag must NOT trigger
XML mode detection.

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: Document the XML format — STATUS: pending
CURRENT: none
-->

> **For Claude:** After compaction, read only the PROGRESS INDEX to determine current task.

**Goal:** Minimal fixture to test code-fence skip in the detection algorithm.

---

### Task 1: Document the XML format

**Acceptance Criteria:**
- [ ] Documentation file exists measured by file existence verified by `ls docs/xml-format.md`

**Quality Constraints:**
- Error handling: N/A
- Parallelizable: yes

**Files:**
- Create: `docs/xml-format.md`

**Steps:**
1. The following fenced block contains `<plan version="1.0">` — detection must skip it:

   ```xml
   <plan version="1.0">
     <task id="1" status="pending">
       <title>Example task</title>
     </task>
   </plan>
   ```

2. Because the above is inside a code fence, this file parses as prose.
