# Dispatcher Label Setup Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Setup subsection to README documenting the need to create dispatcher-ready label

**Architecture:** Insert new subsection between Requirements and Installation in the GitHub Issue Dispatcher section

**Tech Stack:** Markdown documentation

---

### Task 1: Add Setup Documentation to README

**Files:**
- Modify: `README.md:358-363`

**Acceptance Criteria:**
- [ ] Setup subsection appears between Requirements (line 358) and Installation (line 363)
- [ ] Section includes the `gh label create` command with color and description
- [ ] Section explains why the label is needed
- [ ] Section notes that the label name is customizable

**Step 1: Write failing test by checking current state**

Run:
```bash
grep -A 5 "## Requirements" README.md | grep -c "### Setup"
```
Expected: 0 (no Setup section exists)

**Step 2: Locate insertion point**

Run:
```bash
grep -n "## Requirements\|## Installation" README.md | head -4
```
Expected: Line numbers showing Requirements and Installation sections

**Step 3: Add Setup subsection**

Insert after line 358 (after Requirements section):

```markdown

### Setup

Before running the dispatcher, create the label it uses to find issues:

```bash
gh label create dispatcher-ready --color E99695 --description "Ready for automated feature-flow processing"
```

The dispatcher filters issues by this label. You can customize the label name via the `default_label` field in `dispatcher.yml`.
```

**Step 4: Verify the section was added correctly**

Run:
```bash
grep -A 8 "### Setup" README.md
```
Expected: Shows the newly added Setup section with all content

**Step 5: Verify section placement**

Run:
```bash
awk '/## Requirements/{p=1} p&&/### Setup/{found=1} p&&/## Installation/&&found{print "Setup section correctly placed"; exit} END{if(!found) print "Setup section NOT found between Requirements and Installation"}' README.md
```
Expected: "Setup section correctly placed"

**Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add dispatcher label setup instructions to README

- Add Setup subsection explaining need to create dispatcher-ready label
- Include gh label create command with recommended color/description
- Note that label name is customizable via dispatcher.yml config
- Closes #74"
```