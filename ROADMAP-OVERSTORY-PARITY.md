# Fleet Command → Overstory Parity Roadmap

> Detailed implementation plan to close all gaps between Fleet Command and Overstory's
> multi-agent orchestration system. Each task includes exact file locations, what to add,
> and acceptance criteria.

---

## Phase 1: Hierarchy Enforcement & Spawn Safety ✅ COMPLETE

**Goal:** Make the agent spawn system safe and controlled — prevent duplicate work, enforce
the coordinator→lead→worker chain, and stop resource contention.

**Priority:** CRITICAL — Without this, the system cannot orchestrate reliably at scale.

**Estimated scope:** ~600 lines of new code across 4 files.

**Status:** All 7 tasks implemented.

---

### 1.1 Add `canSpawn` and `constraints` Fields to Agent Definitions

**Why:** Overstory's agent-manifest.json has `canSpawn: boolean` and `constraints: string[]`
per capability. Fleet Command's `agent_definitions` table has neither, so any agent can
theoretically spawn children and there's no manifest-level read-only enforcement.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/db/database.ts` | Add migration: `ALTER TABLE agent_definitions ADD COLUMN can_spawn INTEGER NOT NULL DEFAULT 0` and `ALTER TABLE agent_definitions ADD COLUMN constraints TEXT` |
| `src/main/db/database.ts` | Update seed data: coordinator(`can_spawn=1, constraints='["read-only","no-worktree"]'`), lead(`can_spawn=1, constraints='[]'`), scout(`can_spawn=0, constraints='["read-only"]'`), builder(`can_spawn=0, constraints='[]'`), reviewer(`can_spawn=0, constraints='["read-only"]'`), merger(`can_spawn=0, constraints='[]'`), monitor(`can_spawn=0, constraints='["read-only","no-worktree"]'`) |
| `src/shared/types/index.ts` | Add `can_spawn: boolean` and `constraints: string | null` to AgentDefinition interface |
| `src/renderer/pages/AgentDefinitionsPage/AgentDefinitionsPage.tsx` | Show `canSpawn` toggle and `constraints` chips in the definition editor UI |

**Acceptance criteria:**
- [x] Database migration adds columns without data loss
- [x] Seed data matches Overstory's agent-manifest.json permissions
- [x] UI displays and allows editing canSpawn and constraints

---

### 1.2 Implement `validateHierarchy()` in Spawn Handler

**Why:** Overstory throws `HierarchyError` if coordinator tries to spawn non-leads. Fleet
Command has zero hierarchy validation — any capability can be spawned by anyone.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (line ~400) | Add `validateHierarchy()` function before spawn execution. Logic: (1) If `parent_agent` is null or is a coordinator → only allow `lead` capability (and optionally `scout`, `builder` for direct dispatch). (2) If parent is a `lead` → allow `scout`, `builder`, `reviewer`, `merger`. (3) If parent is a worker (scout/builder/reviewer/merger) → REJECT (canSpawn=false). (4) Look up parent's capability from sessions table. (5) Look up `can_spawn` from agent_definitions table. |
| `src/shared/types/index.ts` | Add `HierarchyError` type: `{ code: 'HIERARCHY_VIOLATION'; message: string; parentCapability: string; requestedCapability: string }` |
| `src/renderer/pages/CommandCenterPage/components/SpawnDialog.tsx` | Filter capability dropdown based on parent's capability. If spawning from coordinator, only show "lead". If spawning from lead, show scout/builder/reviewer/merger. |

**Validation logic (pseudocode):**
```
function validateHierarchy(parentAgent, requestedCapability):
  if parentAgent is null:
    // Direct spawn from UI (treated as coordinator-level)
    if requestedCapability not in ['lead', 'coordinator']:
      throw HierarchyError("Root can only spawn leads or coordinator")
  else:
    parentSession = db.get("SELECT capability FROM sessions WHERE agent_name = ?", parentAgent)
    parentDef = db.get("SELECT can_spawn FROM agent_definitions WHERE role = ?", parentSession.capability)
    if !parentDef.can_spawn:
      throw HierarchyError("{parentCapability} agents cannot spawn children")
    if parentSession.capability === 'coordinator':
      if requestedCapability not in ['lead']:
        throw HierarchyError("Coordinator can only spawn leads")
    if parentSession.capability === 'lead':
      if requestedCapability not in ['scout', 'builder', 'reviewer', 'merger']:
        throw HierarchyError("Leads can only spawn scouts, builders, reviewers, mergers")
```

**Acceptance criteria:**
- [x] Spawning builder directly from coordinator returns error
- [x] Spawning from a scout (canSpawn=false) returns error
- [x] SpawnDialog only shows allowed capabilities based on parent
- [x] Error message includes parent capability and requested capability

---

### 1.3 Implement Task Locking (Prevent Duplicate Work)

