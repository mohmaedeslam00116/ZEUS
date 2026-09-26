import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseModesConfig,
  loadWorkspaceModes,
  resolveActiveMode,
} from './modeDiscovery';
import { DEFAULT_ZEUS_MODES } from '@shared/constants';
import type { ZeusModeConfig } from '@shared/types';

describe('modeDiscovery', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-modes-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('parseModesConfig', () => {
    it('parses array of modes in JSON format', () => {
      const json = JSON.stringify([
        {
          slug: 'custom-auditor',
          name: 'Security Auditor',
          roleDefinition: 'Audit code for security vulnerabilities.',
          groups: ['read', 'memory'],
          customInstructions: 'Never execute shell commands.',
        },
      ]);

      const modes = parseModesConfig(json);
      expect(modes.length).toBe(1);
      expect(modes[0].slug).toBe('custom-auditor');
      expect(modes[0].name).toBe('Security Auditor');
      expect(modes[0].roleDefinition).toBe('Audit code for security vulnerabilities.');
      expect(modes[0].groups).toEqual(['read', 'memory']);
      expect(modes[0].customInstructions).toBe('Never execute shell commands.');
    });

    it('parses Roo-Code customModes object schema', () => {
      const json = JSON.stringify({
        customModes: [
          {
            slug: 'qa-tester',
            name: 'QA Tester',
            roleDefinition: 'Run integration test suites.',
            groups: ['read', 'command'],
          },
        ],
      });

      const modes = parseModesConfig(json);
      expect(modes.length).toBe(1);
      expect(modes[0].slug).toBe('qa-tester');
      expect(modes[0].groups).toEqual(['read', 'command']);
    });

    it('filters out invalid tool groups and drops modes without valid groups', () => {
      const json = JSON.stringify([
        {
          slug: 'valid-mode',
          name: 'Valid Mode',
          roleDefinition: 'Role text.',
          groups: ['read', 'invalid_group_xyz', 'edit'],
        },
        {
          slug: 'empty-groups',
          name: 'Empty Groups',
          roleDefinition: 'Role text.',
          groups: ['unknown_only'],
        },
      ]);

      const modes = parseModesConfig(json);
      expect(modes.length).toBe(1);
      expect(modes[0].slug).toBe('valid-mode');
      expect(modes[0].groups).toEqual(['read', 'edit']);
    });

    it('defends against prototype pollution keys', () => {
      const maliciousJson = '{"__proto__": {"admin": true}, "customModes": [{"slug": "clean", "name": "Clean", "roleDefinition": "Clean role", "groups": ["read"]}]}';
      const modes = parseModesConfig(maliciousJson);
      expect(modes.length).toBe(1);
      expect((Object.prototype as Record<string, unknown>).admin).toBeUndefined();
    });

    it('returns empty array on malformed JSON or empty string', () => {
      expect(parseModesConfig('{ malformed json')).toEqual([]);
      expect(parseModesConfig('')).toEqual([]);
      expect(parseModesConfig('   ')).toEqual([]);
    });

    it('rejects entries with missing required fields or invalid slugs', () => {
      const json = JSON.stringify([
        { slug: '', name: 'No slug', roleDefinition: 'Role', groups: ['read'] },
        { slug: 'invalid slug with spaces', name: 'Spaces', roleDefinition: 'Role', groups: ['read'] },
        { slug: 'no-role', name: 'No Role', roleDefinition: '', groups: ['read'] },
        { slug: 'no-name', name: '', roleDefinition: 'Role', groups: ['read'] },
      ]);

      expect(parseModesConfig(json)).toEqual([]);
    });
  });

  describe('loadWorkspaceModes', () => {
    it('returns default modes when no workspace file exists', () => {
      const modes = loadWorkspaceModes(tmpDir);
      expect(modes.map((m) => m.slug)).toEqual(['code', 'architect', 'ask', 'test']);
    });

    it('loads and merges custom modes from .zeusmodes.json', () => {
      const customConfig = [
        {
          slug: 'architect', // overrides default architect
          name: 'Enterprise Architect',
          roleDefinition: 'Enforce enterprise ADRs.',
          groups: ['read'],
        },
        {
          slug: 'researcher', // adds new mode
          name: 'Docs Researcher',
          roleDefinition: 'Research docs and gather facts.',
          groups: ['read', 'interactive'],
        },
      ];
      fs.writeFileSync(path.join(tmpDir, '.zeusmodes.json'), JSON.stringify(customConfig), 'utf-8');

      const modes = loadWorkspaceModes(tmpDir);
      expect(modes.some((m) => m.slug === 'researcher')).toBe(true);

      const architect = modes.find((m) => m.slug === 'architect');
      expect(architect?.name).toBe('Enterprise Architect');
      expect(architect?.roleDefinition).toBe('Enforce enterprise ADRs.');

      // Unmodified defaults remain present
      expect(modes.some((m) => m.slug === 'code')).toBe(true);
      expect(modes.some((m) => m.slug === 'ask')).toBe(true);
      expect(modes.some((m) => m.slug === 'test')).toBe(true);
    });

    it('falls back to .roomodes when .zeusmodes is absent', () => {
      const rooConfig = {
        customModes: [
          {
            slug: 'designer',
            name: 'UI Designer',
            roleDefinition: 'Design interfaces.',
            groups: ['read'],
          },
        ],
      };
      fs.writeFileSync(path.join(tmpDir, '.roomodes'), JSON.stringify(rooConfig), 'utf-8');

      const modes = loadWorkspaceModes(tmpDir);
      expect(modes.some((m) => m.slug === 'designer')).toBe(true);
    });
  });

  describe('resolveActiveMode', () => {
    it('maps permission modes to corresponding persona modes', () => {
      expect(resolveActiveMode('plan').slug).toBe('architect');
      expect(resolveActiveMode('ask').slug).toBe('ask');
      expect(resolveActiveMode('default').slug).toBe('code');
      expect(resolveActiveMode('acceptEdits').slug).toBe('code');
      expect(resolveActiveMode('implement').slug).toBe('code');
      expect(resolveActiveMode(undefined).slug).toBe('code');
    });

    it('resolves direct mode slugs from available modes', () => {
      const customModes: ZeusModeConfig[] = [
        ...DEFAULT_ZEUS_MODES,
        {
          slug: 'auditor',
          name: 'Auditor',
          roleDefinition: 'Audit',
          groups: ['read'],
        },
      ];

      expect(resolveActiveMode('test', customModes).slug).toBe('test');
      expect(resolveActiveMode('auditor', customModes).slug).toBe('auditor');
      expect(resolveActiveMode('unknown-slug', customModes).slug).toBe('code');
    });
  });
});
