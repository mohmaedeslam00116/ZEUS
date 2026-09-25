/**
 * Layer 1 Security: Workspace Boundary & Path Traversal Guard (SEC-11, SEC-12, SEC-14).
 * Rejects path traversal attempts, null bytes, out-of-boundary resolutions, and crown jewel targets.
 */
import path from 'node:path';
import fs from 'node:fs';
import { isInsideRoot } from '../../../workspace/validate';
import { crownJewelPaths } from '../../../sandbox/policy';

/**
 * Screen if a path touches or resolves inside ZEUS crown jewels (SEC-14).
 */
export function isCrownJewel(targetPath: string): boolean {
  try {
    const jewels = crownJewelPaths();
    const db = jewels.find((p) => p.endsWith('zeus.db'));
    const extra = db ? [db + '-wal', db + '-shm'] : [];
    const allJewels = [...jewels, ...extra];
    const resolvedTarget = path.resolve(targetPath);
    let realTarget = resolvedTarget;
    try {
      realTarget = fs.realpathSync(resolvedTarget);
    } catch {
      // file might not exist yet, use resolved
    }

    const hit = (candidate: string) =>
      allJewels.some((jewel) => {

        const resolvedJewel = path.resolve(jewel);
        let realJewel = resolvedJewel;
        try {
          realJewel = fs.realpathSync(resolvedJewel);
        } catch {
          // ignore
        }
        return (
          candidate.toLowerCase() === resolvedJewel.toLowerCase() ||
          candidate.toLowerCase() === realJewel.toLowerCase() ||
          candidate.toLowerCase().startsWith(resolvedJewel.toLowerCase() + path.sep) ||
          candidate.toLowerCase().startsWith(realJewel.toLowerCase() + path.sep)
        );
      });

    return hit(resolvedTarget) || hit(realTarget);
  } catch {
    return false;
  }
}

/**
 * Validates and resolves a target path within the workspace root.
 * Throws an Error if the path is invalid, escapes the root, or targets crown jewels.
 */
export function assertInsideWorkspace(workspaceRoot: string, targetPath: string): string {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('Path cannot be empty');
  }

  if (targetPath.length > 4096) {
    throw new Error('Path exceeds maximum length of 4096 characters');
  }

  if (targetPath.includes('\0')) {
    throw new Error('Path contains invalid null byte');
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);

  // Check if target escapes the workspace root
  if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
    throw new Error(`Access denied: path escapes workspace boundaries (${targetPath})`);
  }

  // Check symlink realpath escape if file/directory exists
  try {
    if (fs.existsSync(resolvedTarget)) {
      const realTarget = fs.realpathSync(resolvedTarget);
      let realRoot = resolvedRoot;
      try {
        realRoot = fs.realpathSync(resolvedRoot);
      } catch {
        // keep resolvedRoot
      }
      if (!isInsideRoot(realRoot, realTarget)) {
        throw new Error(`Access denied: symlink resolves outside workspace boundaries (${targetPath})`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Access denied')) {
      throw err;
    }
    // ignore filesystem check failure on non-existent paths
  }

  // Check crown jewels protection (SEC-14)
  if (isCrownJewel(resolvedTarget)) {
    throw new Error(`Access denied: path targets protected system crown jewels (${targetPath})`);
  }

  return resolvedTarget;
}
