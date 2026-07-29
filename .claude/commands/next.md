---
description: Pull the next Linear issue and set up the workflow for it
argument-hint: [SOU-XX] (optional — omit to auto-pick)
---
## 1. Select the issue
If $1 is provided, fetch that issue via Linear MCP.
Otherwise query the "Centre Soutien — MVP" project for issues that are:
- state: Todo or Backlog
- no stage:* label
- not blocked by an unfinished issue (check relations)
- sorted by priority (1=Urgent first), then by epic order
Show me the top 3 with title, priority, epic, and estimate. Ask me to 
confirm which one to start. Wait for my answer.

## 2. Analyze the issue
For the confirmed issue, read its description, acceptance criteria, 
parent epic, and all comments. Then tell me:
- Does it need domain work, frontend work, or both?
- Which skills apply (sync-hub-protocol, migration-authoring, 
  multi-center-tenancy...)?
- Any ambiguity in the acceptance criteria I should resolve BEFORE 
  agents start (list open questions).

## 3. Set up the workspace
Once I confirm the plan:
- If domain work: `git worktree add ../cs-backend -b feature/SOU-XX-domain` 
  (skip if the worktree exists; reuse it with a new branch)
- If frontend work: same with ../cs-frontend and feature/SOU-XX-ui
- Move the issue: state → In Progress, add label stage:building
- Post a [KICKOFF] comment on the issue summarizing the plan, the 
  branches created, and which agent starts first.

## 4. Hand me the commands
Print exactly what I should run next, e.g.:
  Terminal 1: cd ../cs-backend && claude → /build SOU-XX domain
  Terminal 2 (after types published): cd ../cs-frontend && claude → /build SOU-XX frontend