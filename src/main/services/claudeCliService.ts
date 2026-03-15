import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';

export interface ClaudeCliDetectionResult {
  found: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
  error: string | null;
}

// Fallback paths per platform where Claude CLI might be installed
function getFallbackPaths(): string[] {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || '';

  if (platform === 'win32') {
    return [
      path.join(home, 'AppData', 'Local', 'Programs', 'claude-code', 'claude.exe'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'claude'),
      path.join(home, '.npm-global', 'claude.cmd'),
      path.join(home, '.npm-global', 'claude'),
      'C:\\Program Files\\Claude Code\\claude.exe',
      'C:\\Program Files (x86)\\Claude Code\\claude.exe',
      path.join(home, 'scoop', 'shims', 'claude.exe'),
      path.join(home, '.local', 'bin', 'claude'),
    ];
  }

  if (platform === 'darwin') {
    return [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      path.join(home, '.npm-global', 'bin', 'claude'),
      path.join(home, '.local', 'bin', 'claude'),
      '/usr/bin/claude',
      path.join(home, 'Library', 'Application Support', 'Claude Code', 'claude'),
    ];
  }

  // Linux
  return [
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    path.join(home, '.npm-global', 'bin', 'claude'),
    path.join(home, '.local', 'bin', 'claude'),
    '/snap/bin/claude',
    path.join(home, '.nvm', 'current', 'bin', 'claude'),
  ];
}

/**
 * Attempt to find claude binary via PATH using which/where command
 */
function detectViaPath(): string | null {
  const command = process.platform === 'win32' ? 'where claude' : 'which claude';
  try {
    const result = execSync(command, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // 'where' on Windows can return multiple lines; take the first
    const firstLine = result.split('\n')[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      log.info(`[ClaudeCLI] Found via PATH: ${firstLine}`);
      return firstLine;
    }
  } catch {
    log.debug('[ClaudeCLI] Not found via PATH lookup');
  }
  return null;
}

/**
 * Check fallback installation paths
 */
function detectViaFallback(): string | null {
  const fallbacks = getFallbackPaths();
  for (const fallbackPath of fallbacks) {
    try {
      if (fs.existsSync(fallbackPath)) {
        log.info(`[ClaudeCLI] Found via fallback path: ${fallbackPath}`);
        return fallbackPath;
      }
    } catch {
      // Skip paths that error on access
    }
  }
  log.debug('[ClaudeCLI] Not found in any fallback paths');
  return null;
}

/**
 * Get the version of the Claude CLI binary
 */
function getVersion(binaryPath: string): string | null {
  try {
    const result = execSync(`"${binaryPath}" --version`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Parse version string - may be like "claude 1.2.3" or just "1.2.3"
    const versionMatch = result.match(/(\d+\.\d+\.\d+[\w.-]*)/);
    const version = versionMatch ? versionMatch[1] : result;
    log.info(`[ClaudeCLI] Version: ${version}`);
    return version;
  } catch (error) {
    log.warn(`[ClaudeCLI] Failed to get version: ${error}`);
    return null;
  }
}

/**
 * Check if the CLI is authenticated (has valid OAuth session)
 */
function checkAuthentication(binaryPath: string): boolean {
  try {
    const result = execSync(`"${binaryPath}" auth status`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    // Parse auth status - look for indicators of authentication
    const isAuthenticated =
      result.toLowerCase().includes('authenticated') ||
      result.toLowerCase().includes('logged in') ||
      result.toLowerCase().includes('valid') ||
      !result.toLowerCase().includes('not authenticated');
    log.info(`[ClaudeCLI] Auth status: ${isAuthenticated ? 'authenticated' : 'not authenticated'}`);
    return isAuthenticated;
  } catch {
    log.warn('[ClaudeCLI] Auth check failed or CLI not authenticated');
    return false;
  }
}

// Cached detection result
let cachedResult: ClaudeCliDetectionResult | null = null;

/**
 * Detect Claude CLI binary via PATH lookup + fallback paths.
 * Results are cached for the session.
 */
export function detectClaudeCli(forceRefresh = false): ClaudeCliDetectionResult {
  if (cachedResult && !forceRefresh) {
    log.debug('[ClaudeCLI] Returning cached detection result');
    return cachedResult;
  }

  log.info('[ClaudeCLI] Starting CLI detection...');

  try {
    // Step 1: Try PATH lookup
    let binaryPath = detectViaPath();

    // Step 2: If not found in PATH, check fallback paths
    if (!binaryPath) {
      binaryPath = detectViaFallback();
    }

    if (!binaryPath) {
      cachedResult = {
        found: false,
        path: null,
        version: null,
        authenticated: false,
        error: 'Claude CLI not found in PATH or common installation locations',
      };
      log.warn('[ClaudeCLI] CLI binary not found');
      return cachedResult;
    }

    // Step 3: Verify version
    const version = getVersion(binaryPath);

    // Step 4: Check authentication
    const authenticated = checkAuthentication(binaryPath);

    cachedResult = {
      found: true,
      path: binaryPath,
      version,
      authenticated,
      error: null,
    };

    log.info(
      `[ClaudeCLI] Detection complete: path=${binaryPath}, version=${version}, auth=${authenticated}`,
    );
    return cachedResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    cachedResult = {
      found: false,
      path: null,
      version: null,
      authenticated: false,
      error: errorMsg,
    };
    log.error(`[ClaudeCLI] Detection failed: ${errorMsg}`);
    return cachedResult;
  }
}

/**
 * Get the cached detection result, or run detection if not yet cached
 */
export function getClaudeCliStatus(): ClaudeCliDetectionResult {
  return detectClaudeCli(false);
}

/**
 * Clear the cached result (useful for re-detection after install)
 */
export function clearClaudeCliCache(): void {
  cachedResult = null;
  log.info('[ClaudeCLI] Cache cleared');
}
