#!/usr/bin/env node
'use strict';

/**
 * fc-mulch - CLI wrapper for Fleet Command expertise (mulch) system.
 *
 * Subcommands:
 *   prime <domain>           Output formatted expertise context for a domain
 *   record <domain> [opts]   Insert a new expertise record
 *   learn <domain> [opts]    Alias for record with type=pattern, classification=tactical
 *   search <query>           Search records by title/content
 *   prune                    Delete expired records
 *
 * DB path resolution (first match wins):
 *   1. FC_DB_PATH env var
 *   2. <cwd>/.fleetcommand/fleet-command.db
 *   3. ~/.fleetcommand/fleet-command.db
 *   4. <electron appPath>/database/fleet-command.db  (dev fallback)
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

// ─── Helpers ────────────────────────────────────────────────

function die(msg) {
  process.stderr.write(`fc-mulch: ${msg}\n`);
  process.exit(1);
}

function resolveDbPath() {
  // 1. Explicit env var
  if (process.env.FC_DB_PATH) {
    if (fs.existsSync(process.env.FC_DB_PATH)) return process.env.FC_DB_PATH;
    die(`FC_DB_PATH points to non-existent file: ${process.env.FC_DB_PATH}`);
  }
  // 2. CWD-based .fleetcommand directory
  const cwdDb = path.join(process.cwd(), '.fleetcommand', 'fleet-command.db');
  if (fs.existsSync(cwdDb)) return cwdDb;
  // 3. Walk up from CWD to find .fleetcommand
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, '.fleetcommand', 'fleet-command.db');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 4. Home directory fallback
  const homeDb = path.join(os.homedir(), '.fleetcommand', 'fleet-command.db');
  if (fs.existsSync(homeDb)) return homeDb;
  // 5. Electron app database directory (dev)
  const electronDb = path.join(__dirname, '..', 'database', 'fleet-command.db');
  if (fs.existsSync(electronDb)) return electronDb;

  die(
    'Cannot locate fleet-command.db. Set FC_DB_PATH or run from a project directory with .fleetcommand/',
  );
}

function openDb() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch {
    die(
      'better-sqlite3 not found. Run `npm install` in the Fleet Command project root.',
    );
  }
  const dbPath = resolveDbPath();
  const db = new Database(dbPath, { readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 3000');
  return db;
}

// ─── Argument parsing ───────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }
  return { positional, flags };
}

// ─── Formatting ─────────────────────────────────────────────

function formatRecord(r, jsonMode) {
  if (jsonMode) return JSON.stringify(r);
  const tags = r.tags ? ` [${r.tags}]` : '';
  const agent = r.agent_name ? ` (by ${r.agent_name})` : '';
  const expires = r.expires_at ? ` expires:${r.expires_at}` : '';
  return [
    `--- ${r.type}/${r.classification}: ${r.title}${tags}${agent}${expires}`,
    r.content,
    '',
  ].join('\n');
}

function formatRecords(rows, jsonMode) {
  if (jsonMode) return JSON.stringify(rows, null, 2);
  if (rows.length === 0) return '(no records)';
  return rows.map((r) => formatRecord(r, false)).join('\n');
}

// ─── Subcommands ────────────────────────────────────────────

function cmdPrime(args) {
  const { positional, flags } = parseArgs(args);
  const domain = positional[0];
  if (!domain) die('Usage: fc-mulch prime <domain> [--json]');

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT * FROM expertise_records
       WHERE domain = ?
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY classification ASC, updated_at DESC`,
    )
    .all(domain);
  db.close();

  process.stdout.write(formatRecords(rows, flags.json === true));
  if (!flags.json) process.stdout.write('\n');
}

function cmdRecord(args) {
  const { positional, flags } = parseArgs(args);
  const domain = positional[0];
  if (!domain) die('Usage: fc-mulch record <domain> --title <t> --content <c> --type <t> --classification <c>');

  const title = flags.title;
  const content = flags.content;
  const type = flags.type || 'convention';
  const classification = flags.classification || 'tactical';

  if (!title) die('--title is required');
  if (!content) die('--content is required');

  const validTypes = ['pattern', 'convention', 'failure', 'decision', 'reference', 'guide'];
  if (!validTypes.includes(type)) die(`--type must be one of: ${validTypes.join(', ')}`);

  const validClassifications = ['foundational', 'tactical', 'observational'];
  if (!validClassifications.includes(classification))
    die(`--classification must be one of: ${validClassifications.join(', ')}`);

  // Auto-set expires_at based on classification
  let expiresAt = null;
  if (classification === 'tactical') {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    expiresAt = d.toISOString().replace('T', ' ').slice(0, 19);
  } else if (classification === 'observational') {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    expiresAt = d.toISOString().replace('T', ' ').slice(0, 19);
  }
  // foundational -> null (never expires)

  const id = crypto.randomUUID();
  const agentName = flags['agent-name'] || process.env.FC_AGENT_NAME || null;
  const sourceFile = flags['source-file'] || null;
  const tags = flags.tags || null;

  const db = openDb();
  db.prepare(
    `INSERT INTO expertise_records (id, domain, title, content, type, classification, agent_name, source_file, tags, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, domain, title, content, type, classification, agentName, sourceFile, tags, expiresAt);
  db.close();

  if (flags.json === true) {
    process.stdout.write(JSON.stringify({ id, domain, title, type, classification, expires_at: expiresAt }) + '\n');
  } else {
    process.stdout.write(`Recorded: ${id} (${type}/${classification}) in domain "${domain}"\n`);
  }
}

function cmdLearn(args) {
  const { positional, flags } = parseArgs(args);
  const domain = positional[0];
  if (!domain) die('Usage: fc-mulch learn <domain> --title <t> --content <c>');

  // learn is an alias for record with type=pattern, classification=tactical
  const augmented = [domain, '--type', 'pattern', '--classification', 'tactical'];
  for (const [k, v] of Object.entries(flags)) {
    if (k === 'type' || k === 'classification') continue; // override these
    augmented.push(`--${k}`);
    if (v !== true) augmented.push(String(v));
  }
  cmdRecord(augmented);
}

function cmdSearch(args) {
  const { positional, flags } = parseArgs(args);
  const query = positional[0];
  if (!query) die('Usage: fc-mulch search <query> [--json]');

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT * FROM expertise_records
       WHERE (title LIKE ? OR content LIKE ?)
         AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY updated_at DESC
       LIMIT 50`,
    )
    .all(`%${query}%`, `%${query}%`);
  db.close();

  process.stdout.write(formatRecords(rows, flags.json === true));
  if (!flags.json) process.stdout.write('\n');
}

function cmdPrune(args) {
  const { flags } = parseArgs(args);

  const db = openDb();
  const countRow = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM expertise_records
       WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`,
    )
    .get();

  const count = countRow.cnt;
  if (count === 0) {
    db.close();
    if (flags.json === true) {
      process.stdout.write(JSON.stringify({ pruned: 0 }) + '\n');
    } else {
      process.stdout.write('No expired records to prune.\n');
    }
    return;
  }

  db.prepare(
    `DELETE FROM expertise_records
     WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`,
  ).run();
  db.close();

  if (flags.json === true) {
    process.stdout.write(JSON.stringify({ pruned: count }) + '\n');
  } else {
    process.stdout.write(`Pruned ${count} expired record(s).\n`);
  }
}

// ─── Main ───────────────────────────────────────────────────

function printUsage() {
  process.stdout.write(
    [
      'Usage: fc-mulch <command> [options]',
      '',
      'Commands:',
      '  prime <domain>           Output expertise context for a domain',
      '  record <domain> [opts]   Create a new expertise record',
      '  learn <domain> [opts]    Quick-record (type=pattern, classification=tactical)',
      '  search <query>           Search records by title/content',
      '  prune                    Delete expired records',
      '',
      'Global flags:',
      '  --json                   Output as JSON instead of formatted text',
      '',
      'Record/learn options:',
      '  --title <text>           Record title (required)',
      '  --content <text>         Record content (required)',
      '  --type <type>            pattern|convention|failure|decision|reference|guide',
      '  --classification <cls>   foundational|tactical|observational',
      '  --agent-name <name>      Agent that created this record',
      '  --source-file <path>     Source file reference',
      '  --tags <csv>             Comma-separated tags',
      '',
      'Environment:',
      '  FC_DB_PATH               Explicit path to fleet-command.db',
      '  FC_AGENT_NAME            Auto-fills --agent-name if not provided',
      '',
    ].join('\n'),
  );
}

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(0);
}

const subArgs = argv.slice(1);

switch (command) {
  case 'prime':
    cmdPrime(subArgs);
    break;
  case 'record':
    cmdRecord(subArgs);
    break;
  case 'learn':
    cmdLearn(subArgs);
    break;
  case 'search':
    cmdSearch(subArgs);
    break;
  case 'prune':
    cmdPrune(subArgs);
    break;
  default:
    die(`Unknown command: ${command}. Run 'fc-mulch --help' for usage.`);
}