**Why:** Overstory's `checkTaskLock()` prevents two agents from working the same task.
Overstory's `checkDuplicateLead()` prevents two leads on the same task. Fleet Command
has neither — spawning two builders on task-123 wastes tokens and creates conflicts.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (line ~400, in agent:spawn) | Before spawn, query: `SELECT agent_name, capability FROM sessions WHERE task_id = ? AND state IN ('booting', 'working')`. If any result exists: (a) If requested capability is `lead` and existing has a lead → REJECT "Duplicate lead on task {taskId}: {existingAgent} already assigned". (b) If any agent working same task → WARN in response (don't block builders on same task if scoped to different files, but block if file_scope overlaps). |
| `src/shared/types/index.ts` | Add `TaskLockError` type |

**Acceptance criteria:**
- [x] Spawning a second lead on the same task_id is blocked
- [x] Spawning a builder on a task already worked by another builder with overlapping file_scope is blocked
- [x] Warning returned (not block) if file_scopes don't overlap

---

### 1.4 Enforce Scope Overlap Blocking (Not Just Warning)

**Why:** Fleet Command's `scope:checkOverlap` handler detects overlapping file scopes but
only warns in the UI. Overstory blocks the spawn entirely.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (line ~400, in agent:spawn) | After task lock check, call existing overlap detection logic. If overlaps found with active agents → REJECT spawn with overlap details. |
| `src/renderer/pages/CommandCenterPage/components/SpawnDialog.tsx` | Change overlap warning from yellow info banner to red error that disables the Spawn button. Allow a "Force spawn (override)" checkbox for advanced users. |

**Acceptance criteria:**
- [x] Backend rejects spawn if file_scope overlaps with any active agent
- [x] UI shows which agents conflict and which paths overlap
- [x] Override checkbox allows bypassing (sets `force_overlap: true` in spawn options)

---

### 1.5 Add Spawn Stagger Delay

**Why:** Overstory has a configurable 2-second delay between spawns to prevent API rate
limits and thundering herd on git operations. Fleet Command spawns all agents instantly.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in agent:spawn) | Before process spawn, check last spawn time: `SELECT MAX(created_at) FROM sessions WHERE state IN ('booting', 'working')`. If < `staggerDelayMs` (default 2000ms from settings), `await sleep(remaining)`. |
| `src/main/db/database.ts` | Add `stagger_delay_ms` to app_settings defaults (value: 2000) |
| `src/renderer/pages/SettingsPage/SettingsPage.tsx` | Add "Spawn Stagger Delay (ms)" setting input |

**Acceptance criteria:**
- [x] Rapid sequential spawns are delayed by configured interval
- [x] Setting is configurable in Settings page
- [x] Delay is skipped if no recent spawns

---

### 1.6 Add Dispatch Overrides for Leads

**Why:** Overstory supports `--skip-scout`, `--skip-review`, `--max-agents` flags that get
injected into lead overlays. This lets coordinators tune lead behavior per-task.

**Files to modify:**

| File | Change |
|------|--------|
| `src/shared/types/index.ts` | Add to spawn options: `dispatch_overrides?: { skip_scout?: boolean; skip_review?: boolean; max_agents?: number }` |
| `src/main/ipc/handlers.ts` (overlay generation, line ~522) | If `dispatch_overrides` present and capability is `lead`, inject into CLAUDE.md: `## Dispatch Overrides\n- SKIP SCOUT: {yes/no}\n- SKIP REVIEW: {yes/no}\n- MAX AGENTS: {n}` |
| `src/renderer/pages/CommandCenterPage/components/SpawnDialog.tsx` | When capability is `lead`, show optional "Dispatch Overrides" collapsible section with: skip scout toggle, skip review toggle, max agents number input. |

**Acceptance criteria:**
- [x] Lead overlay includes dispatch overrides when specified
- [x] SpawnDialog only shows overrides section for lead capability
- [x] Coordinator's dispatch IPC can pass overrides

---

### 1.7 Auto-Dispatch Mailbox (Pre-Spawn Mail)

**Why:** Overstory writes a dispatch mail to the database BEFORE spawning the agent, so
the agent's first `UserPromptSubmit` hook injection has the task assignment immediately.
Fleet Command relies on overlay + prompt, which can miss if mail injection runs first.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in agent:spawn, after DB insert) | After session record created, before process spawn: `INSERT INTO messages (id, from_agent, to_agent, subject, body, type, priority, payload, read, created_at) VALUES (nanoid(), parentAgent ?? 'system', agentName, 'Dispatch: {taskId}', 'You have been assigned task {taskId} as a {capability}. Read your overlay and begin immediately.', 'dispatch', 'normal', JSON.stringify({taskId, specPath, fileScope}), 0, now())` |

**Acceptance criteria:**
- [x] New agent's first mail check returns the dispatch message
- [x] Dispatch message includes task_id, spec path, and file_scope

---

## Phase 2: Merge Pipeline Automation ✅ COMPLETE

**Goal:** Make merges fully autonomous — a merger agent (or automated backend) runs all 4
tiers without human intervention, runs quality gates, and notifies on completion.

**Priority:** CRITICAL — Manual tier-by-tier clicking defeats the purpose of multi-agent.

**Estimated scope:** ~800 lines of new code across 5 files.

**Status:** All 6 tasks implemented.

---

### 2.1 Add `merge:auto-escalate` IPC Handler

