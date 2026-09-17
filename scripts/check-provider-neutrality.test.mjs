/**
 * Tests for the provider-neutrality gate (`scripts/check-provider-neutrality.mjs`)
 * and the renderer-facing normalization contract (#15, ADR-0003).
 *
 * The gate is a security control: renderer-side provider branching is the shape
 * that historically precedes bypassing normalized permission/capability state.
 * These tests prove BOTH directions:
 *   - the clean production tree passes (spawn against src/renderer), and
 *   - every rule FAILS deterministically on a synthetic fixture (spawn with
 *     `--root` pointed at a temp tree — production source is never touched).
 *
 * The normalization side asserts the renderer-facing contract is built from
 * data tables, not provider branches: `status.ts`'s presentation mappers and
 * the table-driven naming rule stay provider-neutral by construction.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = join('scripts', 'check-provider-neutrality.mjs');
const RENDERER_ROOT = join('src', 'renderer');

let fixtureRoots = [];
afterAll(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
});

/** Run the gate against a directory; returns { status, output }. */
function runGate(root) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

/**
 * Seed a synthetic repo-shaped tree (`<root>/src/renderer/...`) — the import
 * rule resolves relative specifiers, so a violation importing `../../main/…`
 * must resolve to `<root>/src/main/…` exactly as it would in production.
 * Each test gets its OWN root: leftover files can never poison other cases.
 */
function seedFixture(relPath, content) {
  const root = mkdtempSync(join(tmpdir(), 'zeus-neutrality-'));
  fixtureRoots.push(root);
  const target = join(root, 'src', 'renderer', relPath);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
  return root;
}

describe('provider-neutrality gate — clean production tree passes', () => {
  it('reports 0 violations over the real src/renderer tree', () => {
    const r = runGate(RENDERER_ROOT);
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/0 violations/);
  });
});

describe('provider-neutrality gate — every rule fails deterministically', () => {
  it('fails on a renderer import from src/main (AgentManager)', () => {
    const root = seedFixture(
      'components/Violation.tsx',
      "import { AgentManager } from '../../main/managers/AgentManager';\n",
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/implementation-import/);
    expect(r.output).toMatch(/AgentManager/);
  });

  it('fails on a renderer import of a cursor adapter module', () => {
    const root = seedFixture(
      'features/Violation.tsx',
      "import { CursorRuntime } from '../../main/managers/cursor/CursorRuntime';\n",
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/implementation-import/);
    expect(r.output).toMatch(/managers\/cursor/);
  });

  it('fails on a provider-id conditional (=== / !== / case)', () => {
    const root = seedFixture(
      'features/Violation.tsx',
      [
        "export const a = (p: string) => p === 'cursor' ? 1 : 0;",
        "export const b = (p: string) => 'claude' !== p;",
        'export const c = (p: string) => { switch (p) { case "anthropic": return 1; default: return 0; } };',
      ].join('\n'),
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/provider-conditional/g);
    // All three comparison shapes are caught.
    expect(r.output.match(/provider-conditional/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('fails on a renderer import of the main-only capability constants', () => {
    const root = seedFixture(
      'features/Violation.tsx',
      "import { PROVIDER_CAPABILITIES, CAPABILITY_NOTE } from '@shared/runtime';\n",
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.output).toMatch(/main-only-capability-constant/);
    expect(r.output).toMatch(/PROVIDER_CAPABILITIES/);
  });

  it('does NOT flag renderer-facing runtime exports (SEGMENT_LABEL)', () => {
    const root = seedFixture(
      'features/Clean.tsx',
      "import { SEGMENT_LABEL, SEGMENT_SUBSYSTEM } from '@shared/runtime';\nexport const ok = typeof SEGMENT_LABEL === 'object';\n",
    );
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it('does NOT flag provider names in benign label/copy contexts', () => {
    const root = seedFixture(
      'features/Clean.tsx',
      [
        "export const keywords = ['claude', 'cursor', 'sonnet', 'anthropic'];",
        "export const label = 'Claude Code status';",
        '// the cursor here is a text cursor, not the provider',
      ].join('\n'),
    );
    const r = runGate(root);
    expect(r.status).toBe(0);
  });
});

describe('renderer-facing normalization contract is data-driven (#15)', () => {
  // The sanctioned presentation exception: provider naming flows through the
  // shared table chain (AGENT_MODELS → PROVIDER_HARNESS → HARNESS_LABELS) —
  // a third provider extends the tables and this mapper needs zero edits.
  it('agentDisplayName resolves model ids through the harness tables', async () => {
    const { agentDisplayName } = await import('../src/renderer/features/agent/status');
    const { DEFAULT_SETTINGS } = await import('../src/shared/constants');
    expect(agentDisplayName(DEFAULT_SETTINGS.agent.model)).not.toBe('Unknown model');
    expect(agentDisplayName('composer-2')).toBe('Cursor');
    expect(agentDisplayName('no-such-model-xyz')).toBe('Unknown model');
  });

  it('the capability table covers EVERY provider (the generalization idiom)', async () => {
    // Record<AgentProvider, …> — adding a provider without declaring
    // capabilities is a compile error; this asserts the runtime object too.
    const { PROVIDER_CAPABILITIES } = await import('../src/shared/runtime');
    const { AGENT_MODELS } = await import('../src/shared/constants');
    const declared = new Set(Object.keys(PROVIDER_CAPABILITIES));
    for (const m of AGENT_MODELS) expect(declared.has(m.provider)).toBe(true);
  });
});
