/**
 * Extended Code Navigation: view_code_symbols (Spec #67 / Issues #72 & #79).
 * Extracts structural declarations (classes, interfaces, functions, methods, types) from code files.
 */
import fs from 'node:fs';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';
import { assertInsideWorkspace } from './pathGuard';

export type SymbolKind = 'all' | 'function' | 'class' | 'interface' | 'type' | 'method';

const VALID_KINDS: SymbolKind[] = ['all', 'function', 'class', 'interface', 'type', 'method'];

const MAX_SYMBOLS_CEILING = NATIVE_RUNTIME_LIMITS.navigation.codeSymbolsMaxCount;
const MAX_FILE_SIZE = NATIVE_RUNTIME_LIMITS.navigation.codeSymbolsMaxFileSize;

interface ExtractedSymbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'method';
  line: number;
  signature?: string;
}

export const viewCodeSymbolsTool: NativeTool = {
  name: 'view_code_symbols',
  description:
    'Extract declarations (classes, interfaces, methods, functions, exported types) from a source file. ' +
    'Allows rapid structural understanding of file architecture without reading hundreds of lines of implementation.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Relative path of the source file to extract symbols from.',
      },
      kind: {
        type: 'string',
        enum: [...VALID_KINDS],
        description: 'Optional symbol kind filter. Defaults to "all".',
      },
    },
    required: ['path'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawPath = input.path;
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      return {
        success: false,
        output: 'Error: "path" must be a non-empty string.',
        error: 'Invalid path',
      };
    }
    const cleanPath = rawPath.trim();

    const rawKind = input.kind ?? 'all';
    if (!VALID_KINDS.includes(rawKind as SymbolKind)) {
      return {
        success: false,
        output: `Error: invalid kind "${rawKind}". Must be one of: ${VALID_KINDS.join(', ')}`,
        error: 'Invalid kind',
      };
    }
    const kindFilter = rawKind as SymbolKind;

    let targetFile: string;
    try {
      targetFile = assertInsideWorkspace(context.workspaceRoot, cleanPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: msg, error: msg };
    }

    let content: string;
    try {
      const stat = await fs.promises.stat(targetFile);
      if (stat.isDirectory()) {
        return {
          success: false,
          output: `Error: "${cleanPath}" is a directory. view_code_symbols operates on source files.`,
          error: 'Path is a directory',
        };
      }
      if (stat.size > MAX_FILE_SIZE) {
        return {
          success: false,
          output: `Error: file "${cleanPath}" exceeds size limit of ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB for symbol extraction.`,
          error: 'File too large',
        };
      }
      content = await fs.promises.readFile(targetFile, 'utf8');
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        return {
          success: false,
          output: `File not found: "${cleanPath}"`,
          error: 'File not found',
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, output: `Cannot read file: ${msg}`, error: msg };
    }

    const lineOffsets: number[] = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') {
        lineOffsets.push(i + 1);
      }
    }

    function getLineNumber(charIndex: number): number {
      let low = 0;
      let high = lineOffsets.length - 1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lineOffsets[mid] <= charIndex) {
          if (mid === lineOffsets.length - 1 || lineOffsets[mid + 1] > charIndex) {
            return mid + 1;
          }
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return 1;
    }

    function getDeclarationLine(matchIndex: number, matchedText: string): number {
      const offset = matchedText.startsWith('\n') ? 1 : 0;
      return getLineNumber(matchIndex + offset);
    }

    const symbols: ExtractedSymbol[] = [];

    // 1. Classes
    const classRe = /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/g;
    let match: RegExpExecArray | null;
    while ((match = classRe.exec(content)) !== null) {
      const name = match[1];
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'class', line, signature: `class ${name}` });
    }

    // 2. Interfaces
    const interfaceRe = /(?:^|\n)[ \t]*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/g;
    while ((match = interfaceRe.exec(content)) !== null) {
      const name = match[1];
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'interface', line, signature: `interface ${name}` });
    }

    // 3. Types
    const typeRe = /(?:^|\n)[ \t]*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/g;
    while ((match = typeRe.exec(content)) !== null) {
      const name = match[1];
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'type', line, signature: `type ${name}` });
    }

    // 4. Functions (Standard & Python)
    const fnRe = /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g;
    while ((match = fnRe.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'function', line, signature: `function ${name}(${params})` });
    }

    const pyDefRe = /(?:^|\n)[ \t]*def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\):/g;
    while ((match = pyDefRe.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'function', line, signature: `def ${name}(${params})` });
    }

    // 5. Arrow functions assigned to const / let
    const arrowRe = /(?:^|\n)[ \t]*(?:export\s+)?(?:const|let)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=>]+)?\s*=>/g;
    while ((match = arrowRe.exec(content)) !== null) {
      const name = match[1];
      const params = match[2].trim();
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'function', line, signature: `const ${name} = (${params}) => ...` });
    }

    // 6. Methods (indented functions inside class/object)
    const methodRe = /(?:^|\n)[ \t]+(?:public|private|protected|static|async|\*)*\s*([A-Za-z0-9_$]+)\s*\(([^)]*)\)\s*(?::\s*[^{;\n]+)?\s*\{/g;
    while ((match = methodRe.exec(content)) !== null) {
      const name = match[1];
      if (['if', 'for', 'while', 'switch', 'catch', 'constructor'].includes(name)) continue;
      const params = match[2].trim();
      const line = getDeclarationLine(match.index, match[0]);
      symbols.push({ name, kind: 'method', line, signature: `${name}(${params})` });
    }

    // Deduplicate by line & name, sort by line
    const seen = new Set<string>();
    const uniqueSymbols = symbols.filter((s) => {
      const key = `${s.line}:${s.name}:${s.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    uniqueSymbols.sort((a, b) => a.line - b.line);

    // Apply kind filter
    const filtered = kindFilter === 'all'
      ? uniqueSymbols
      : uniqueSymbols.filter((s) => s.kind === kindFilter);

    if (filtered.length === 0) {
      return {
        success: true,
        output: `No symbols found in "${cleanPath}"${kindFilter !== 'all' ? ` matching kind "${kindFilter}"` : ''}.`,
      };
    }

    const truncated = filtered.length > MAX_SYMBOLS_CEILING;
    const boundedList = filtered.slice(0, MAX_SYMBOLS_CEILING);

    const formatted = boundedList
      .map((s) => `  - [${s.kind}] ${s.signature ?? s.name} (line ${s.line})`)
      .join('\n');

    let output = `Symbols in ${cleanPath} (${filtered.length} found):\n${formatted}`;
    if (truncated) {
      output += `\n... [truncated at ${MAX_SYMBOLS_CEILING} symbols (XP-01 ceiling)]`;
    }

    return {
      success: true,
      output,
    };
  },
};