**Why:** Merge tiers exist individually but nothing chains them. User must manually click
each tier button. Overstory's merger agent runs Tier 1→2→3→4 automatically.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | Add new handler `merge:auto-escalate` that: (1) Accepts merge_queue entry ID and repo path. (2) Attempts Tier 1 (`mergeService.executeCleanMerge`). (3) If conflicts, attempts Tier 2 (`mergeService.autoResolveConflicts`). (4) If still conflicts, attempts Tier 3 (`mergeService.aiResolveConflicts`). (5) If still fails, attempts Tier 4 (`mergeService.reimagineFromScratch`). (6) Updates merge_queue status and resolved_tier at each step. (7) Returns final result. |
| `src/preload/index.ts` | Expose `mergeAutoEscalate: (id: number, repoPath: string) => Promise<...>` |
| `src/shared/types/index.ts` | Add to ElectronAPI interface |
| `src/renderer/pages/MergeQueuePage/MergeQueuePage.tsx` | Add "Auto Merge" button next to manual tier buttons. This calls `mergeAutoEscalate` and shows progress. |

**Implementation (pseudocode):**
```
async function autoEscalate(entryId, repoPath):
  entry = db.get(merge_queue, entryId)
  targetBranch = getTargetBranch()

  // Tier 1
  update status = 'merging'
  result = await mergeService.executeCleanMerge(repoPath, entry.branch_name, targetBranch)
  if result.success:
    return complete(entryId, 'clean-merge')

  // Tier 2
  result = await mergeService.autoResolveConflicts(repoPath, entry.branch_name, targetBranch)
  if result.success:
    return complete(entryId, 'auto-resolve')

  // Tier 3
  result = await mergeService.aiResolveConflicts(repoPath, entry.branch_name, targetBranch)
  if result.success:
    return complete(entryId, 'ai-resolve')

  // Tier 4
  result = await mergeService.reimagineFromScratch(repoPath, entry.branch_name, targetBranch, entry.task_id)
  if result.success:
    return complete(entryId, 'reimagine')

  // All tiers failed
  update status = 'failed'
  return { success: false, lastTierAttempted: 'reimagine' }
```

**Acceptance criteria:**
- [x] Single button click runs all 4 tiers sequentially
- [x] Each tier attempt is logged with result
- [x] Status updates visible in UI in real-time
- [x] Final result shows which tier resolved (or failure)

---

### 2.2 Add Quality Gate Execution After Merge

**Why:** Overstory requires quality gates (tests, lint, typecheck) to pass before marking
a merge as complete. Fleet Command marks merged without verification.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in `merge:complete` and in the new `merge:auto-escalate`) | After successful merge, before marking status='merged': (1) Query enabled quality gates: `SELECT * FROM quality_gates WHERE enabled = 1 ORDER BY sort_order`. (2) For each gate, run the command via child_process.exec in the repo directory. (3) Record results in `quality_gate_results` table. (4) If ANY gate fails: revert merge (rollback to pre_merge_commit), mark status='failed', include gate failure details. (5) Only mark 'merged' if all gates pass. |
| `src/main/services/mergeService.ts` | Add `runQualityGates(repoPath: string): Promise<{passed: boolean; results: GateResult[]}>` method |

**Acceptance criteria:**
- [x] Merge only marked 'merged' if all quality gates pass
- [x] Failed gate causes automatic rollback
- [x] Quality gate results recorded in quality_gate_results table
- [x] UI shows which gates passed/failed

---

### 2.3 Add Mail Notifications on Merge Events

**Why:** Overstory's merger agent sends `merged` or `merge_failed` protocol messages.
Fleet Command only notifies on enqueue, not on completion or failure.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | In `merge:complete` handler: Insert message `{type: 'merged', from_agent: 'merge-system', to_agent: entry.agent_name, subject: 'Merged: {branch}', body: 'Tier: {tier}. Tests: passing.', payload: JSON.stringify({branch, tier, taskId})}`. In `merge:fail` handler: Insert message `{type: 'merge_failed', from_agent: 'merge-system', to_agent: entry.agent_name, subject: 'Merge failed: {branch}', payload: JSON.stringify({branch, reason, conflictFiles})}`. In `merge:auto-escalate`: Send mail at each tier attempt for observability. |

**Acceptance criteria:**
- [x] Agent that requested merge receives `merged` or `merge_failed` mail
- [x] Coordinator receives notification on all merge completions
- [x] Mail includes tier used and any conflict details

---

### 2.4 Add Auto-Advance Queue After Merge

**Why:** After a merge completes, the next unblocked entry should be auto-fetched.
Currently nothing triggers the next merge.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in `merge:complete`) | After marking entry as 'merged': (1) Query `merge:next` logic to find next unblocked entry. (2) If found, send desktop notification "Next merge ready: {branch}". (3) Broadcast `merge:status-update` event to renderer. |
| `src/renderer/pages/MergeQueuePage/MergeQueuePage.tsx` | Listen for `merge:status-update` and auto-refresh the queue display. Show "Next up" indicator on the next unblocked entry. |

**Acceptance criteria:**
- [x] Completing a merge surfaces the next ready entry
- [x] Desktop notification for next-ready merge
- [x] UI auto-refreshes after merge completion

---

### 2.5 Add Issue Auto-Close After Merge

**Why:** Overstory closes linked issues only after successful merge. Fleet Command has
issue tracking but doesn't auto-close on merge.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in `merge:complete`) | After marking 'merged': (1) If `entry.task_id` is set, query issues table: `SELECT * FROM issues WHERE id = ? AND status != 'closed'`. (2) If found, update: `status='closed', close_summary='Merged via {tier}', closed_at=now()`. (3) Check if all issues in the same `group_id` are closed → if so, close the task_group too. |

