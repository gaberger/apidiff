# ADR-2604141400: Brain Queue Evidence Guard & Swarm Lease

## Status

- **§1 Brain Queue Evidence Guard**: Accepted
- **§2 Swarm Lease Coordination**: Proposed

## Date
2026-04-14

## Authors
Gary Berger

## Context

The `hex brain` daemon manages an autonomous task queue (`hex brain enqueue`) that drains work items — workplans, shell commands, and hex commands — without human intervention. Two problems have emerged:

1. **No proof of completion.** `hex brain` marks tasks complete when an agent reports success, but agents can report success without producing a meaningful artifact. The swarm evaluation on 2026-04-14 found cases where agents completed tasks that left no git evidence — no commit, no file change, no test result. Without an evidence requirement, the queue becomes an audit theater: tasks drain to "done" with nothing to show.

2. **Concurrent agents, same task.** When multiple swarm agents are active, nothing prevents two agents from dequeuing and working on the same task simultaneously. This leads to conflicting edits, wasted compute, and merge conflicts in worktrees.

§1 addresses problem 1 (evidence guard) and is ready for adoption. §2 addresses problem 2 (swarm lease) and requires further design.

## Decision

### §1 Brain Queue Evidence Guard (Accepted)

Every task completion in the brain queue MUST include verifiable evidence. The evidence type depends on the task kind:

| Task kind | Required evidence | Validation |
|-----------|------------------|------------|
| `workplan` | Git commit hash | `git cat-file -t <hash>` returns `commit` |
| `hex-command` | Command exit code + stdout digest | Exit code 0; stdout hash stored |
| `shell` | Git commit hash OR explicit `--no-artifact` with justification | Commit verified or justification logged |

**Rules:**

1. `mcp__ruflo__task_complete` and `hex brain complete` MUST reject calls that omit evidence fields.
2. `echo FIXME` / `echo TODO` stub tasks are rejected at enqueue time (enforced in CLAUDE.md, now also enforced at the CLI level).
3. Evidence is stored alongside the task record for audit. `hex brain queue list --evidence` shows completion proof per task.
4. Reconciliation (`hex plan reconcile --all --update`) cross-references task evidence against `git log` and flags orphaned completions (evidence hash not found in any branch).

**Why this is sufficient for P1:** The evidence guard is a local invariant — each task validates its own completion. It requires no coordination between agents and can be enforced by the brain daemon unilaterally.

### §2 Swarm Lease Coordination (Proposed)

When multiple agents run concurrently, each agent must acquire an exclusive lease on a task before beginning work. Design sketch:

- Lease acquisition: `hex brain lease <task-id> --agent <agent-id> --ttl 300`
- Lease renewal: automatic via agent heartbeat
- Lease expiry: if an agent crashes or goes silent, the lease expires and the task returns to the queue
- Conflict resolution: first-write-wins; second agent receives a rejection and must pick a different task

**Open questions (why this remains Proposed):**

1. Should leases be persisted in SpacetimeDB or in the local filesystem?
2. What is the correct TTL for different task kinds? Workplans may run for 30+ minutes; shell tasks complete in seconds.
3. How does lease state interact with worktree isolation? Should leasing a task auto-create a worktree?
4. Failure mode: if an agent loses its lease mid-edit, should its worktree be preserved or discarded?

These questions require prototyping and evaluation before the design can be accepted.

## Consequences

### §1 (Accepted)

- **Positive:** Every completed task has an auditable artifact. `hex brain queue list` becomes a reliable project changelog.
- **Positive:** Eliminates stub-task drain — agents must produce real output to close tasks.
- **Negative:** Tasks that genuinely produce no artifact (e.g., validation-only checks) need the `--no-artifact` escape hatch, which could be misused. Mitigated by requiring a justification string.
- **Migration:** Existing task-completion call sites (CLAUDE.md guidance, workplan reconciliation) must pass evidence. Non-breaking: calls without evidence will fail loudly rather than silently succeed.

### §2 (Proposed — consequences are preliminary)

- **Positive:** Eliminates duplicate work and merge conflicts in concurrent swarms.
- **Negative:** Adds coordination overhead; single-agent sessions pay a lease cost for no benefit.
- **Open:** Performance and complexity depend on persistence backend choice.
