import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import log from 'electron-log';
import simpleGit from 'simple-git';
import type { MergeResolutionTier } from '../../shared/types';
import { detectClaudeCli } from './claudeCliService';

const execFileAsync = promisify(execFile);

export interface MergeResult {
  success: boolean;
  resolvedTier: MergeResolutionTier | null;
  error: string | null;
  conflictFiles: string[];
}

export interface ConflictBlock {
  file: string;
  startLine: number;
  oursContent: string;
  theirsContent: string;
  baseContent: string | null;
}

/**
 * Performs a Tier 1 clean merge using `git merge --no-edit`.
 * Returns success if the merge completes without conflicts.
 * Returns failure with conflict info if conflicts are detected.
 *
 * @param repoPath - Path to the git repository (project root or worktree)
 * @param branchName - The branch to merge into the current branch
 * @param targetBranch - Optional target branch to checkout before merging (defaults to current branch)
 */
export async function executeCleanMerge(
  repoPath: string,
  branchName: string,
  targetBranch?: string,
): Promise<MergeResult> {
  const git = simpleGit(repoPath);

  try {
    // If a target branch is specified, checkout it first
    if (targetBranch) {
      log.info(`[Merge] Checking out target branch: ${targetBranch}`);
      await git.checkout(targetBranch);
    }

    // Get current branch for logging
    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    log.info(`[Merge] Attempting Tier 1 clean merge: ${branchName} into ${currentBranch.trim()}`);

    // Perform the merge with --no-edit (no interactive editor for merge commit)
    const mergeResult = await git.merge([branchName, '--no-edit']);

    if (mergeResult.failed) {
      log.warn(`[Merge] Merge failed for branch ${branchName}: ${JSON.stringify(mergeResult)}`);
      return {
        success: false,
        resolvedTier: null,
        error: `Merge failed: ${JSON.stringify(mergeResult.merges)}`,
        conflictFiles: (mergeResult.conflicts || []).map((c) =>
          typeof c === 'string' ? c : String(c),
        ),
      };
    }

    log.info(`[Merge] Tier 1 clean merge successful: ${branchName} into ${currentBranch.trim()}`);
    return {
      success: true,
      resolvedTier: 'clean-merge',
      error: null,
      conflictFiles: [],
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check if the error is a merge conflict
    if (errorMessage.includes('CONFLICTS') || errorMessage.includes('Merge conflict')) {
      log.warn(`[Merge] Conflicts detected merging ${branchName}: ${errorMessage}`);

      // Try to get the list of conflicted files
      let conflictFiles: string[] = [];
      try {
        const status = await git.status();
        conflictFiles = status.conflicted;
      } catch {
        // If we can't get status, just use empty array
      }

      // Abort the conflicted merge to leave repo in clean state
      try {
        await git.merge(['--abort']);
        log.info('[Merge] Aborted conflicted merge to restore clean state');
      } catch {
        // Merge abort might fail if state is unexpected
        log.warn('[Merge] Could not abort merge - repo may be in unclean state');
      }

      return {
        success: false,
        resolvedTier: null,
        error: `Merge conflicts detected in ${conflictFiles.length} file(s)`,
        conflictFiles,
      };
    }

    log.error(`[Merge] Unexpected error merging ${branchName}: ${errorMessage}`);
    return {
      success: false,
      resolvedTier: null,
      error: errorMessage,
      conflictFiles: [],
    };
  }
}

/**
 * Check if a merge would result in conflicts (dry run).
 * Uses `git merge --no-commit --no-ff` and then aborts.
 */
export async function previewMerge(
  repoPath: string,
  branchName: string,
): Promise<{ canMerge: boolean; conflictFiles: string[] }> {
  const git = simpleGit(repoPath);

  try {
    // Attempt merge without committing
    await git.merge([branchName, '--no-commit', '--no-ff']);

    // If we get here, merge succeeded - abort it (we just wanted to preview)
    await git.merge(['--abort']);

    return { canMerge: true, conflictFiles: [] };
  } catch (_err: unknown) {
    // Conflicts detected - abort and report
    let conflictFiles: string[] = [];
    try {
      const status = await git.status();
      conflictFiles = status.conflicted;
    } catch {
      // ignore
    }

    try {
      await git.merge(['--abort']);
    } catch {
      // ignore abort failure
    }

    return { canMerge: false, conflictFiles };
  }
}

/**
 * Parse conflict markers from a file's content.
 * Handles both diff3 (with base) and standard (without base) conflict markers.
 *
 * Standard markers:
 *   <<<<<<< HEAD
 *   (ours)
 *   =======
 *   (theirs)
 *   >>>>>>> branch-name
 *
 * Diff3 markers:
 *   <<<<<<< HEAD
 *   (ours)
 *   ||||||| base
 *   (base)
 *   =======
 *   (theirs)
 *   >>>>>>> branch-name
 */
export function parseConflictMarkers(filePath: string, content: string): ConflictBlock[] {
  const lines = content.split('\n');
  const conflicts: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const startLine = i;
      const oursLines: string[] = [];
      const baseLines: string[] = [];
      const theirsLines: string[] = [];
      let section: 'ours' | 'base' | 'theirs' = 'ours';
      let hasBase = false;
      i++;

      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        if (lines[i].startsWith('|||||||')) {
          section = 'base';
          hasBase = true;
        } else if (lines[i].startsWith('=======')) {
          section = 'theirs';
        } else {
          if (section === 'ours') oursLines.push(lines[i]);
          else if (section === 'base') baseLines.push(lines[i]);
          else theirsLines.push(lines[i]);
        }
        i++;
      }

      conflicts.push({
        file: filePath,
        startLine,
        oursContent: oursLines.join('\n'),
        theirsContent: theirsLines.join('\n'),
        baseContent: hasBase ? baseLines.join('\n') : null,
      });
    }
    i++;
  }

  return conflicts;
}

