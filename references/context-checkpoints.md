# Context Checkpoint Recovery

This reference file contains the checkpoint output format and post-compaction recovery procedure. It is referenced by the Context Window Checkpoints section in `skills/start/SKILL.md`.

## Checkpoint Format

```
--- Context Checkpoint ---
[Phase name] complete. Consider running:
/compact focus on [context-specific focus hint]
Or type "continue" to skip compaction and proceed.
```

## Handling the Response

When the user responds after a checkpoint:
- If the user types "continue", "skip", "next", or "proceed" → resume the lifecycle at the next step
- If the user ran `/compact` and then sends any message → the context has been compressed. Check the todo list (via `TaskList` if available, or from the last printed checklist) to determine the current lifecycle step.
  - **If the current lifecycle step is "Implement":** Read only lines 1-30 of the implementation plan file (saved to `docs/plans/` by `superpowers:writing-plans`, the PROGRESS INDEX block) to determine which task is current. Parse the `CURRENT: Task N` field. Then read only the full Task N section from the implementation plan file for implementation details. Announce: "Resuming implementation. Reading progress index... CURRENT: Task [N]. Loading Task [N] details."
    - **If `CURRENT: none` in the index (between tasks):** Start from the first task with STATUS: `pending`. Announce: "Resuming implementation. CURRENT: none — starting from first pending task." If no pending tasks remain, announce: "Resuming implementation. CURRENT: none — all tasks appear complete. Verify with the user before proceeding."
    - **If no PROGRESS INDEX found in lines 1-30:** Fall back to reading the full implementation plan file to determine which task to resume. Announce: "Resuming implementation. No progress index found — reading full plan to determine current task."
    - **If `CURRENT: Task N` but Task N is not found in the plan body:** Fall back to reading the full implementation plan file. Announce: "Resuming implementation. Task [N] not found in plan — reading full plan to determine current task."
  - **Otherwise (any other lifecycle step):** Announce: "Resuming lifecycle. Last completed step: [N]. Next: [N+1] — [name]."
- Any other response → treat as "continue" and resume
