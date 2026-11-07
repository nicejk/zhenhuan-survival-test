/**
 * Supabase 适配器（云数据库）。
 * 启用方式：设置环境变量
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY=service_role key
 * 并在 Supabase SQL Editor 中执行 supabase/schema.sql（含 reserve_password 原子函数）。
 */
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;

async function rest(pathname, options = {}) {
  const res = await fetch(`${URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const store = {
  driver: 'supabase',

  async reservePassword(code) {
    const clean = String(code || '').trim().toUpperCase();
    const res = await rest('rpc/reserve_password', {
      method: 'POST',
      body: JSON.stringify({ p_code: clean }),
    });
    // 函数返回 { ok, reason, row }
    return res;
  },

  async createSession({ id, code, attemptNo = 1, unlocked = false }) {
    await rest('sessions', {
      method: 'POST',
      body: JSON.stringify({ id, code, attempt_no: attemptNo, unlocked }),
    });
    return this.getSession(id);
  },

  async getSession(id) {
    const rows = await rest(`sessions?id=eq.${encodeURIComponent(id)}&select=*`);
    return rows && rows[0] ? rows[0] : null;
  },

  async listSessionsByCode(code) {
    return rest(
      `sessions?code=eq.${encodeURIComponent(code)}&select=*&order=attempt_no.asc,created_at.asc`
    );
  },

  async getPassword(code) {
    const clean = String(code || '').trim().toUpperCase();
    const rows = await rest(`passwords?code=eq.${encodeURIComponent(clean)}&select=*`);
    return rows && rows[0] ? rows[0] : null;
  },

  async completeSession(id, { answers, result, episode, archetype, total }) {
    await rest(`sessions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        completed: true,
        answers,
        result,
        episode,
        archetype,
        total,
      }),
    });
    return this.getSession(id);
  },

  async unlockSession(id) {
    await rest(`sessions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unlocked: true }),
    });
    return this.getSession(id);
  },

  // 同一密码解锁一次，后续重测的完整版也免费
  async unlockByCode(code) {
    await rest(`sessions?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      body: JSON.stringify({ unlocked: true }),
    });
  },

  async createPasswords(codes, maxUses = 3, note = '') {
    const rows = codes.map((c) => ({
      code: String(c).trim().toUpperCase(),
      max_uses: maxUses,
      used_count: 0,
      note,
    }));
    await rest('passwords', { method: 'POST', body: JSON.stringify(rows) });
    return codes.length;
  },

  async listPasswords() {
    return rest('passwords?select=*&order=created_at.desc');
  },

  async stats() {
    const [p, s, c, u] = await Promise.all([
      rest('passwords?select=code'),
      rest('sessions?select=id'),
      rest('sessions?completed=eq.true&select=id'),
      rest('sessions?unlocked=eq.true&select=id'),
    ]);
    return {
      passwords: p.length,
      sessions: s.length,
      completed: c.length,
      unlocked: u.length,
    };
  },
};