/**
 * Check if a conflict is "simple" and can be auto-resolved.
 * Simple conflicts include:
 * - One side is empty (deletion vs modification → keep the modification)
 * - Both sides made identical changes
 * - One side only adds content (additive-only, non-overlapping)
 * - Whitespace-only differences
 */
function isSimpleConflict(block: ConflictBlock): 'ours' | 'theirs' | 'both' | null {
  const ours = block.oursContent.trim();
  const theirs = block.theirsContent.trim();

  // Both sides made identical changes
  if (ours === theirs) {
    return 'ours'; // Either side works, they're the same
  }

  // One side is empty (deleted) - keep the modification
  if (ours === '' && theirs !== '') {
    return 'theirs';
  }
  if (theirs === '' && ours !== '') {
    return 'ours';
  }

  // Both sides empty
  if (ours === '' && theirs === '') {
    return 'ours';
  }

  // Whitespace-only differences
  if (ours.replace(/\s/g, '') === theirs.replace(/\s/g, '')) {
    return 'ours'; // Keep ours when only whitespace differs
  }

  // If we have a base, check if one side is unchanged from base
  if (block.baseContent !== null) {
    const base = block.baseContent.trim();
    if (ours === base && theirs !== base) {
      // Only theirs changed from base, take theirs
      return 'theirs';
    }
    if (theirs === base && ours !== base) {
      // Only ours changed from base, take ours
      return 'ours';
    }
  }

  // One side is a superset of the other (additive-only)
  if (theirs.includes(ours) && theirs.length > ours.length) {
    return 'theirs';
  }
  if (ours.includes(theirs) && ours.length > theirs.length) {
    return 'ours';
  }

  // Not a simple conflict
  return null;
}

/**
 * Resolve a single file's conflicts by replacing conflict markers with resolved content.
 * Returns the resolved content or null if any conflict couldn't be auto-resolved.
 */
