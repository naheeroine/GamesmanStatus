/**
 * SQLite client + schema + helpers for writing probe results.
 * Uses better-sqlite3 (sync, simple, fast).
 */
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";

export type RawResultRow = {
  ts: number;                 // epoch ms
  probe_id: string;           // e.g., "api-root"
  http_code: number | null;   // 200, 404, etc (null on network error)
  ok: 0 | 1;                  // 1 if request+asserts pass, else 0
  latency_ms: number;         // measured latency
  error: string | null;       // error message if any
};

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH ?? "./data/gamesmanstatus.sqlite";
  // ensure data directory exists
  try {
    mkdirSync(new URL(".", new URL(`file://${process.cwd()}/${dbPath}`)).pathname, { recursive: true });
  } catch {
    // If URL trick is weird on some shells, fallback to generic:
    try { mkdirSync("data", { recursive: true }); } catch {}
  }

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

export function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS results_raw (
      ts           INTEGER NOT NULL,
      probe_id     TEXT    NOT NULL,
      http_code    INTEGER,
      ok           INTEGER NOT NULL,
      latency_ms   INTEGER NOT NULL,
      error        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_results_raw_probe_ts
      ON results_raw(probe_id, ts);
  `);
}

/** Insert many rows in one transaction. Returns number inserted. */
export function insertResults(db: Database.Database, rows: RawResultRow[]): number {
  if (!rows.length) return 0;
  const insert = db.prepare(`
    INSERT INTO results_raw (ts, probe_id, http_code, ok, latency_ms, error)
    VALUES (@ts, @probe_id, @http_code, @ok, @latency_ms, @error)
  `);
  const trx = db.transaction((batch: RawResultRow[]) => {
    for (const r of batch) insert.run(r);
  });
  trx(rows);
  return rows.length;
}