**Acceptance criteria:**
- [x] Linked issue auto-closes on successful merge
- [x] Task group auto-completes when all member issues closed
- [x] Close summary includes merge tier

---

### 2.6 Define Merger Agent Role

**Why:** Overstory has a dedicated `merger.md` agent definition that autonomously handles
merges. This is the agent that runs in a worktree and executes the 4-tier pipeline.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/db/database.ts` | Ensure `merger` role exists in agent_definitions seed data with: `can_spawn=0`, `constraints='[]'`, `capabilities='["merge","resolve-conflicts"]'`, `default_model='sonnet'`, `tool_allowlist='["Read","Write","Edit","Glob","Grep","Bash"]'` |
| `.fleetcommand/agent-defs/merger.md` (NEW) | Create agent definition document describing the merger workflow: (1) Read overlay for branch assignment. (2) Execute tiers sequentially. (3) Run quality gates. (4) Send result mail. (5) Record expertise from conflict patterns. |
| `src/main/ipc/handlers.ts` (in coordinator dispatch) | When coordinator sends `merge_ready`, optionally auto-spawn a merger agent to handle it instead of requiring manual UI action. |

**Acceptance criteria:**
- [x] Merger agent can be spawned programmatically
- [x] Merger overlay includes branch name, task_id, target branch
- [x] Agent definition document describes full workflow

---

## Phase 3: Watchdog & Monitoring Hardening ✅ COMPLETE

**Goal:** Make the watchdog reliable for long-running orchestrations — exempt persistent
agents, detect decision gates, and improve activity detection.

**Priority:** HIGH — False positives kill autonomous runs.

**Estimated scope:** ~300 lines of changes in 1-2 files.

**Status:** All 6 tasks implemented.

---

### 3.1 Add Persistent Capability Exemption

**Why:** Coordinator and monitor agents spend most of their time idle, waiting for mail.
Current watchdog flags them as stalled after 5 minutes, which is wrong.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` (in `checkAgent()`, line ~291) | Before escalation calculation: (1) Look up agent's capability from sessions table. (2) Define `PERSISTENT_CAPABILITIES = new Set(['coordinator', 'monitor'])`. (3) If agent.capability is in PERSISTENT_CAPABILITIES: skip stale detection entirely, OR use a much higher threshold (e.g., 30min instead of 5min). (4) Log exemption for observability. |

**Acceptance criteria:**
- [x] Coordinator agent is never flagged as stalled while idle
- [x] Monitor agent is never flagged as stalled while idle
- [x] Other agents (builder, scout, etc.) still use normal thresholds
- [x] Exemption is logged in watchdog output

---

### 3.2 Add Decision Gate Detection Before Escalation

**Why:** If an agent sent a `decision_gate` message, it's deliberately pausing for human
input. Escalating it is incorrect.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` (in `handleEscalate()`, line ~549) | Before sending escalation mail: (1) Query messages table: `SELECT * FROM messages WHERE from_agent = ? AND type = 'decision_gate' AND created_at > datetime('now', '-1 hour')`. (2) If any unresolved decision gate found: skip escalation, log "Agent {name} is waiting on decision gate, skipping escalation". (3) Optionally send a different notification to human: "Agent {name} needs your decision". |

**Acceptance criteria:**
- [x] Agent waiting on decision gate is NOT nudged or escalated
- [x] Human receives notification about pending decision instead
- [x] Decision gate check only looks at recent messages (last hour)

---

### 3.3 Improve Activity Detection (Beyond Output Buffer)

**Why:** Current detection only checks if stdout buffer size/content changed. An agent
doing database queries, file reads, or waiting on network won't produce stdout, but is
still active.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` (in `detectActivity()`, line ~408) | Add multi-signal activity detection: (1) **Output buffer** (existing): check buffer size/content change. (2) **Event stream**: query `events` table for recent events from this agent: `SELECT COUNT(*) FROM events WHERE agent_name = ? AND created_at > datetime('now', '-5 minutes')`. If events found, agent is active. (3) **Mail sent**: query `messages` table: `SELECT COUNT(*) FROM messages WHERE from_agent = ? AND created_at > datetime('now', '-5 minutes')`. If agent sent mail recently, it's active. (4) Any signal = active. |

**Acceptance criteria:**
- [x] Agent that wrote to events table in last 5 min is considered active
- [x] Agent that sent mail in last 5 min is considered active
- [x] Agent that produced stdout is considered active (existing)
- [x] All three signals are OR'd together

---

### 3.4 Add Run Completion Detection

**Why:** When all workers in a run finish, the coordinator should be notified so it can
proceed to merging. Current watchdog doesn't detect run-level completion.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` (in `runCheck()`, after all agents checked) | After checking all agents: (1) Group sessions by `run_id`. (2) For each run_id where coordinator is active: count active workers (state in booting/working). (3) If active workers = 0 and total workers > 0: all workers done. (4) Send mail to coordinator: `{type: 'status', from_agent: 'watchdog', to_agent: coordinatorName, subject: 'All workers completed', body: 'Run {runId}: all {n} workers have finished.'}`. (5) Only send once per run (track in a Set). |

