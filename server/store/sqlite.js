import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS passwords (
    code TEXT PRIMARY KEY,
    max_uses INTEGER NOT NULL DEFAULT 3,
    used_count INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed INTEGER NOT NULL DEFAULT 0,
    unlocked INTEGER NOT NULL DEFAULT 0,
    answers TEXT,
    result TEXT,
    episode INTEGER,
    archetype TEXT,
    total REAL,
    attempt_no INTEGER NOT NULL DEFAULT 1,
    contact_name TEXT,
    contact_phone TEXT,
    contact_wechat TEXT,
    rebate_claimed INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
`);

// 兼容旧库：已存在的 sessions 表补上 attempt_no 列
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all();
if (!sessionCols.some((c) => c.name === 'attempt_no')) {
  db.exec('ALTER TABLE sessions ADD COLUMN attempt_no INTEGER NOT NULL DEFAULT 1');
}

export const store = {
  driver: 'sqlite',

  reservePassword(code) {
    const clean = String(code || '').trim().toUpperCase();
    const info = db
      .prepare('UPDATE passwords SET used_count = used_count + 1 WHERE code = ? AND used_count < max_uses')
      .run(clean);
    if (info.changes === 0) {
      const row = db.prepare('SELECT * FROM passwords WHERE code = ?').get(clean);
      return { ok: false, reason: row ? 'exhausted' : 'invalid', row: row || null };
    }
    const row = db.prepare('SELECT * FROM passwords WHERE code = ?').get(clean);
    return { ok: true, row };
  },

  createSession({ id, code, attemptNo = 1, unlocked = false }) {
    db.prepare('INSERT INTO sessions (id, code, attempt_no, unlocked) VALUES (?, ?, ?, ?)').run(
      id,
      code,
      attemptNo,
      unlocked ? 1 : 0
    );
    return this.getSession(id);
  },

  getSession(id) {
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
  },

  listSessionsByCode(code) {
    return db
      .prepare('SELECT * FROM sessions WHERE code = ? ORDER BY attempt_no ASC, created_at ASC')
      .all(code);
  },

  getPassword(code) {
    return db.prepare('SELECT * FROM passwords WHERE code = ?').get(String(code || '').trim().toUpperCase()) || null;
  },

  completeSession(id, { answers, result, episode, archetype, total }) {
    db.prepare(
      'UPDATE sessions SET completed = 1, answers = ?, result = ?, episode = ?, archetype = ?, total = ? WHERE id = ?'
    ).run(JSON.stringify(answers), JSON.stringify(result), episode, archetype, total, id);
    return this.getSession(id);
  },

  unlockSession(id) {
    db.prepare('UPDATE sessions SET unlocked = 1 WHERE id = ?').run(id);
    return this.getSession(id);
  },

  // 同一密码解锁一次，后续重测的完整版也免费
  unlockByCode(code) {
    db.prepare('UPDATE sessions SET unlocked = 1 WHERE code = ?').run(code);
  },

  createPasswords(codes, maxUses = 3, note = '') {
    const stmt = db.prepare('INSERT OR REPLACE INTO passwords (code, max_uses, used_count, note) VALUES (?, ?, 0, ?)');
    for (const c of codes) stmt.run(String(c).trim().toUpperCase(), maxUses, note);
    return codes.length;
  },

  listPasswords() {
    return db.prepare('SELECT * FROM passwords ORDER BY created_at DESC').all();
  },

  stats() {
    return {
      passwords: db.prepare('SELECT COUNT(*) AS n FROM passwords').get().n,
      sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,
      completed: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE completed = 1').get().n,
      unlocked: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE unlocked = 1').get().n,
    };
  },
};
