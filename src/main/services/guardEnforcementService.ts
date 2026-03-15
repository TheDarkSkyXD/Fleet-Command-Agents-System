import * as path from 'node:path';
import log from 'electron-log';
import { getDatabase } from '../db/database';
import type { AgentCapability } from './agentProcessManager';

/**
 * Guard rule definitions loaded from agent_definitions table.
 */
interface GuardRules {
  bash_restrictions: string[];
  path_boundaries: Array<{ pattern: string; type: string; description?: string }>;
  tool_allowlist: string[];
  file_scope: string | null;
}

/**
 * Dangerous git command patterns that are checked against bash commands.
 * These are the canonical patterns used for enforcement.
 */
const DANGEROUS_GIT_PATTERNS = [
  'git push',
  'git reset --hard',
  'git checkout -- .',
  'git clean -f',
  'git branch -D',
  'git push --force',
  'git push -f',
  'git reset --hard origin',
];

/**
 * File-related tool names that should be checked against path boundaries.
 */
const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'Glob', 'Grep']);

/**
 * Write-related tool names that modify files (used for file scope enforcement).
 */
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * Normalize a tool allowlist entry for comparison.
 * Handles variants like "Bash (read-only)" matching "Bash" tool calls.
 * The allowlist may contain qualified entries like "Bash (read-only + tests)".
 */
function isToolAllowed(toolName: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    // No allowlist configured = all tools allowed (permissive default)
    return true;
  }

  for (const allowed of allowlist) {
    // Exact match
    if (allowed === toolName) return true;
    // Qualified match: "Bash (read-only)" allows "Bash" tool calls
    // The restriction is on what bash commands can do, not the tool itself
    const baseTool = allowed.split(' ')[0];
    if (baseTool === toolName) return true;
  }

  return false;
}

/**
 * Guard Enforcement Service
 *
 * Monitors agent tool calls in real-time via stream-json events and enforces:
 * 1. Path boundary enforcement - agents cannot access files outside their worktree
 * 2. Bash command restrictions - dangerous git commands are blocked
 * 3. Tool allowlist enforcement - agents can only use permitted tools
 *
 * Violations are logged to the guard_violations table for audit and UI display.
 */
class GuardEnforcementService {
  private rulesCache: Map<string, GuardRules> = new Map();
  private cacheTTL = 60000; // 1 minute cache
  private cacheTimestamps: Map<string, number> = new Map();

  /**
   * Load guard rules for a capability/role from the database.
   * Uses a 1-minute cache to avoid repeated DB queries.
   */
  private loadRules(capability: string): GuardRules {
    const now = Date.now();
    const cached = this.rulesCache.get(capability);
    const cacheTime = this.cacheTimestamps.get(capability) ?? 0;

    if (cached && now - cacheTime < this.cacheTTL) {
      return cached;
    }

    try {
      const db = getDatabase();
      const row = db
        .prepare(
          'SELECT tool_allowlist, bash_restrictions, file_scope, path_boundaries FROM agent_definitions WHERE role = ?',
        )
        .get(capability) as {
        tool_allowlist: string | null;
        bash_restrictions: string | null;
        file_scope: string | null;
        path_boundaries: string | null;
      } | null;

      const rules: GuardRules = {
        bash_restrictions: [],
        path_boundaries: [],
        tool_allowlist: [],
        file_scope: null,
      };

      if (row) {
        try {
          rules.bash_restrictions = row.bash_restrictions ? JSON.parse(row.bash_restrictions) : [];
        } catch {
          rules.bash_restrictions = [];
        }
        try {
          rules.path_boundaries = row.path_boundaries ? JSON.parse(row.path_boundaries) : [];
        } catch {
          rules.path_boundaries = [];
        }
        try {
          rules.tool_allowlist = row.tool_allowlist ? JSON.parse(row.tool_allowlist) : [];
        } catch {
          rules.tool_allowlist = [];
        }
        rules.file_scope = row.file_scope;
      }

      this.rulesCache.set(capability, rules);
      this.cacheTimestamps.set(capability, now);
      return rules;
    } catch (error) {
      log.error(`[GuardEnforcement] Failed to load rules for ${capability}:`, error);
      return {
        bash_restrictions: [],
        path_boundaries: [],
        tool_allowlist: [],
        file_scope: null,
      };
    }
  }

