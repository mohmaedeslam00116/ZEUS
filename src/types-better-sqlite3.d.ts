/**
 * Ambient declarations for `better-sqlite3` — the one runtime dependency
 * without bundled or DefinitelyTyped types available for our version line.
 *
 * Scope note (bounded upgrade, Issue #10): this is deliberately NOT a full
 * type port of the library. It declares exactly the surface ZEUS's code
 * exercises so `tsc --noEmit` can pass with `noImplicitAny`; row types from
 * `get`/`all` are deliberately `any` (the library's shape is data-driven and
 * every caller already narrows with explicit `as` casts). Mirrors the
 * class + namespace merge shape of the official @types package so the
 * existing `Database.Database` / `Database.RunResult` usage keeps compiling.
 */
declare module 'better-sqlite3' {
  export = Database;

  class Database implements Database.Database {
    constructor(filename: string, options?: Record<string, unknown>);
    open: boolean;
    inTransaction: boolean;
    pragma(source: string, options?: Record<string, unknown>): unknown;
    prepare(sql: string): Database.Statement;
    exec(sql: string): unknown;
    transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
    close(): unknown;
  }

  namespace Database {
    /** The instance type (what `new Database(...)` returns). */
    export interface Database {
      open: boolean;
      inTransaction: boolean;
      pragma(source: string, options?: Record<string, unknown>): unknown;
      prepare(sql: string): Statement;
      exec(sql: string): unknown;
      transaction(fn: (...args: unknown[]) => unknown): (...args: unknown[]) => unknown;
      close(): unknown;
    }

    export interface RunResult {
      /** Matches @types/better-sqlite3: `changes` is a plain number. */
      changes: number;
      lastInsertRowid: number | bigint;
    }

    export interface Statement {
      run(...params: unknown[]): RunResult;
      /** Data-driven row shape; callers narrow explicitly (cast or validate). */
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      iterate(...params: unknown[]): IterableIterator<unknown>;
      raw(mode?: boolean): unknown;
      finalize(): unknown;
    }
  }
}
