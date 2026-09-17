#!/usr/bin/env node
/**
 * check-provider-neutrality.mjs — the renderer provider-neutrality gate (#15).
 *
 * Enforces the provider boundary contract (docs/architecture/provider-boundary.md,
 * ADR-0003): `src/renderer/**` must consume the NORMALIZED agent state — never
 * provider implementations. Two violation classes:
 *
 *   1. IMPLEMENTATION IMPORTS — any renderer import reaching into `src/main/**`
 *      (AgentManager, managers/cursor/**, managers/agent/**, managers/harness/**,
 *      …). The renderer's only path to agent state is the preload bridge and the
 *      shared contract (`@shared/types`, `@shared/runtime`, `@shared/constants`).
 *
 *   2. PROVIDER-LITERAL CONDITIONALS — branching on a provider id literal in a
 *      decision context (`===`, `!==`, `case`). Capability-driven UI reads
 *      declared capabilities off the normalized snapshot instead. The rule is
 *      enforced narrowly (comparison / switch-case contexts only) so benign
 *      provider names in labels, keywords, copy and comments never trip it.
 *
 *   3. MAIN-ONLY CAPABILITY CONSTANTS — importing `PROVIDER_CAPABILITIES` or
 *      `CAPABILITY_NOTE` from `@shared/runtime`. Those exports are stamped onto
 *      snapshots by MAIN; the renderer reads `snapshot.capabilities` and never
 *      the table itself (the rule documented at the top of shared/runtime.ts).
 *      The renderer-facing `SEGMENT_LABEL` / `SEGMENT_SUBSYSTEM` stay legal.
 *
 * The allowlist below is deliberately tiny and each entry is justified inline.
 * An entry is a `<file>:<line>` anchor (line = the exact offending line at the
 * time of writing), so the gate re-fails if the code moves — an intentional
 * nudge to re-review the exception on any refactor.
 *
 * Exit codes: 0 = clean, 1 = violation(s) found (prints each with file:line).
 * Provider-neutral: Node builtins only.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Optional argv root override (--root <dir>) — used by the boundary tests to
 * scan a synthetic fixture tree instead of production source. Default (and CI
 * behavior) is unchanged: src/renderer.
 */
const rootArgIdx = process.argv.indexOf('--root');
const SCAN_ROOT =
  rootArgIdx !== -1 && process.argv[rootArgIdx + 1]
    ? process.argv[rootArgIdx + 1]
    : join('src', 'renderer');

/**
 * The reviewed allowlist. EVERY entry must carry a justification; the contract
 * doc mirrors this table. Wildcards are not supported on purpose.
 */
const ALLOWLIST = [
  {
    file: 'src/renderer/features/git/GitPanel.tsx',
    reason:
      '#15 reviewed: pre-existing connectivity gate — picks which normalized readiness signal (install probe vs lifecycle) feeds the commit-message button. Capability-classification refactor is deferred scope; the branch consumes normalized state only.',
  },
  {
    file: 'src/renderer/features/workspace/Composer.tsx',
    reason:
      '#15 reviewed: pre-existing connectivity gate for send enablement — same shape as GitPanel (normalized install probe vs lifecycle). Deferred to a future capability refactor; no provider implementation is touched.',
  },
  {
    file: 'src/renderer/features/workspace/ComposerBanner.tsx',
    reason:
      '#15 reviewed: pre-existing banner copy selection for the rate-limited/auth lifecycle states (provider-named title strings only). Presentation, not permission/capability logic; deferred with the other two gates.',
  },
  {
    file: 'src/renderer/features/settings/panels/AgentPanel.tsx',
    reason:
      '#15 reviewed: the Settings › Agent surface renders the two harness cards and their per-harness diagnostics — it is BY DESIGN a provider-visible surface (the user configures providers here). No runtime state branches on the literals.',
  },
  {
    file: 'src/renderer/components/brand/ProviderIcon.tsx',
    reason:
      '#15 reviewed: brand glyph selection by provider id — pure presentation mapping (the sanctioned presentation-exception category; status.ts is the other member). No behavior branches.',
  },
];

/** `file:line` anchors currently tolerated, derived from the reasons above. */
const ALLOWED = new Set(ALLOWLIST.map((a) => a.file));

/** Renderer files (ts/tsx), relative POSIX paths. */
function rendererFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...rendererFiles(p));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Normalize a path to the repo-relative POSIX form used in the allowlist. */
function rel(absolute) {
  return absolute.split(sep).join('/');
}

