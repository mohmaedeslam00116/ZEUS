/**
 * MCP server-input validation — the audit finding: `isUnsafeKey` existed but
 * `validatePairs` never called it, so a renderer-supplied `__proto__` /
 * `constructor` / `prototype` env or header key was merged into the persisted
 * definition. These tests pin the guard at the `prepareServer` boundary.
 */
import { describe, expect, it } from 'vitest';

import { prepareServer } from './validate';

function stdioInput(): Parameters<typeof prepareServer>[0] {
  return {
    name: 'test-server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  } as Parameters<typeof prepareServer>[0];
}

const OPTS = { defaultTrust: 'ask', defaultPlanAccess: 'annotated' } as const;

describe('prepareServer prototype-pollution key filtering', () => {
  it('rejects a __proto__ env key', () => {
    // Via JSON.parse — the shape untrusted JSON actually produces: an object
    // literal's `__proto__:` key silently assigns the prototype instead of
    // creating an own property, so it could never exercise the guard.
    const input = {
      ...stdioInput(),
      env: JSON.parse('{"__proto__":"evil"}'),
    } as unknown as Parameters<typeof prepareServer>[0];
    expect(() => prepareServer(input, OPTS)).toThrow('Invalid environment key.');
  });

  it('rejects a constructor header key', () => {
    const input = {
      ...stdioInput(),
      headers: JSON.parse('{"constructor":"evil"}'),
    } as unknown as Parameters<typeof prepareServer>[0];
    expect(() => prepareServer(input, OPTS)).toThrow('Invalid header key.');
  });

  it('rejects a prototype secret-env key', () => {
    const input = {
      ...stdioInput(),
      secretEnv: JSON.parse('{"prototype":"evil"}'),
    } as unknown as Parameters<typeof prepareServer>[0];
    expect(() => prepareServer(input, OPTS)).toThrow('Invalid environment key.');
  });

  it('keeps ordinary keys and values untouched', () => {
    const input = {
      ...stdioInput(),
      env: { NODE_ENV: 'production' },
      headers: { 'X-Custom': 'yes' },
    } as Parameters<typeof prepareServer>[0];
    const out = prepareServer(input, OPTS);
    expect(out.env).toEqual({ NODE_ENV: { value: 'production', secret: false } });
    expect(out.headers).toEqual({ 'X-Custom': { value: 'yes', secret: false } });
  });
});
