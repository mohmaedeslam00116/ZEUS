/**
 * Unified Diff Computation for file editing preview and review.
 * Produces standard unified diff format compatible with git and UI diff viewers.
 */

/**
 * Computes a standard unified diff between oldContent and newContent.
 * @param filePath Normalized relative or display file path
 * @param oldContent Content of the file before editing
 * @param newContent Content of the file after editing
 * @param contextLines Number of context lines around changes (default: 3)
 */
export function computeUnifiedDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
  contextLines = 3,
): string {
  const normPath = filePath.replace(/\\/g, '/');
  if (oldContent === newContent) {
    return '';
  }

  const oldLines = oldContent.length === 0 ? [] : oldContent.split(/\r?\n/);
  const newLines = newContent.length === 0 ? [] : newContent.split(/\r?\n/);

  // Compute Longest Common Subsequence (LCS) matrix
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (oldLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff ops
  type DiffOp = { type: 'context' | 'delete' | 'add'; line: string };
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ type: 'context', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', line: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.unshift({ type: 'delete', line: oldLines[i - 1] });
      i--;
    }
  }

  // Group operations into hunks with context
  interface Hunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: string[];
  }

  const hunks: Hunk[] = [];
  let currentHunk: Hunk | null = null;
  let consecutiveContext = 0;

  // Track original and new 1-based line counters
  let oldLineNum = 1;
  let newLineNum = 1;

  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    const isChange = op.type === 'delete' || op.type === 'add';

    if (isChange) {
      if (!currentHunk) {
        // Start new hunk, including preceding context up to contextLines
        const leadContextStart = Math.max(0, idx - contextLines);
        const leadContext = ops.slice(leadContextStart, idx);

        const hunkOldStart = oldLineNum - leadContext.length;
        const hunkNewStart = newLineNum - leadContext.length;


        currentHunk = {
          oldStart: Math.max(1, hunkOldStart),
          oldCount: 0,
          newStart: Math.max(1, hunkNewStart),
          newCount: 0,
          lines: [],
        };

        for (const ctx of leadContext) {
          currentHunk.lines.push(` ${ctx.line}`);
          currentHunk.oldCount++;
          currentHunk.newCount++;
        }
      }

      if (op.type === 'delete') {
        currentHunk.lines.push(`-${op.line}`);
        currentHunk.oldCount++;
        oldLineNum++;
      } else {
        currentHunk.lines.push(`+${op.line}`);
        currentHunk.newCount++;
        newLineNum++;
      }
      consecutiveContext = 0;
    } else {
      // Context line
      if (currentHunk) {
        consecutiveContext++;
        currentHunk.lines.push(` ${op.line}`);
        currentHunk.oldCount++;
        currentHunk.newCount++;

        // If we reach 2 * contextLines without changes, close current hunk
        if (consecutiveContext >= contextLines * 2) {
          // Trim excess context from end of hunk
          const excess = consecutiveContext - contextLines;
          currentHunk.lines.splice(currentHunk.lines.length - excess, excess);
          currentHunk.oldCount -= excess;
          currentHunk.newCount -= excess;
          hunks.push(currentHunk);
          currentHunk = null;
          consecutiveContext = 0;
        }
      }
      oldLineNum++;
      newLineNum++;
    }
  }

  if (currentHunk) {
    if (consecutiveContext > contextLines) {
      const excess = consecutiveContext - contextLines;
      currentHunk.lines.splice(currentHunk.lines.length - excess, excess);
      currentHunk.oldCount -= excess;
      currentHunk.newCount -= excess;
    }
    hunks.push(currentHunk);
  }

  if (hunks.length === 0) {
    return '';
  }

  const result: string[] = [
    `--- a/${normPath}`,
    `+++ b/${normPath}`,
  ];

  for (const h of hunks) {
    result.push(`@@ -${h.oldStart},${h.oldCount} +${h.newStart},${h.newCount} @@`);
    result.push(...h.lines);
  }

  return result.join('\n');
}
