#!/usr/bin/env node
/**
 * check-crown-jewels.mjs — crown-jewel consistency gate (#16, ADR-0004/0005).
 *
 * Structural consistency verification only — the crown jewels are ALREADY a
 * single source of truth at runtime: `crownJewelPaths()` in
 * `src/main/managers/sandbox/policy.ts` defines the set, and the three
 * enforcement layers consume it directly (Layer 1 `protectedPaths()` in
 * AgentManager, Layer 2 `sessionDenyRules(crownJewelPaths())` → Cursor
 * `cli.json`, Layer 3 the sandbox floor). This gate verifies that structural
 * relationship stays intact: no consumer hard-codes its own copy, omits a
 * jewel, or references a different DB/config path — the drift class the
 * `limboo.db` → `zeus.db` rename (#8, ADR-0005) could have caused.
 *
 * Static source assertions over the three consumers; fast, deterministic,
 * read-only. Node builtins only. See docs/security/invariants.md (SEC-14).
 *
 * Usage: node scripts/check-crown-jewels.mjs [--root <dir>]
 *   --root: scan directory override (test isolation; defaults to the repo)
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx !== -1 ? path.resolve(args[rootIdx + 1]) : process.cwd();
const rel = (p) => path.join(ROOT, p);

const fail = (msg) => {
  console.error(`  FAIL ${msg}`);
  process.exitCode = 1;
};

// Rule 1 — the producer must still emit the ZEUS jewel set, nothing else. The
// legacy `limboo.db` name is the exact drift this gate exists to catch, so it
// is named explicitly as the failure case.
const producerOk = (src) =>
  /path\.join\(root,\s*'zeus\.db'\)/.test(src) &&
  !/limboo\.db/.test(src) &&
  /path\.join\(root,\s*'secrets'\)/.test(src) &&
  /path\.join\(root,\s*'settings\.json'\)/.test(src) &&
  /path\.join\(root,\s*'window-state\.json'\)/.test(src);

// Rule 2 — the consumer chain must be structural. Layer 1 (AgentManager) must
// import the producer and wire its output straight into the Cursor deny rules
// (`sessionDenyRules(crownJewelPaths())`); the Cursor module must stay
// parameterized (jewels in, rules out) and must never hard-code a jewel path.
const agentManagerOk = (src) =>
  /crownJewelPaths/.test(src) &&
  /sessionDenyRules\(crownJewelPaths\(\)\)/.test(src) &&
  !/limboo\.db/.test(src);

const cursorPermissionsOk = (src) =>
  /export function sessionDenyRules\(jewels: string\[\]\)/.test(src) &&
  !/'zeus\.db'/.test(src) &&
  !/limboo\.db/.test(src);

// Rule 3 — the app's own DB file must be zeus.db under userData, and no other
// production module may name a different DB/config file.
const databaseOk = (src) =>
  /'zeus\.db'/.test(src) && !/limboo\.db/.test(src);

// Rule 4 — docs describing the CURRENT implementation must use the ZEUS DB
// name. (ADR-0005's historical mentions of the rename are legitimate.)
const currentImplDocOk = (src) => !/limboo\.db/.test(src);

const RULES = [
  {
    file: 'src/main/managers/sandbox/policy.ts',
    label: 'crown-jewel producer (crownJewelPaths)',
    check: producerOk,
  },
  {
    file: 'src/main/managers/AgentManager.ts',
    label: 'Layer-1 consumer (imports producer, wires sessionDenyRules(crownJewelPaths()))',
    check: agentManagerOk,
  },
  {
    file: 'src/main/managers/cursor/permissions.ts',
    label: 'Layer-2 consumer (parameterized jewels, no hard-coded paths)',
    check: cursorPermissionsOk,
  },
  {
    file: 'src/main/db/database.ts',
    label: 'DB file producer (zeus.db under userData)',
    check: databaseOk,
  },
];

// Rule 4 files: current-implementation docs that describe the live DB path.
const DOC_RULES = [
  'docs/architecture/process-model.md',
  'docs/architecture/subsystems/database.md',
  'docs/architecture/subsystems/runtime-telemetry.md',
];

// No consumer may name a different DB/config path in userData.
const BANNED_DB_PATHS = [
  /['"`]limboo\.db['"`]/,
  /['"`]app\.db['"`]/,
  /['"`]data\.db['"`]/,
];

async function exists(p) {
  try {
    await readFile(p, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Recursive scan for any banned DB-path literal under src/ (production). */
async function scanBannedPaths(dir, out) {
  for (const ent of await listDir(dir)) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await scanBannedPaths(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(ent.name) && !/\.test\.(ts|mjs|js)$/.test(ent.name)) {
      const src = await readFile(p, 'utf8');
      for (const re of BANNED_DB_PATHS) {
        if (re.test(src)) out.push(`${path.relative(ROOT, p)} — banned DB path literal (${re})`);
      }
    }
  }
}

async function main() {
  let failures = 0;

  for (const rule of RULES) {
    const p = rel(rule.file);
    let src;
    try {
      src = await readFile(p, 'utf8');
    } catch {
      fail(`${rule.file}: not found`);
      failures++;
      continue;
    }
    if (rule.check(src)) {
      console.log(`  ok   ${rule.file} — ${rule.label}`);
    } else {
      fail(`${rule.file} — ${rule.label} diverged`);
      failures++;
    }
  }

  for (const doc of DOC_RULES) {
    const p = rel(doc);
    if (!(await exists(p))) continue;
    const src = await readFile(p, 'utf8');
    if (currentImplDocOk(src)) {
      console.log(`  ok   ${doc} — no legacy limboo.db reference`);
    } else {
      fail(`${doc} — legacy 'limboo.db' in current-implementation docs`);
      failures++;
    }
  }

  const banned = [];
  await scanBannedPaths(rel('src'), banned);
  if (banned.length === 0) {
    console.log('  ok   src/ — no banned DB-path literals');
  } else {
    for (const b of banned) fail(b);
    failures += banned.length;
  }

  if (failures || process.exitCode) {
    console.error(
      `\nCrown-jewel consistency violated (${failures || 'see above'}). ` +
        'The three consumers (AgentManager decision core, Cursor deny rules, sandbox floor) ' +
        'must resolve the SAME logical set from crownJewelPaths() — see docs/security/invariants.md (SEC-14). ' +
        'Do NOT hard-code a second copy of the set.',
    );
    process.exit(1);
  }
  console.log(`\nCrown-jewel consistency OK — 1 producer, 3 consumers, 1 logical set.`);
}

main().catch((err) => {
  console.error('check-crown-jewels failed:', err);
  process.exit(1);
});