**Acceptance criteria:**
- [x] Coordinator receives mail when all workers in its run are completed
- [x] Notification only sent once per run
- [x] Works across multiple concurrent runs

---

### 3.5 Implement Forward-Only State Machine

**Why:** Overstory enforces forward-only state transitions with an "investigate" state for
conflicting signals. Fleet Command updates DB directly with no validation.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` | Add state transition validation function: `validTransitions = { booting: ['working', 'stalled'], working: ['completed', 'stalled'], stalled: ['working', 'zombie', 'completed'], zombie: ['completed'] }`. Before any state update, verify the transition is valid. If not valid (e.g., completed→working), log error and skip update. |
| `src/main/ipc/handlers.ts` | Use same validation in session state updates |

**Acceptance criteria:**
- [x] Invalid state transitions are rejected with log
- [x] booting→completed is valid (fast exit)
- [x] completed→working is rejected
- [x] zombie→working is rejected

---

### 3.6 Add Nudge Debounce

**Why:** Without debounce, rapid watchdog checks can send multiple nudges to the same
agent before it has time to respond.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/watchdogService.ts` (in `handleNudge()`) | Track `lastNudgeTime` per agent in the escalation state. Before nudging: if `Date.now() - lastNudgeTime < nudgeDebounceMs` (default 60000), skip. Update `lastNudgeTime` after successful nudge. |

**Acceptance criteria:**
- [x] Agent receives at most 1 nudge per minute
- [x] Debounce interval is configurable

---

## Phase 4: Hooks & Context Injection Completeness ✅ COMPLETE

**Goal:** Wire all 6 lifecycle hook types into the agent runtime, and make mail injection
work for ALL agents (not just coordinator).

**Priority:** HIGH — Without this, agents lose context and can't receive messages.

**Estimated scope:** ~400 lines across 3 files.

**Status:** All 5 tasks implemented.

---

### 4.1 Wire Real Mail Injection for All Agents via UserPromptSubmit

**Why:** Currently only the coordinator gets mail injected (via `startCoordinatorMailInjection`
which runs every 5 seconds). Other agents (leads, builders) get a placeholder hook that
echoes a message but doesn't actually check mail. This means leads can't coordinate their
builders via mail.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in agent:spawn, hook deployment section ~573) | Replace placeholder UserPromptSubmit hook with real mail injection: (1) The hook script should: query `messages WHERE to_agent = '{agent_name}' AND read = 0`, format as `[MAIL from={from} type={type}] {subject}: {body}`, mark as read. (2) Since hooks run as shell commands, create a lightweight CLI entry point OR use the existing IPC + a small node script. (3) Alternative approach: Start a mail injection interval for EVERY agent (not just coordinator) via `startAgentMailInjection(sessionId, agentName)`. Use a longer interval for non-coordinators (e.g., 10s vs 5s). |
| `src/main/services/agentProcessManager.ts` | Add `startMailInjection(agentId, agentName, intervalMs)` that polls unread mail and writes to pty stdin. Generalize the existing coordinator-only implementation. |

**Acceptance criteria:**
- [x] Lead agents receive mail from their builders
- [x] Builder agents receive dispatch/assign mail
- [x] Mail injection interval is configurable per capability
- [x] Messages are marked as read after injection

---

### 4.2 Implement PostToolUse Hook

**Why:** Overstory uses PostToolUse to auto-record expertise when agents commit code
(`mulch diff` on git commit) and to log tool completion times.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (hook deployment) | Add PostToolUse hook to `.claude/settings.local.json`: (1) Matcher: "Bash" (to detect git commits). (2) Script: Check if stdin contains `git commit` in the tool args. If yes, extract diff summary and record an expertise entry via IPC or direct DB call. (3) Also log tool-end event to events table. |
| `src/main/ipc/handlers.ts` | Add `expertise:auto-record` IPC handler that accepts `{agentName, domain, title, content, type, classification}` and inserts into expertise_records |

**Acceptance criteria:**
- [x] Agent committing code triggers expertise auto-recording
- [x] Tool completion events logged to events table
- [x] Recorded expertise includes domain inference from file paths

---

### 4.3 Implement Stop Hook

**Why:** Overstory uses the Stop hook to run `mulch learn` which synthesizes session
insights into expertise records before the agent exits.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (hook deployment) | Deploy Stop hook that: (1) Reads the agent's recent events/output. (2) Invokes a small summarization step (could be a quick Claude call or template-based). (3) Creates 1-3 expertise_records from the session's work. (4) Records session-end event. |
| Alternative simpler approach: | Instead of a shell hook, handle this in the `agent:stop` IPC handler and the onExit callback in agentProcessManager. When an agent exits: (1) Query its events. (2) Generate a session summary. (3) Insert expertise_records. |

**Acceptance criteria:**
- [x] Agent session end triggers expertise synthesis
- [x] At least 1 expertise record created per non-trivial session
- [x] Records include agent name, domain, and classification

---

### 4.4 Implement PreCompact Hook

**Why:** When Claude Code's context window fills and it compacts, the agent loses injected
expertise and guard context. PreCompact should re-prime the agent.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (hook deployment) | Deploy PreCompact hook that: (1) Re-reads the agent's overlay CLAUDE.md. (2) Re-injects key context: agent name, capability, file scope, active task, quality gates. (3) Re-injects recent unread mail. This ensures the agent doesn't lose its identity after compaction. |

