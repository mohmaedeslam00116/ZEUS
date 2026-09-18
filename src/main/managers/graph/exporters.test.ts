/**
 * Markdown exporter escaping — the audit finding: node titles/details are
 * free-form (session titles, file paths, terminal summaries) and previously
 * flowed into `## heading` / `- [x] task` rows unescaped, so a newline in a
 * title could forge headings/list items in the exported document. These tests
 * pin the external contract of {@link exportMarkdown} only — structure holds
 * for hostile text, benign text is untouched.
 */
import { describe, expect, it } from 'vitest';

import type { WorkGraphEdge, WorkGraphNode } from '@shared/types';

import { exportDot, exportMarkdown } from './exporters';

function objectiveNode(overrides: Partial<Extract<WorkGraphNode, { kind: 'objective' }>> = {}): WorkGraphNode {
  return {
    id: 'r',
    sessionId: 's1',
    workspaceId: null,
    seq: 1,
    runId: 'r',
    kind: 'objective',
    status: 'done',
    provider: 'anthropic',
    title: 'Ship the thing',
    detail: '',
    startedAt: 0,
    meta: { prompt: 'ship it', mode: 'default', model: 'test', attachmentCount: 0 },
    ...overrides,
  };
}

function terminalNode(title: string): WorkGraphNode {
  return {
    id: 'a',
    sessionId: 's1',
    workspaceId: null,
    seq: 2,
    runId: 'r',
    kind: 'terminal',
    status: 'error',
    provider: 'anthropic',
    title,
    detail: '',
    startedAt: 0,
    meta: { command: 'npm test', origin: 'agent', exitCode: 1 },
  };
}

function approvalNode(title: string): WorkGraphNode {
  return {
    id: 'a',
    sessionId: 's1',
    workspaceId: null,
    seq: 2,
    runId: 'r',
    kind: 'approval',
    status: 'running',
    provider: 'anthropic',
    title,
    detail: '',
    startedAt: 0,
    meta: { subject: 'tool', decision: 'ask', auto: false },
  };
}

function gitNode(title: string): WorkGraphNode {
  return {
    id: 'a',
    sessionId: 's1',
    workspaceId: null,
    seq: 2,
    runId: 'r',
    kind: 'git',
    status: 'running',
    provider: 'zeus',
    title,
    detail: '',
    startedAt: 0,
    meta: { op: 'commit', files: [], adds: 1, dels: 0 },
  };
}

function edge(src: string, dst: string): WorkGraphEdge {
  return { src, dst, kind: 'contains', derived: false } as WorkGraphEdge;
}

describe('exportMarkdown structure escaping', () => {
  it('keeps a newline in an objective title from forging a new heading', () => {
    const md = exportMarkdown(
      's1',
      [objectiveNode({ title: 'Real objective\n## Forged heading' }), objectiveNode({ id: 'a', title: 'child' })],
      [edge('r', 'a')],
    );
    // Exactly ONE heading line may mention the injected text, and it must be
    // the MERGED heading — the `\n## ` rendered as inline text, never as a
    // new heading on its own line.
    const headings: string[] = md.match(/^## (.+)$/gm) ?? [];
    const forgedHeadings = headings.filter((h) => h.includes('Forged'));
    expect(forgedHeadings).toEqual(['## Real objective ## Forged heading']);
    expect(md).not.toContain('\n## Forged heading');
  });

  it('keeps a newline in a list-row title from forging a list item', () => {
    const md = exportMarkdown('s1', [objectiveNode(), terminalNode(' innocuous\n- forged item')], [edge('r', 'a')]);
    // Exactly one list row (the genuine node row): `contains` edges are
    // structural and do not render in Relationships. The injected `\n- `
    // became inline text INSIDE that row — never a second list item.
    expect(md.match(/^- /gm) ?? []).toHaveLength(1);
    expect(md).toContain('innocuous - forged item');
    expect(md).not.toContain('\n- forged item');
  });

  it('escapes a closing bracket so the task marker stays intact', () => {
    const md = exportMarkdown('s1', [objectiveNode(), approvalNode('weird] title')], [edge('r', 'a')]);
    expect(md).toContain('- [ ] **approval** — weird\\] title');
  });

  it('leaves benign titles byte-identical', () => {
    const md = exportMarkdown(
      's1',
      [objectiveNode({ title: 'Plan: add tests (fast)' }), gitNode('commit abc12345')],
      [edge('r', 'a')],
    );
    expect(md).toContain('## Plan: add tests (fast)');
    expect(md).toContain('- [ ] **git** — commit abc123');
  });
});

describe('exportDot remains quote-safe (regression)', () => {
  it('escapes quotes and newlines in DOT labels', () => {
    const dot = exportDot('s1', [objectiveNode({ title: 'has "quotes" and\nnewline' })], []);
    expect(dot).toContain('has \\"quotes\\" and newline');
  });
});
