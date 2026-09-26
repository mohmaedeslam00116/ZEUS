/**
 * Sandboxed Browser Action Lifecycle Manager (SEC-01, SEC-18, Ticket #77).
 *
 * Manages offscreen browser sessions scoped to agent session IDs, ensuring
 * proper cleanup, memory reclamation, and resource boundaries.
 */
import { BrowserSession } from './BrowserSession';
import { logger } from '../../logger';

export class BrowserActionManager {
  private sessions = new Map<string, BrowserSession>();

  /**
   * Retrieves or creates a sandboxed BrowserSession for a given agent session.
   */
  getOrCreateSession(sessionId: string): BrowserSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = new BrowserSession(sessionId);
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Closes and cleans up an active browser session for a given agent session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      try {
        await session.close();
      } catch (err) {
        logger.warn(`[BrowserActionManager] Error closing browser session "${sessionId}": ${err}`);
      }
    }
  }

  /**
   * Disposes all active browser sessions and cleans up memory partitions.
   */
  async dispose(): Promise<void> {
    const active = Array.from(this.sessions.values());
    this.sessions.clear();
    await Promise.allSettled(active.map((s) => s.close()));
  }
}

let instance: BrowserActionManager | null = null;

export function getBrowserActionManager(): BrowserActionManager {
  if (!instance) {
    instance = new BrowserActionManager();
  }
  return instance;
}