**Acceptance criteria:**
- [x] After context compaction, agent still knows its name, capability, and task
- [x] File scope restrictions are re-injected
- [x] Recent mail is re-surfaced

---

### 4.5 Add Environment Guard for Agent Hooks

**Why:** Overstory has an `ENV_GUARD` that ensures hooks only fire for overstory-managed
agents, not for regular Claude Code sessions. Fleet Command hooks could affect all
Claude Code sessions on the machine.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (hook deployment) | Wrap all hook scripts with an environment check: `if [ -z "$FC_AGENT_NAME" ]; then exit 0; fi`. Since Fleet Command sets `FC_AGENT_NAME` as an environment variable for spawned agents, this ensures hooks only execute for managed agents. |

**Acceptance criteria:**
- [x] Hooks only fire when `FC_AGENT_NAME` env var is set
- [x] Regular Claude Code sessions are unaffected
- [x] Guard is applied to all hook types

---

## Phase 5: Checkpoint, Recovery & Session Persistence ✅ COMPLETE

**Goal:** Make the system resumable after crashes — coordinators recover state, handoffs
work end-to-end, and checkpoints contain correct data.

**Priority:** HIGH — Without this, any crash loses all orchestration progress.

**Estimated scope:** ~400 lines across 3-4 files.

**Status:** All 5 tasks implemented.

---

### 5.1 Fix `mulch_domains` Column Bug

**Why:** Line 534 of `agentProcessManager.ts` saves `worktree_path` to the `mulch_domains`
column instead of actual expertise domains worked on.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/agentProcessManager.ts` (line ~534) | Replace: `opts.worktreePath ? JSON.stringify([opts.worktreePath]) : null` with: Query expertise_records for this agent's domains: `SELECT DISTINCT domain FROM expertise_records WHERE agent_name = ?`. Save result as JSON array. |

**Acceptance criteria:**
- [x] Checkpoint `mulch_domains` contains actual expertise domains
- [x] Empty array if no expertise recorded (not null, not worktree path)

---

### 5.2 Implement Checkpoint Injection on Resume

**Why:** When resuming an agent via `--resume`, Fleet Command only passes the CLI flag.
It doesn't inject checkpoint context (what was done, what's pending, files modified).

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in agent:spawn, when `resumeSessionId` is set) | Before spawning: (1) Query checkpoints table for the agent_name. (2) If checkpoint found, prepend to the prompt: `## Session Recovery\nPrevious progress: {progressSummary}\nPending work: {pendingWork}\nFiles modified: {filesModified}\nBranch: {currentBranch}`. (3) Also re-inject relevant expertise via auto-prime. |

**Acceptance criteria:**
- [x] Resumed agent receives checkpoint context in its prompt
- [x] Expertise from checkpoint domains is re-injected
- [x] Agent can continue from where it left off

---

### 5.3 Complete Handoff Lifecycle

**Why:** Overstory has a 3-step handoff: `initiateHandoff()` → `resumeFromHandoff()` →
`completeHandoff()`. Fleet Command has create and list but no actual lifecycle.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | Add `session:initiate-handoff` handler: (1) Save checkpoint for the agent. (2) Create handoff record with `from_session`, `to_session=null`, `reason`. (3) Mark the current session as completed. |
| `src/main/ipc/handlers.ts` | Add `session:complete-handoff` handler: (1) Find pending handoff (to_session is null) for the agent. (2) Update `to_session` with new session ID. (3) Load checkpoint into new session's context. |
| `src/main/services/agentProcessManager.ts` (in saveCheckpoints) | Call `initiate-handoff` logic when saving checkpoints on app shutdown. Set reason='shutdown'. |
| `src/preload/index.ts` | Expose both new handlers |
| `src/shared/types/index.ts` | Add to ElectronAPI |

**Acceptance criteria:**
- [x] App shutdown creates handoff records for all running agents
- [x] App restart can find pending handoffs and resume agents
- [x] Handoff includes reason (shutdown, crash, manual, timeout)

---

### 5.4 Implement Coordinator Recovery Protocol

**Why:** When the app crashes and restarts, the coordinator has no way to understand what
was happening. Overstory's coordinator reads checkpoints, checks active groups, checks
mail, and loads expertise before resuming.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (in `coordinator:start`) | Before generating coordinator prompt: (1) Check for existing coordinator checkpoint. (2) If found, build recovery context: `## Recovery Context\nPrevious session: {sessionId}\nProgress: {progressSummary}\nActive agents: {list from sessions table}\nPending merges: {list from merge_queue}\nUnread mail: {count}\nPending work: {pendingWork}`. (3) Include this in the coordinator's prompt. (4) Also load expertise domains from checkpoint's mulch_domains. |

**Acceptance criteria:**
- [x] Coordinator restart includes recovery context
- [x] Shows active child agents, pending merges, unread mail count
- [x] Previous progress summary is included

---

### 5.5 Add Expertise Decay/Pruning Automation

**Why:** The `expires_at` column exists in expertise_records but is never enforced.
Over time, tactical/observational records accumulate and become stale.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | The `expertise:prune-expired` handler already exists. Add auto-pruning: On app startup and on a daily interval, call the prune logic automatically. |
| `src/main/ipc/handlers.ts` (in expertise creation) | When creating expertise records, auto-set `expires_at` based on classification: `foundational` = null (never expires), `tactical` = 30 days, `observational` = 7 days. |

