/**
 * Workspace mode discovery and resolution for ZEUS agent personas.
 * Inspired by Roo-Code .roomodes and ZEUS .zeusmodes architectures (Ticket #74).
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_ZEUS_MODES } from '@shared/constants';
import type { ToolGroup, ZeusModeConfig } from '@shared/types';

const VALID_TOOL_GROUPS = new Set<ToolGroup>([
  'read',
  'edit',
  'command',
  'interactive',
  'memory',
  'browser',
]);

const SLUG_REGEX = /^[a-z0-9_-]{1,32}$/;

/** Candidate configuration file names searched in the workspace root in priority order. */
const MODE_FILE_CANDIDATES = [
  '.zeusmodes.json',
  '.zeusmodes',
  '.roomodes.json',
  '.roomodes',
];

/**
 * Safely parse and validate mode configurations from raw JSON text.
 * Defends against prototype pollution, malformed entries, and invalid tool groups.
 */
export function parseModesConfig(content: string): ZeusModeConfig[] {
  if (!content || !content.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  let rawList: unknown[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>).customModes)
  ) {
    rawList = (parsed as { customModes: unknown[] }).customModes;
  } else {
    return [];
  }

  const result: ZeusModeConfig[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;

    // Defense against prototype pollution
    const rec = item as Record<string, unknown>;
    const rawSlug = typeof rec.slug === 'string' ? rec.slug.trim().toLowerCase() : '';
    if (!rawSlug || !SLUG_REGEX.test(rawSlug)) continue;
    if (rawSlug === '__proto__' || rawSlug === 'constructor' || rawSlug === 'prototype') {
      continue;
    }

    const rawName = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!rawName || rawName.length > 64) continue;

    const rawRole =
      typeof rec.roleDefinition === 'string' ? rec.roleDefinition.trim() : '';
    if (!rawRole || rawRole.length > 4000) continue;

    const rawGroups = Array.isArray(rec.groups) ? rec.groups : [];
    const validGroups: ToolGroup[] = [];
    for (const g of rawGroups) {
      if (typeof g === 'string' && VALID_TOOL_GROUPS.has(g as ToolGroup)) {
        if (!validGroups.includes(g as ToolGroup)) {
          validGroups.push(g as ToolGroup);
        }
      }
    }
    if (validGroups.length === 0) continue;

    const customInstructions =
      typeof rec.customInstructions === 'string' && rec.customInstructions.trim()
        ? rec.customInstructions.trim().slice(0, 4000)
        : undefined;

    result.push({
      slug: rawSlug,
      name: rawName,
      roleDefinition: rawRole,
      groups: validGroups,
      ...(customInstructions ? { customInstructions } : {}),
    });
  }

  return result;
}

/**
 * Load workspace custom modes from `.zeusmodes` or `.roomodes`, merging them with default modes.
 */
export function loadWorkspaceModes(workspaceRoot: string): ZeusModeConfig[] {
  let customModes: ZeusModeConfig[] = [];

  for (const candidate of MODE_FILE_CANDIDATES) {
    const fullPath = path.join(workspaceRoot, candidate);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const parsed = parseModesConfig(content);
        if (parsed.length > 0) {
          customModes = parsed;
          break;
        }
      }
    } catch {
      // Best-effort file read
    }
  }

  // Merge defaults with custom modes:
  // Custom modes override defaults with the same slug; new slugs are appended.
  const mergedMap = new Map<string, ZeusModeConfig>();

  for (const defaultMode of DEFAULT_ZEUS_MODES) {
    mergedMap.set(defaultMode.slug, { ...defaultMode });
  }

  for (const customMode of customModes) {
    mergedMap.set(customMode.slug, customMode);
  }

  return Array.from(mergedMap.values());
}

/**
 * Resolve the active persona mode configuration based on the provided mode slug
 * or legacy composer permission mode ('plan' -> 'architect', 'ask' -> 'ask', etc.).
 */
export function resolveActiveMode(
  modeOrSlug?: string,
  availableModes: readonly ZeusModeConfig[] = DEFAULT_ZEUS_MODES,
): ZeusModeConfig {
  const normalized = (modeOrSlug ?? '').trim().toLowerCase();

  // Mapping from composer permission modes to standard personas
  let targetSlug = normalized;
  if (normalized === 'plan') {
    targetSlug = 'architect';
  } else if (normalized === 'ask') {
    targetSlug = 'ask';
  } else if (
    !normalized ||
    normalized === 'default' ||
    normalized === 'acceptedits' ||
    normalized === 'implement'
  ) {
    targetSlug = 'code';
  }

  const match = availableModes.find((m) => m.slug.toLowerCase() === targetSlug);
  if (match) return match;

  // Fallback to default 'code' mode or the first available mode
  const codeDefault = availableModes.find((m) => m.slug === 'code');
  if (codeDefault) return codeDefault;

  return availableModes[0] ?? DEFAULT_ZEUS_MODES[0];
}
