---
name: handoff
description: Compact the current conversation into a handoff document for another agent to continue the work. Use when the user explicitly invokes $handoff and optionally describes the next session's focus.
---

Write a handoff document summarizing the current conversation so a fresh agent can continue the work. Save it to the temporary directory of the user's operating system, not the current workspace.

Include a "suggested skills" section that identifies skills the next agent should invoke.

Do not duplicate content already captured in other artifacts such as specifications, plans, ADRs, issues, commits, or diffs. Reference those artifacts by path or URL instead.

Redact sensitive information such as API keys, passwords, tokens, and personally identifiable information.

If the user passes arguments, treat them as the next session's intended focus and tailor the handoff document accordingly.