**Acceptance criteria:**
- [x] New expertise records get auto-assigned expiry based on classification
- [x] Expired records are pruned on app startup
- [x] Foundational records never expire
- [x] Pruning runs daily in background

---

## Phase 6: Two-Layer Instruction System ✅ COMPLETE

**Goal:** Separate reusable agent role definitions (HOW) from per-task overlays (WHAT),
matching Overstory's architecture for consistency and auditability.

**Priority:** MEDIUM — Improves consistency but system works without it.

**Estimated scope:** ~300 lines across 4-5 files.

**Status:** All 3 tasks implemented.

---

### 6.1 Create Base Agent Definition Files

**Why:** Overstory has `agents/coordinator.md`, `agents/lead.md`, `agents/builder.md`, etc.
These define the role's workflow, constraints, and failure modes — timeless and reusable.
Fleet Command stores definitions in the database as short text fields.

**Files to create:**

| File | Content |
|------|---------|
| `.fleetcommand/agent-defs/coordinator.md` | Role: top-level orchestrator. Workflow: analyze → decompose → dispatch → monitor → merge → complete. Constraints: read-only, no-worktree. Failure modes: HIERARCHY_BYPASS, PREMATURE_MERGE, OVERLAPPING_FILE_AREAS. |
| `.fleetcommand/agent-defs/lead.md` | Role: team coordinator. Workflow: 3-phase (scout → build → review). Dispatch overrides section. Failure modes: SPEC_WITHOUT_SCOUT, OVERLAPPING_FILE_SCOPE, REVIEW_SKIP. |
| `.fleetcommand/agent-defs/builder.md` | Role: implementation specialist. Workflow: read spec → implement → test → commit → report. Constraints: worktree-only, file-scope-only. Failure modes: PATH_BOUNDARY_VIOLATION, FILE_SCOPE_VIOLATION, SILENT_FAILURE. |
| `.fleetcommand/agent-defs/scout.md` | Role: exploration specialist. Workflow: explore → report findings. Constraints: read-only. |
| `.fleetcommand/agent-defs/reviewer.md` | Role: quality validation. Workflow: review code → run gates → report PASS/FAIL. Constraints: read-only. |
| `.fleetcommand/agent-defs/merger.md` | Role: branch integration. Workflow: 4-tier merge → quality gates → report. |
| `.fleetcommand/agent-defs/monitor.md` | Role: continuous fleet patrol. Constraints: read-only, no-worktree. |

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` (overlay generation) | Read the base definition file for the capability from `.fleetcommand/agent-defs/{capability}.md`. Prepend it to the generated overlay CLAUDE.md. The overlay then only adds the per-task specifics (task ID, file scope, branch, dispatch overrides). |
| `src/main/db/database.ts` | Add `definition_file TEXT` column to agent_definitions table pointing to the .md file |

**Acceptance criteria:**
- [x] Each capability has a base definition markdown file
- [x] Overlay CLAUDE.md includes base definition + per-task specifics
- [x] Base definitions are versioned in git (auditable)
- [x] Changing a base definition affects all future spawns of that capability

---

### 6.2 Add Three-Phase Lead Workflow to Lead Definition

**Why:** Overstory's lead.md describes a structured Scout→Build→Review workflow.
Fleet Command leads get freeform instructions.

**Files to modify:**

| File | Change |
|------|--------|
| `.fleetcommand/agent-defs/lead.md` | Include explicit three-phase workflow: **Phase 1 (Scout):** Spawn scouts to explore codebase, gather findings. **Phase 2 (Build):** Write specs from findings, spawn builders with non-overlapping file scopes. **Phase 3 (Review):** For complex tasks, spawn reviewer. For simple tasks, self-verify. Send merge_ready when done. Include dispatch override handling (SKIP SCOUT, SKIP REVIEW, MAX AGENTS). |

**Acceptance criteria:**
- [x] Lead agent overlay includes structured three-phase workflow
- [x] Dispatch overrides modify which phases are included
- [x] Lead definition includes failure modes (SPEC_WITHOUT_SCOUT, REVIEW_SKIP)

---

### 6.3 Add Capability Index for Reverse Lookup

**Why:** Overstory's agent-manifest has a `capabilityIndex` that maps capabilities to
agent types. Useful for coordinator to discover "which agents can explore?"

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/ipc/handlers.ts` | Add `agentDef:capability-index` handler that queries agent_definitions and builds reverse map: `{ explore: ['scout'], coordinate: ['lead', 'coordinator'], implement: ['builder', 'lead'], review: ['reviewer'], merge: ['merger'] }` from the `capabilities` JSON column. |
| `src/preload/index.ts` | Expose handler |
| `src/shared/types/index.ts` | Add to ElectronAPI |

**Acceptance criteria:**
- [x] Coordinator can query "which agents have 'implement' capability?"
- [x] Returns array of matching role names

---

## Phase 7: Observability & Telemetry

**Goal:** Complete the observability layer so all agent actions are traceable and
the new Sessions/Mulch pages have rich data to display.

