# Dispatcher Label Setup Documentation — Design Document

**Date:** 2026-02-22
**Status:** Draft
**Issue:** #74

## Overview

Add a Setup subsection to the GitHub Issue Dispatcher section of the README that documents the requirement to create the `dispatcher-ready` label before running the dispatcher. This prevents users from encountering an empty issue list and provides the exact command needed to create the label.

## Example

The new Setup subsection will appear in the README as:

```markdown
### Setup

Before running the dispatcher, create the label it uses to find issues:

```bash
gh label create dispatcher-ready --color E99695 --description "Ready for automated feature-flow processing"
```

The dispatcher filters issues by this label. You can customize the label name via the `default_label` field in `dispatcher.yml`.
```

## User Flow

### Step 1 — User reads dispatcher documentation
The user navigates to the GitHub Issue Dispatcher section in the README to learn how to use the dispatcher.

### Step 2 — User sees Setup subsection
Between Requirements and Installation, the user encounters the new Setup subsection explaining they need to create a label first.

### Step 3 — User creates the label
The user copies and runs the `gh label create` command to create the `dispatcher-ready` label in their repository.

### Step 4 — User proceeds with installation
With the label created, the user continues to the Installation subsection and sets up the dispatcher.

### Step 5 — User successfully runs dispatcher
When the user runs the dispatcher, it finds issues with the `dispatcher-ready` label instead of showing "No open issues with label 'dispatcher-ready' found."

## Scope

**Included:**
- New Setup subsection in the GitHub Issue Dispatcher section
- Command to create the default `dispatcher-ready` label
- Brief explanation of why the label is needed
- Note about customizing the label name via config

**Excluded:**
- Modifications to dispatcher code (no auto-creation of labels)
- Changes to other sections of the README
- Updates to the dispatcher's error messages
- Documentation of other dispatcher configuration options