function resolveFileConflicts(content: string): { resolved: string; allResolved: boolean } {
  const lines = content.split('\n');
  const resultLines: string[] = [];
  let i = 0;
  let allResolved = true;

  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<<')) {
      const oursLines: string[] = [];
      const baseLines: string[] = [];
      const theirsLines: string[] = [];
      let section: 'ours' | 'base' | 'theirs' = 'ours';
      let hasBase = false;
      const markerStart = i;
      i++;

      while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
        if (lines[i].startsWith('|||||||')) {
          section = 'base';
          hasBase = true;
        } else if (lines[i].startsWith('=======')) {
          section = 'theirs';
        } else {
          if (section === 'ours') oursLines.push(lines[i]);
          else if (section === 'base') baseLines.push(lines[i]);
          else theirsLines.push(lines[i]);
        }
        i++;
      }

      const block: ConflictBlock = {
        file: '',
        startLine: markerStart,
        oursContent: oursLines.join('\n'),
        theirsContent: theirsLines.join('\n'),
        baseContent: hasBase ? baseLines.join('\n') : null,
      };

      const resolution = isSimpleConflict(block);
      if (resolution === 'ours') {
        resultLines.push(...oursLines);
      } else if (resolution === 'theirs') {
        resultLines.push(...theirsLines);
      } else if (resolution === 'both') {
        resultLines.push(...oursLines, ...theirsLines);
      } else {
        // Can't auto-resolve - keep conflict markers
        allResolved = false;
        // Reconstruct the original conflict block
        resultLines.push(lines[markerStart]); // <<<<<<<
        resultLines.push(...oursLines);
        if (hasBase) {
          resultLines.push('||||||| base');
          resultLines.push(...baseLines);
        }
        resultLines.push('=======');
        resultLines.push(...theirsLines);
        resultLines.push(lines[i]); // >>>>>>>
      }
    } else {
      resultLines.push(lines[i]);
    }
    i++;
  }

  return { resolved: resultLines.join('\n'), allResolved };
}

/**
 * Tier 2: Auto-resolve conflicts by parsing conflict markers and resolving simple ones.
 * Starts a merge that produces conflicts, then attempts to resolve each conflicted file.
 * If all conflicts in all files can be auto-resolved, commits the merge.
 * Otherwise, aborts and returns the list of unresolvable files.
 */