  /**
   * Check if a file path is within the agent's allowed worktree boundary.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   */
  validatePathBoundary(
    capability: string,
    filePath: string,
    worktreePath?: string,
  ): { allowed: boolean; reason: string; boundary?: string } {
    const rules = this.loadRules(capability);

    if (rules.path_boundaries.length === 0) {
      return { allowed: true, reason: 'No path boundaries configured' };
    }

    const normalizedFile = path.resolve(filePath);

    for (const boundary of rules.path_boundaries) {
      if (boundary.type === 'worktree') {
        if (!worktreePath) {
          return {
            allowed: false,
            reason: 'Worktree path not specified; worktree boundary requires a worktree',
            boundary: boundary.pattern,
          };
        }
        const normalizedWorktree = path.resolve(worktreePath);
        if (
          !normalizedFile.startsWith(normalizedWorktree + path.sep) &&
          normalizedFile !== normalizedWorktree
        ) {
          return {
            allowed: false,
            reason: `Path '${filePath}' is outside worktree boundary '${worktreePath}'`,
            boundary: normalizedWorktree,
          };
        }
      } else if (boundary.type === 'directory') {
        const normalizedDir = path.resolve(boundary.pattern);
        if (
          !normalizedFile.startsWith(normalizedDir + path.sep) &&
          normalizedFile !== normalizedDir
        ) {
          return {
            allowed: false,
            reason: `Path '${filePath}' is outside directory boundary '${boundary.pattern}'`,
            boundary: normalizedDir,
          };
        }
      } else if (boundary.type === 'glob') {
        if (boundary.pattern.startsWith('!')) {
          const excluded = boundary.pattern.slice(1);
          if (normalizedFile.includes(excluded)) {
            return {
              allowed: false,
              reason: `Path '${filePath}' matches exclusion pattern '${boundary.pattern}'`,
              boundary: boundary.pattern,
            };
          }
        }
      }
    }

    return { allowed: true, reason: 'Path is within all configured boundaries' };
  }

  /**
   * Check if a bash command is blocked by the agent's restrictions.
   * Returns { blocked: true, ... } or { blocked: false }.
   */
  checkBashCommand(
    capability: string,
    command: string,
  ): { blocked: boolean; reason: string; matched_pattern?: string } {
    const rules = this.loadRules(capability);

    if (rules.bash_restrictions.length === 0) {
      return { blocked: false, reason: 'No bash restrictions configured' };
    }

    const normalizedCommand = command.toLowerCase().trim();

    // Check against configured bash restrictions from agent_definitions
    for (const pattern of rules.bash_restrictions) {
      const normalizedPattern = pattern.toLowerCase().trim();
      // Extract the actual command pattern (strip 'no ' prefix if present)
      const commandPattern = normalizedPattern.startsWith('no ')
        ? normalizedPattern.slice(3).trim()
        : normalizedPattern;

      if (commandPattern && normalizedCommand.includes(commandPattern)) {
        return {
          blocked: true,
          reason: `Command matches bash restriction: "${pattern}"`,
          matched_pattern: pattern,
        };
      }
    }

    // Also check against hardcoded dangerous git patterns as a safety net
    for (const pattern of DANGEROUS_GIT_PATTERNS) {
      if (normalizedCommand.includes(pattern.toLowerCase())) {
        // Only block if the role has any git-related restrictions
        const hasGitRestrictions = rules.bash_restrictions.some((r) =>
          r.toLowerCase().includes('git'),
        );
        if (hasGitRestrictions) {
          return {
            blocked: true,
            reason: `Dangerous git command detected: "${pattern}"`,
            matched_pattern: pattern,
          };
        }
      }
    }

    return { blocked: false, reason: 'Command is allowed' };
  }

  /**
   * Record a guard violation in the database.
   */
  /**
   * Validate tracker closure: agents can only close tasks/issues assigned to them.
   * Returns { allowed, reason } indicating whether the closure is permitted.
   *
   * @param agentName - The agent attempting the closure
   * @param issueId - The issue being closed
   * @param assignedAgent - The agent currently assigned to the issue (from DB)
   * @returns { allowed: boolean, reason: string }
   */
  validateTrackerClosure(
    agentName: string,
    issueId: string,
    assignedAgent: string | null,
  ): { allowed: boolean; reason: string } {
    // If no agent is assigned, block closure (no one owns it)
    if (!assignedAgent) {
      const reason = `Agent '${agentName}' attempted to close issue '${issueId}' which is not assigned to any agent`;
      return { allowed: false, reason };
    }

    // If the closing agent doesn't match the assigned agent, block
    if (assignedAgent !== agentName) {
      const reason = `Agent '${agentName}' attempted to close issue '${issueId}' assigned to '${assignedAgent}'. Agents can only close their own tasks.`;
      return { allowed: false, reason };
    }

    return { allowed: true, reason: 'Agent is the assigned owner of this task' };
  }

