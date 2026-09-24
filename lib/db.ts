import "server-only"
import { DatabaseSync } from "node:sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { deriveStatus, type Category, type Spot } from "./categories"
import type { NewSpot } from "./validation"

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "deathspot.db")
const SEED_PATH = path.join(process.cwd(), "data", "seed.json")

// Seed spots come from public reports, so they start out confirmed.
const SEED_CONFIRMATIONS = 3

const globalForDb = globalThis as unknown as { deathspotDb?: DatabaseSync }

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  const db = new DatabaseSync(DB_PATH)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      severity INTEGER NOT NULL,
      time_of_day TEXT NOT NULL DEFAULT 'any',
      incident_date TEXT,
      source_url TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      last_confirmed_at TEXT,
      confirmations INTEGER NOT NULL DEFAULT 0,
      denials INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'unverified',
      seeded INTEGER NOT NULL DEFAULT 0,
      reporter_hash TEXT
    );
    CREATE INDEX IF NOT EXISTS spots_latlng ON spots(lat, lng);
    CREATE TABLE IF NOT EXISTS votes (
      spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
      voter_hash TEXT NOT NULL,
      value INTEGER NOT NULL CHECK (value IN (-1, 1)),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      PRIMARY KEY (spot_id, voter_hash)
    );
  `)
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM spots").get() as { n: number }
  if (n === 0) seed(db)
  return db
}

export function seed(db: DatabaseSync) {
  const { spots } = JSON.parse(readFileSync(SEED_PATH, "utf8")) as {
    spots: (Omit<NewSpot, "incident_date" | "source_url"> & {
      incident_date?: string
      source_url?: string
    })[]
  }
  const insert = db.prepare(`
    INSERT INTO spots (title, description, lat, lng, area, category, severity, time_of_day,
      incident_date, source_url, confirmations, status, seeded, last_confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `)
  db.exec("BEGIN")
  try {
    for (const s of spots) {
      insert.run(s.title, s.description ?? "", s.lat, s.lng, s.area ?? "", s.category, s.severity,
        s.time_of_day ?? "any", s.incident_date ?? null, s.source_url ?? null, SEED_CONFIRMATIONS)
    }
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
}

export function getDb() {
  return (globalForDb.deathspotDb ??= open())
}

type Row = Omit<Spot, "seeded"> & { seeded: number }
const toSpot = ({ seeded, ...r }: Row): Spot => ({ ...r, seeded: seeded === 1 })

const PUBLIC_COLUMNS = `id, title, description, lat, lng, area, category, severity, time_of_day,
  incident_date, source_url, created_at, last_confirmed_at, confirmations, denials, status, seeded`

export function listSpots(filter: { category?: Category; sinceDays?: number } = {}) {
  const where: string[] = []
  const args: (string | number)[] = []
  if (filter.category) {
    where.push("category = ?")
    args.push(filter.category)
  }
  if (filter.sinceDays) {
    where.push("created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now', ?)")
    args.push(`-${filter.sinceDays} days`)
  }
  const sql = `SELECT ${PUBLIC_COLUMNS} FROM spots ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY severity DESC, id DESC`
  return (getDb().prepare(sql).all(...args) as Row[]).map(toSpot)
}

export function getSpot(id: number) {
  const row = getDb().prepare(`SELECT ${PUBLIC_COLUMNS} FROM spots WHERE id = ?`).get(id) as Row | undefined
  return row ? toSpot(row) : null
}

export function createSpot(s: NewSpot, reporterHash: string) {
  const db = getDb()
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO spots (title, description, lat, lng, area, category, severity, time_of_day,
      incident_date, source_url, reporter_hash, confirmations, last_confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`)
    .run(s.title, s.description, s.lat, s.lng, s.area, s.category, s.severity, s.time_of_day,
      s.incident_date ?? null, s.source_url || null, reporterHash)
  const id = Number(lastInsertRowid)
  // The reporter's own report counts as their confirmation vote.
  db.prepare("INSERT INTO votes (spot_id, voter_hash, value) VALUES (?, ?, 1)").run(id, reporterHash)
  return getSpot(id)!
}

export type VoteResult = { ok: true; spot: Spot } | { ok: false; reason: "not_found" | "already_voted" }

export function vote(spotId: number, voterHash: string, value: 1 | -1): VoteResult {
  const db = getDb()
  if (!getSpot(spotId)) return { ok: false, reason: "not_found" }
  db.exec("BEGIN")
  try {
    const prev = db
      .prepare("SELECT value FROM votes WHERE spot_id = ? AND voter_hash = ?")
      .get(spotId, voterHash) as { value: number } | undefined
    if (prev?.value === value) {
      db.exec("ROLLBACK")
      return { ok: false, reason: "already_voted" }
    }
    if (prev) {
      // Changing a vote: undo the previous one first.
      db.prepare(`UPDATE spots SET ${prev.value === 1 ? "confirmations" : "denials"} =
        ${prev.value === 1 ? "confirmations" : "denials"} - 1 WHERE id = ?`).run(spotId)
    }
    db.prepare(`INSERT INTO votes (spot_id, voter_hash, value) VALUES (?, ?, ?)
      ON CONFLICT(spot_id, voter_hash) DO UPDATE SET value = excluded.value,
      created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(spotId, voterHash, value)
    db.prepare(value === 1
      ? "UPDATE spots SET confirmations = confirmations + 1, last_confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
      : "UPDATE spots SET denials = denials + 1 WHERE id = ?").run(spotId)
    const { confirmations, denials } = db
      .prepare("SELECT confirmations, denials FROM spots WHERE id = ?")
      .get(spotId) as { confirmations: number; denials: number }
    db.prepare("UPDATE spots SET status = ? WHERE id = ?").run(deriveStatus(confirmations, denials), spotId)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  return { ok: true, spot: getSpot(spotId)! }
}

export function getMyVotes(voterHash: string) {
  const rows = getDb()
    .prepare("SELECT spot_id, value FROM votes WHERE voter_hash = ?")
    .all(voterHash) as { spot_id: number; value: number }[]
  return Object.fromEntries(rows.map((r) => [r.spot_id, r.value]))
}

export function getStats() {
  const db = getDb()
  const byCategory = db
    .prepare("SELECT category, COUNT(*) AS count FROM spots WHERE status != 'disputed' GROUP BY category ORDER BY count DESC")
    .all() as { category: Category; count: number }[]
  const byArea = db
    .prepare("SELECT area, COUNT(*) AS count, MAX(severity) AS max_severity FROM spots WHERE status != 'disputed' AND area != '' GROUP BY area ORDER BY count DESC, max_severity DESC LIMIT 8")
    .all() as { area: string; count: number; max_severity: number }[]
  const totals = db
    .prepare(`SELECT COUNT(*) AS total,
      SUM(status = 'confirmed') AS confirmed,
      SUM(status = 'unverified') AS unverified,
      SUM(created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days') AND seeded = 0) AS this_week
      FROM spots`)
    .get() as { total: number; confirmed: number; unverified: number; this_week: number }
  return { byCategory, byArea, totals }
}
