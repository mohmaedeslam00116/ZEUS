/**
 * Tests for `scripts/check-crown-jewels.mjs` — the crown-jewel consistency
 * gate (#16). Hermetic: every test builds a throwaway fixture tree that
 * replicates the repo shape (src/main/…, docs/architecture/…), runs the
 * script via `node --experimental-vm-modules`-free child_process with
 * `--root <fixture>`, and asserts the exit code + output. The real
 * repository is never touched.
 *
 * The seeded-failure cases are the historical drift class from the #8 rename:
 * a consumer referencing `limboo.db`, omitting a jewel, or hard-coding its
 * own copy of the set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./check-crown-jewels.mjs', import.meta.url));

const PRODUCER = `import path from 'node:path';
import { app } from 'electron';
export function crownJewelPaths(): string[] {
  const root = app.getPath('userData');
  return [
    path.join(root, 'secrets'),
    path.join(root, 'zeus.db'),
    path.join(root, 'settings.json'),
    path.join(root, 'window-state.json'),
  ];
}
`;

const AGENT_OK = `import { crownJewelPaths } from '../sandbox/policy';
import { sessionDenyRules } from './cursor/permissions';
export function wire() {
  const denyRules = sessionDenyRules(crownJewelPaths());
  return denyRules;
}
`;

const CURSOR_OK = `export function sessionDenyRules(jewels: string[]): string[] {
  return jewels.map((j) => \`Read(\${j})\`);
}
`;

const DATABASE_OK = `import path from 'node:path';
import { app } from 'electron';
export function dbFile(): string {
  return path.join(app.getPath('userData'), 'zeus.db');
}
`;

const DOC_OK = 'The database lives at `{userData}/zeus.db` in the main process.\n';

/** Minimal repo-shaped fixture: producer + 2 consumers + db + 1 doc. */
function seed(root) {
  const dirs = [
    'src/main/managers/sandbox',
    'src/main/managers/cursor',
    'src/main/db',
    'docs/architecture/subsystems',
  ];
  for (const d of dirs) mkdirSync(path.join(root, d), { recursive: true });
  writeFileSync(path.join(root, 'src/main/managers/sandbox/policy.ts'), PRODUCER);
  writeFileSync(path.join(root, 'src/main/managers/AgentManager.ts'), AGENT_OK);
  writeFileSync(path.join(root, 'src/main/managers/cursor/permissions.ts'), CURSOR_OK);
  writeFileSync(path.join(root, 'src/main/db/database.ts'), DATABASE_OK);
  writeFileSync(path.join(root, 'docs/architecture/process-model.md'), DOC_OK);
}

let tmpRoot;

function run() {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, '--root', tmpRoot], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

describe('check-crown-jewels', () => {
  beforeAll(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'crown-jewels-'));
  });
  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('passes on a consistent repo-shaped fixture (exit 0)', () => {
    seed(tmpRoot);
    const { code, out } = run();
    expect(code).toBe(0);
    expect(out).toContain('Crown-jewel consistency OK');
  });

  it('FAILS when the producer references limboo.db instead of zeus.db', () => {
    const p = path.join(tmpRoot, 'src/main/managers/sandbox/policy.ts');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, orig.replaceAll("'zeus.db'", "'limboo.db'"));
      const { code, out } = run();
      expect(code).toBe(1);
      expect(out).toMatch(/producer.*diverged|limboo\.db/);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('FAILS when a consumer hard-codes a jewel path (stops consuming the canonical set)', () => {
    const p = path.join(tmpRoot, 'src/main/managers/AgentManager.ts');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(
        p,
        orig.replace("sessionDenyRules(crownJewelPaths())", "sessionDenyRules([path.join(root, 'zeus.db')])"),
      );
      const { code, out } = run();
      expect(code).toBe(1);
      expect(out).toMatch(/AgentManager/);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('FAILS when the Cursor deny rules name a different DB path', () => {
    const p = path.join(tmpRoot, 'src/main/managers/cursor/permissions.ts');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, `${orig}\nconst LEGACY = 'limboo.db';\n`);
      const { code } = run();
      expect(code).toBe(1);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('FAILS when the database module renames the DB file', () => {
    const p = path.join(tmpRoot, 'src/main/db/database.ts');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, orig.replace("'zeus.db'", "'app.db'"));
      const { code, out } = run();
      expect(code).toBe(1);
      expect(out).toMatch(/database\.ts|banned DB path/);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('FAILS when a current-implementation doc mentions limboo.db', () => {
    const p = path.join(tmpRoot, 'docs/architecture/process-model.md');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, DOC_OK.replace('zeus.db', 'limboo.db'));
      const { code, out } = run();
      expect(code).toBe(1);
      expect(out).toMatch(/process-model\.md/);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('does NOT flag a doc mentioning "limboo" without the .db suffix', () => {
    seed(tmpRoot);
    const p = path.join(tmpRoot, 'docs/architecture/process-model.md');
    const orig = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, 'Limboo heritage is documented elsewhere; the live DB is zeus.db.\n');
      const { code } = run();
      expect(code).toBe(0);
    } finally {
      writeFileSync(p, orig);
    }
  });

  it('does NOT flag ADR-style historical rename mentions in non-scanned docs', () => {
    seed(tmpRoot);
    mkdirSync(path.join(tmpRoot, 'docs/adr'), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, 'docs/adr/0005-x.md'),
      'The rename (limboo.db → zeus.db) is part of the identity change.\n',
    );
    const { code } = run();
    expect(code).toBe(0);
  });
});
