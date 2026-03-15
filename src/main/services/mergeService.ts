import log from 'electron-log';
import simpleGit from 'simple-git';
import type { MergeResolutionTier } from '../../shared/types';

export interface MergeResult {
  success: boolean;
  resolvedTier: MergeResolutionTier | null;
  error: string | null;
  conflictFiles: string[];
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
        conflictFiles: mergeResult.conflicts || [],
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