  /**
   * Record a tracker closure violation in the database.
   */
  recordTrackerClosureViolation(params: {
    agentName: string;
    capability: string;
    violation: string;
    severity: 'info' | 'warning' | 'critical';
  }): void {
    try {
      const db = getDatabase();
      const id = `gv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      db.prepare(
        `INSERT INTO guard_violations (id, agent_name, capability, rule_type, violation, severity)
         VALUES (?, ?, ?, 'tracker_closure', ?, ?)`,
      ).run(id, params.agentName, params.capability, params.violation, params.severity);
      log.warn(
        `[GuardEnforcement] Tracker closure violation recorded: ${params.violation} (agent=${params.agentName}, severity=${params.severity})`,
      );
    } catch (error) {
      log.error('[GuardEnforcement] Failed to record tracker closure violation:', error);
    }
  }

  private recordViolation(params: {
    agentName: string;
    capability: string;
    ruleType: 'tool_allowlist' | 'bash_restriction' | 'file_scope';
    violation: string;
    toolAttempted?: string;
    commandAttempted?: string;
    fileAttempted?: string;
    severity: 'info' | 'warning' | 'critical';
  }): void {
    try {
      const db = getDatabase();
      const id = `gv-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      db.prepare(
        `INSERT INTO guard_violations (id, agent_name, capability, rule_type, violation, tool_attempted, command_attempted, file_attempted, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        params.agentName,
        params.capability,
        params.ruleType,
        params.violation,
        params.toolAttempted ?? null,
        params.commandAttempted ?? null,
        params.fileAttempted ?? null,
        params.severity,
      );
      log.warn(
        `[GuardEnforcement] Violation recorded: ${params.ruleType} - ${params.violation} (agent=${params.agentName}, severity=${params.severity})`,
      );
    } catch (error) {
      log.error('[GuardEnforcement] Failed to record violation:', error);
    }
  }

  /**
   * Check if a file path is within the agent's assigned file scope.
   * File scope is an array of file paths/patterns that the agent is allowed to modify.
   * This enforces builder-level file scope restrictions beyond worktree boundaries.
   *
   * @param filePath - The file being modified
   * @param fileScope - Array of allowed file paths/glob patterns
   * @param worktreePath - The agent's worktree root (used to resolve relative paths)
   * @returns { allowed: boolean, reason: string }
   */
  validateFileScope(
    filePath: string,
    fileScope: string[],
    worktreePath?: string,
  ): { allowed: boolean; reason: string } {
    if (fileScope.length === 0) {
      return { allowed: true, reason: 'No file scope restrictions configured' };
    }

    const normalizedFile = path.resolve(filePath);

    for (const scopeEntry of fileScope) {
      // Resolve scope entries relative to worktree if not absolute
      const resolvedScope = path.isAbsolute(scopeEntry)
        ? path.resolve(scopeEntry)
        : worktreePath
          ? path.resolve(worktreePath, scopeEntry)
          : path.resolve(scopeEntry);

      // Check exact file match
      if (normalizedFile === resolvedScope) {
        return { allowed: true, reason: 'File is within assigned scope' };
      }

      // Check directory match (scope entry is a directory containing the file)
      if (normalizedFile.startsWith(resolvedScope + path.sep)) {
        return { allowed: true, reason: 'File is within assigned scope directory' };
      }

      // Check glob-style wildcard match (e.g., "src/components/*.tsx")
      if (scopeEntry.includes('*')) {
        const globBase = scopeEntry.split('*')[0];
        const resolvedGlobBase = path.isAbsolute(globBase)
          ? path.resolve(globBase)
          : worktreePath
            ? path.resolve(worktreePath, globBase)
            : path.resolve(globBase);
        const extension = scopeEntry.split('*').pop() || '';

        if (
          normalizedFile.startsWith(resolvedGlobBase) &&
          (!extension || normalizedFile.endsWith(extension))
        ) {
          return { allowed: true, reason: 'File matches assigned scope pattern' };
        }
      }
    }

    return {
      allowed: false,
      reason: `File '${filePath}' is outside assigned file scope. Allowed: [${fileScope.join(', ')}]`,
    };
  }

  /**
   * Enforce guard rules on a tool_use event from an agent.
   * Called when a stream-json event indicates an agent is attempting a tool call.
   *
   * @param agentName - The agent's name
   * @param capability - The agent's capability/role (e.g., 'builder', 'scout')
   * @param toolName - The tool being called (e.g., 'Read', 'Bash', 'Write')
   * @param toolInput - The tool's input parameters
   * @param worktreePath - The agent's assigned worktree path
   * @param fileScope - Optional array of file paths the agent is allowed to modify (for builder scope enforcement)
   * @returns { allowed: boolean, violation?: string } - Whether the tool call is allowed
   */
  enforceToolCall(
    agentName: string,
    capability: AgentCapability,
    toolName: string,
    toolInput: Record<string, unknown> | undefined,
    worktreePath?: string,
    fileScope?: string[],
  ): { allowed: boolean; violation?: string } {
    const rules = this.loadRules(capability);

    // 1. Check tool allowlist - block tools not in the role's permitted list
    if (!isToolAllowed(toolName, rules.tool_allowlist)) {
      const violation = `Tool '${toolName}' is not in ${capability}'s allowlist. Permitted tools: [${rules.tool_allowlist.join(', ')}]`;
      this.recordViolation({
        agentName,
        capability,
        ruleType: 'tool_allowlist',
        violation,
        toolAttempted: toolName,
        severity: WRITE_TOOLS.has(toolName) ? 'warning' : 'info',
      });
      log.warn(
        `[GuardEnforcement] TOOL ALLOWLIST VIOLATION: Agent '${agentName}' (${capability}) attempted disallowed tool '${toolName}'`,
      );
      return { allowed: false, violation };
    }

    // 2. Check path boundaries for file-related tools
    if (FILE_TOOLS.has(toolName) && toolInput) {
      const filePath =
        (toolInput.file_path as string) ||
        (toolInput.path as string) ||
        (toolInput.filePath as string);

      if (filePath && worktreePath) {
        const pathCheck = this.validatePathBoundary(capability, filePath, worktreePath);
        if (!pathCheck.allowed) {
          this.recordViolation({
            agentName,
            capability,
            ruleType: 'file_scope',
            violation: pathCheck.reason,
            toolAttempted: toolName,
            fileAttempted: filePath,
            severity: 'warning',
          });
          log.warn(
            `[GuardEnforcement] PATH VIOLATION: Agent '${agentName}' (${capability}) attempted ${toolName} on '${filePath}' outside worktree '${worktreePath}'`,
          );
          return { allowed: false, violation: pathCheck.reason };
        }
      }

      // 3. Check file scope enforcement for write tools (builder file scope)
      if (WRITE_TOOLS.has(toolName) && filePath && fileScope && fileScope.length > 0) {
        const scopeCheck = this.validateFileScope(filePath, fileScope, worktreePath);
        if (!scopeCheck.allowed) {
          this.recordViolation({
            agentName,
            capability,
            ruleType: 'file_scope',
            violation: scopeCheck.reason,
            toolAttempted: toolName,
            fileAttempted: filePath,
            severity: 'warning',
          });
          log.warn(
            `[GuardEnforcement] FILE SCOPE VIOLATION: Agent '${agentName}' (${capability}) attempted ${toolName} on '${filePath}' outside assigned scope`,
          );
          return { allowed: false, violation: scopeCheck.reason };
        }
      }
    }

    // 4. Check bash command restrictions
    if (toolName === 'Bash' && toolInput) {
      const command = (toolInput.command as string) || (toolInput.cmd as string) || '';
      if (command) {
        const bashCheck = this.checkBashCommand(capability, command);
        if (bashCheck.blocked) {
          const severity = this.classifyBashSeverity(command);
          this.recordViolation({
            agentName,
            capability,
            ruleType: 'bash_restriction',
            violation: bashCheck.reason,
            toolAttempted: 'Bash',
            commandAttempted: command.substring(0, 500),
            severity,
          });
          log.warn(
            `[GuardEnforcement] BASH VIOLATION: Agent '${agentName}' (${capability}) attempted blocked command: '${command.substring(0, 200)}'`,
          );
          return { allowed: false, violation: bashCheck.reason };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Classify the severity of a bash restriction violation.
   * Destructive commands like git push --force or git reset --hard are critical.
   */
  private classifyBashSeverity(command: string): 'info' | 'warning' | 'critical' {
    const lower = command.toLowerCase();
    if (
      lower.includes('git push --force') ||
      lower.includes('git push -f') ||
      lower.includes('git reset --hard') ||
      lower.includes('git clean -f') ||
      lower.includes('rm -rf')
    ) {
      return 'critical';
    }
    if (lower.includes('git push') || lower.includes('git branch -D')) {
      return 'warning';
    }
    return 'info';
  }

  /**
   * Clear the rules cache (e.g., when agent definitions are updated).
   */
  clearCache(): void {
    this.rulesCache.clear();
    this.cacheTimestamps.clear();
    log.info('[GuardEnforcement] Rules cache cleared');
  }
}

// Singleton instance
export const guardEnforcementService = new GuardEnforcementService();