export async function autoResolveConflicts(
  repoPath: string,
  branchName: string,
  targetBranch?: string,
): Promise<MergeResult> {
  const git = simpleGit(repoPath);

  try {
    // Checkout target branch if specified
    if (targetBranch) {
      log.info(`[Merge] Tier 2: Checking out target branch: ${targetBranch}`);
      await git.checkout(targetBranch);
    }

    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    log.info(`[Merge] Attempting Tier 2 auto-resolve: ${branchName} into ${currentBranch.trim()}`);

    // Start the merge - this will leave conflict markers in files
    try {
      await git.merge([branchName, '--no-edit']);
      // If merge succeeds without conflicts, it's actually a clean merge
      log.info('[Merge] Tier 2: No conflicts found - merge was clean');
      return {
        success: true,
        resolvedTier: 'clean-merge',
        error: null,
        conflictFiles: [],
      };
    } catch {
      // Expected - conflicts detected, continue to resolve
    }

    // Get list of conflicted files
    const status = await git.status();
    const conflictedFiles = status.conflicted;

    if (conflictedFiles.length === 0) {
      // No conflicts but merge failed for other reason
      try {
        await git.merge(['--abort']);
      } catch {
        /* ignore */
      }
      return {
        success: false,
        resolvedTier: null,
        error: 'Merge failed but no conflict files detected',
        conflictFiles: [],
      };
    }

    log.info(
      `[Merge] Tier 2: Found ${conflictedFiles.length} conflicted file(s): ${conflictedFiles.join(', ')}`,
    );

    // Try to auto-resolve each conflicted file
    const unresolvedFiles: string[] = [];
    const resolvedFiles: string[] = [];

    for (const file of conflictedFiles) {
      const filePath = path.join(repoPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const { resolved, allResolved } = resolveFileConflicts(content);

        if (allResolved) {
          // Write resolved content back
          fs.writeFileSync(filePath, resolved, 'utf-8');
          // Stage the resolved file
          await git.add(file);
          resolvedFiles.push(file);
          log.info(`[Merge] Tier 2: Auto-resolved conflicts in ${file}`);
        } else {
          unresolvedFiles.push(file);
          log.warn(`[Merge] Tier 2: Cannot auto-resolve conflicts in ${file}`);
        }
      } catch (fileErr) {
        log.error(`[Merge] Tier 2: Error reading/writing ${file}: ${fileErr}`);
        unresolvedFiles.push(file);
      }
    }

    if (unresolvedFiles.length === 0) {
      // All conflicts resolved! Commit the merge
      await git.commit(`Merge branch '${branchName}' (auto-resolved conflicts)`);
      log.info(`[Merge] Tier 2 auto-resolve successful: resolved ${resolvedFiles.length} file(s)`);
      return {
        success: true,
        resolvedTier: 'auto-resolve',
        error: null,
        conflictFiles: [],
      };
    }

    // Some files couldn't be resolved - abort the merge
    log.warn(
      `[Merge] Tier 2: ${unresolvedFiles.length} file(s) have complex conflicts that cannot be auto-resolved`,
    );
    try {
      await git.merge(['--abort']);
      log.info('[Merge] Tier 2: Aborted merge after partial auto-resolve failure');
    } catch {
      // Try harder to clean up
      try {
        await git.raw(['reset', '--hard', 'HEAD']);
      } catch {
        /* ignore */
      }
    }

    return {
      success: false,
      resolvedTier: null,
      error: `Auto-resolve failed for ${unresolvedFiles.length} file(s): ${unresolvedFiles.join(', ')}`,
      conflictFiles: unresolvedFiles,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(`[Merge] Tier 2 unexpected error: ${errorMessage}`);

    // Clean up on error
    try {
      await git.merge(['--abort']);
    } catch {
      /* ignore */
    }

    return {
      success: false,
      resolvedTier: null,
      error: errorMessage,
      conflictFiles: [],
    };
  }
}

/**
 * Tier 3: AI-resolve conflicts using Claude CLI to intelligently merge conflicting changes.
 * Starts a merge that produces conflicts, reads each conflicted file, sends the conflict
 * to Claude for resolution, and commits the result.
 */
export async function aiResolveConflicts(
  repoPath: string,
  branchName: string,
  targetBranch?: string,
): Promise<MergeResult> {
  const git = simpleGit(repoPath);

  try {
    // Check if Claude CLI is available
    const cliResult = detectClaudeCli();
    if (!cliResult.found || !cliResult.path) {
      return {
        success: false,
        resolvedTier: null,
        error:
          'Claude CLI not found - required for AI-resolve. Install Claude Code CLI and authenticate.',
        conflictFiles: [],
      };
    }

    // Checkout target branch if specified
    if (targetBranch) {
      log.info(`[Merge] Tier 3: Checking out target branch: ${targetBranch}`);
      await git.checkout(targetBranch);
    }

    const currentBranch = await git.revparse(['--abbrev-ref', 'HEAD']);
    log.info(`[Merge] Attempting Tier 3 AI-resolve: ${branchName} into ${currentBranch.trim()}`);

    // Start the merge - produces conflict markers
    try {
      await git.merge([branchName, '--no-edit']);
      // Clean merge, no conflicts
      log.info('[Merge] Tier 3: No conflicts found - merge was clean');
      return {
        success: true,
        resolvedTier: 'clean-merge',
        error: null,
        conflictFiles: [],
      };
    } catch {
      // Expected - conflicts detected
    }

    // Get conflicted files
    const status = await git.status();
    const conflictedFiles = status.conflicted;

    if (conflictedFiles.length === 0) {
      try {
        await git.merge(['--abort']);
      } catch {
        /* ignore */
      }
      return {
        success: false,
        resolvedTier: null,
        error: 'Merge failed but no conflict files detected',
        conflictFiles: [],
      };
    }

    log.info(
      `[Merge] Tier 3: Found ${conflictedFiles.length} conflicted file(s) for AI resolution`,
    );

    const unresolvedFiles: string[] = [];
    const resolvedFiles: string[] = [];

    for (const file of conflictedFiles) {
      const filePath = path.join(repoPath, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check if there are actually conflict markers
        if (!content.includes('<<<<<<<')) {
          // No markers, might be a binary or already resolved
          await git.add(file);
          resolvedFiles.push(file);
          continue;
        }

        // Ask Claude to resolve the conflicts
        const prompt = `You are resolving git merge conflicts. Below is the content of the file "${file}" with conflict markers.

Resolve ALL conflicts intelligently by:
1. Understanding the intent of both sides
2. Combining changes where possible
3. Choosing the better implementation when they conflict
4. Ensuring the result is syntactically valid code

IMPORTANT: Output ONLY the resolved file content. No explanations, no markdown code fences, no commentary. Just the raw file content with all conflict markers removed.

File content with conflicts:
${content}`;

        log.info(`[Merge] Tier 3: Sending ${file} to Claude for AI resolution...`);

        const resolvedContent = await invokeClaudeForResolution(cliResult.path, prompt, repoPath);

        if (resolvedContent && !resolvedContent.includes('<<<<<<<')) {
          fs.writeFileSync(filePath, resolvedContent, 'utf-8');
          await git.add(file);
          resolvedFiles.push(file);
          log.info(`[Merge] Tier 3: AI-resolved conflicts in ${file}`);
        } else {
          unresolvedFiles.push(file);
          log.warn(`[Merge] Tier 3: AI resolution failed or still contains markers for ${file}`);
        }
      } catch (fileErr) {
        log.error(`[Merge] Tier 3: Error processing ${file}: ${fileErr}`);
        unresolvedFiles.push(file);
      }
    }

    if (unresolvedFiles.length === 0) {
      // All conflicts resolved! Commit
      await git.commit(`Merge branch '${branchName}' (AI-resolved conflicts)`);
      log.info(`[Merge] Tier 3 AI-resolve successful: resolved ${resolvedFiles.length} file(s)`);
      return {
        success: true,
        resolvedTier: 'ai-resolve',
        error: null,
        conflictFiles: [],
      };
    }

    // Partial failure - abort
    log.warn(`[Merge] Tier 3: ${unresolvedFiles.length} file(s) could not be AI-resolved`);
    try {
      await git.merge(['--abort']);
    } catch {
      try {
        await git.raw(['reset', '--hard', 'HEAD']);
      } catch {
        /* ignore */
      }
    }

    return {
      success: false,
      resolvedTier: null,
      error: `AI-resolve failed for ${unresolvedFiles.length} file(s): ${unresolvedFiles.join(', ')}`,
      conflictFiles: unresolvedFiles,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log.error(`[Merge] Tier 3 unexpected error: ${errorMessage}`);

    try {
      await git.merge(['--abort']);
    } catch {
      /* ignore */
    }

    return {
      success: false,
      resolvedTier: null,
      error: errorMessage,
      conflictFiles: [],
    };
  }
}

/**
 * Invoke Claude CLI to resolve conflict content.
 * Uses `claude -p` (print mode) to send a prompt and get a response.
 */
async function invokeClaudeForResolution(
  claudePath: string,
  prompt: string,
  cwd: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(claudePath, ['-p', prompt, '--output-format', 'text'], {
      cwd,
      timeout: 120_000, // 2 minute timeout per file
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const result = stdout.trim();
    if (!result) {
      log.warn('[Merge] Claude returned empty response');
      return null;
    }

    // Strip markdown code fences if Claude added them despite instructions
    let cleaned = result;
    if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      const lastFence = cleaned.lastIndexOf('```');
      if (firstNewline > 0 && lastFence > firstNewline) {
        cleaned = cleaned.substring(firstNewline + 1, lastFence).trim();
      }
    }

    return cleaned;
  } catch (err) {
    log.error(`[Merge] Claude CLI invocation failed: ${err}`);
    return null;
  }
}