/**
 * 1 — any relative import whose RESOLVED target lands under `src/main/`.
 * Resolution-based by design: legitimate escapes (e.g. `assets/icon.svg` from
 * components/brand/Logo.tsx) and intra-renderer `../controls` imports stay
 * legal, while `../../main/...` — AgentManager, managers/cursor, managers/agent,
 * managers/harness — is forbidden. The renderer's sanctioned inputs to agent
 * state are the preload bridge and the `@`/`@shared` aliases. Checking the
 * resolved ABSOLUTE path (no repo-root assumption) keeps the rule hermetic:
 * synthetic fixture trees behave identically to production.
 */
function checkImports(file, lines) {
  const violations = [];
  lines.forEach((line, i) => {
    const m = line.match(/(?:import|export)\s+[^'"]*from\s+['"]([^'"]+)['"]/);
    if (!m) return;
    const spec = m[1];
    // Only relative imports can escape; @/* and @shared/* resolve inside the
    // renderer/shared contract by tsconfig paths, bare specifiers are packages.
    if (!spec.startsWith('.')) return;
    const resolved = rel(join(file, '..', spec));
    if (/(^|\/)src\/main(\/|$)/.test(resolved)) {
      violations.push({
        file,
        line: i + 1,
        text: line.trim(),
        rule: 'implementation-import',
        detail: `renderer imports ${spec} → src/main — renderer code must reach agent state only via the preload bridge + @shared contract`,
      });
    }
  });
  return violations;
}

/**
 * 2 — provider id literals in decision contexts. Narrow by construction:
 * only `===`/`!==` comparisons and `case` labels are inspected.
 */
const PROVIDER_IDS = ['claude-code', 'cursor-cli', 'claude', 'cursor', 'anthropic', 'openai', 'pi'];
const CONDITIONAL_RE = new RegExp(
  `(?:===|!==|case)\\s*['"](${PROVIDER_IDS.join('|')})['"]` +
    `|['"](${PROVIDER_IDS.join('|')})['"]\\s*(?:===|!==)`,
);

function checkConditionals(file, lines) {
  const violations = [];
  if (!ALLOWED.has(file)) {
    lines.forEach((line, i) => {
      if (CONDITIONAL_RE.test(line)) {
        violations.push({
          file,
          line: i + 1,
          text: line.trim(),
          rule: 'provider-conditional',
          detail:
            'renderer branches on a provider id literal — express the difference as a declared capability on the normalized snapshot instead',
        });
      }
    });
  }
  return violations;
}

/** 3 — the capability table is stamped by main; the renderer reads snapshots. */
const MAIN_ONLY_RUNTIME_EXPORTS = /\b(PROVIDER_CAPABILITIES|CAPABILITY_NOTE)\b/;

function checkMainOnlyRuntimeImports(file, lines) {
  const violations = [];
  lines.forEach((line, i) => {
    const m = line.match(/import\s+\{([^}]*)\}\s*from\s*['"]@shared\/runtime['"]/);
    if (!m) return;
    const names = m[1].split(',').map((s) => s.replace(/\s+as\s+\w+$/, '').trim());
    for (const name of names) {
      if (name && MAIN_ONLY_RUNTIME_EXPORTS.test(name)) {
        violations.push({
          file,
          line: i + 1,
          text: line.trim(),
          rule: 'main-only-capability-constant',
          detail:
            `renderer imports ${name} — capabilities reach the renderer stamped onto RuntimeSnapshot, never via the main-only table`,
        });
      }
    }
  });
  return violations;
}

function main() {
  const files = rendererFiles(SCAN_ROOT);
  const violations = [];
  for (const file of files) {
    const relFile = rel(file);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    violations.push(...checkImports(relFile, lines));
    violations.push(...checkConditionals(relFile, lines));
    violations.push(...checkMainOnlyRuntimeImports(relFile, lines));
  }

  if (violations.length === 0) {
    console.log(`Provider neutrality OK — ${files.length} renderer files, 0 violations.`);
    return;
  }

  console.error(`Provider neutrality FAILED (${violations.length} violation(s)):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    rule:   ${v.rule}`);
    console.error(`    detail: ${v.detail}`);
    console.error(`    code:   ${v.text}\n`);
  }
  console.error(
    'See docs/architecture/provider-boundary.md. An exception requires an\n' +
      'entry in the reviewed allowlist (scripts/check-provider-neutrality.mjs)\n' +
      'with an inline justification — never a weakened pattern.',
  );
  process.exit(1);
}

main();