**Priority:** MEDIUM — System works without this, but debugging is harder.

**Estimated scope:** ~200 lines.

---

### 7.1 Add Expertise Auto-Injection into Agent Prompts

**Why:** The expertise auto-prime at spawn (3s delay) loads records, but expertise
recorded DURING a run isn't injected into already-running agents.

**Files to modify:**

| File | Change |
|------|--------|
| `src/main/services/agentProcessManager.ts` | In the mail injection interval (for all agents per 4.1), also check for new expertise records in the agent's domains. If new records found since last injection, format and inject alongside mail. |

**Acceptance criteria:**
- [ ] Agent receives new expertise records discovered during its run
- [ ] Only records from agent's domains are injected
- [ ] Injection is rate-limited (not every 5s, maybe every 60s)

---

### 7.2 Add Session Metrics to Sessions Page

**Why:** The new Sessions page shows session data but doesn't link to metrics (token
usage, cost). The data exists in the metrics table.

**Files to modify:**

| File | Change |
|------|--------|
| `src/renderer/pages/SessionsPage/components/SessionDetail.tsx` | Add a "Metrics" section: query `metricsList` and find the matching metric by agent_name + started_at. Show: input/output tokens, cache tokens, estimated cost, duration. |
| `src/renderer/pages/SessionsPage/SessionsPage.tsx` | In summary cards, add total cost across all sessions. |

**Acceptance criteria:**
- [ ] Session detail panel shows token usage and cost
- [ ] Summary card shows aggregate cost
- [ ] Metrics link to the Metrics page for deep dive

---

### 7.3 Add Mulch CLI Wrapper Commands

**Why:** Overstory has `mulch prime`, `mulch record`, `mulch learn`, `mulch search`,
`mulch prune` commands. Fleet Command has database tables but no CLI interface for agents
to use from their hooks/scripts.

**Files to modify:**

| File | Change |
|------|--------|
| `scripts/fc-mulch.js` (NEW) | Create a lightweight Node.js CLI script that agents can invoke from hooks: `fc-mulch prime {domain}` → reads expertise_records, outputs formatted context. `fc-mulch record {domain} --type {type} --title {title} --content {content}` → inserts into expertise_records. `fc-mulch search {query}` → searches records by title/content. `fc-mulch prune` → deletes expired records. Uses direct SQLite access (same DB path). |
| `src/main/ipc/handlers.ts` (hook deployment) | Update PostToolUse and Stop hooks to call `fc-mulch record` and `fc-mulch learn` respectively. |

**Acceptance criteria:**
- [ ] `fc-mulch prime architecture` outputs formatted expertise
- [ ] `fc-mulch record` creates a new expertise record
- [ ] Hooks can invoke fc-mulch from shell scripts
- [ ] DB path is auto-detected from environment

---

## Summary: Implementation Order

```
Phase 1: Hierarchy Enforcement & Spawn Safety     ✅ COMPLETE
  1.1  canSpawn + constraints fields              ✅
  1.2  validateHierarchy() function               ✅
  1.3  Task locking                               ✅
  1.4  Scope overlap blocking                     ✅
  1.5  Spawn stagger delay                        ✅
  1.6  Dispatch overrides for leads               ✅
  1.7  Auto-dispatch mailbox                      ✅

Phase 2: Merge Pipeline Automation                ✅ COMPLETE
  2.1  merge:auto-escalate handler                ✅
  2.2  Quality gate execution after merge         ✅
  2.3  Mail notifications on merge events         ✅
  2.4  Auto-advance queue                         ✅
  2.5  Issue auto-close after merge               ✅
  2.6  Merger agent role definition               ✅

Phase 3: Watchdog & Monitoring Hardening          ✅ COMPLETE
  3.1  Persistent capability exemption              ✅
  3.2  Decision gate detection                      ✅
  3.3  Multi-signal activity detection              ✅
  3.4  Run completion detection                     ✅
  3.5  Forward-only state machine                   ✅
  3.6  Nudge debounce                               ✅

Phase 4: Hooks & Context Injection                ✅ COMPLETE
  4.1  Real mail injection for all agents           ✅
  4.2  PostToolUse hook implementation              ✅
  4.3  Stop hook implementation                     ✅
  4.4  PreCompact hook implementation               ✅
  4.5  Environment guard                            ✅

Phase 5: Checkpoint & Recovery                    ✅ COMPLETE
  5.1  Fix mulch_domains bug                        ✅
  5.2  Checkpoint injection on resume               ✅
  5.3  Complete handoff lifecycle                    ✅
  5.4  Coordinator recovery protocol                ✅
  5.5  Expertise decay automation                   ✅

Phase 6: Two-Layer Instruction System             ✅ COMPLETE
  6.1  Base agent definition files                   ✅
  6.2  Three-phase lead workflow                     ✅
  6.3  Capability index                              ✅

Phase 7: Observability & Telemetry                ← NEXT
  7.1  Expertise auto-injection
  7.2  Session metrics integration
  7.3  Mulch CLI wrapper
```

**Total tasks: 31 (29 complete, 2 remaining)**
**Total estimated new code: ~3,000 lines**
**Files primarily affected: `handlers.ts`, `watchdogService.ts`, `mergeService.ts`, `agentProcessManager.ts`, `database.ts`, `shared/types/index.ts`**
