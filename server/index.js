import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { store, isCloud } from './store/index.js';
import { buildResult } from '../shared/scoring.js';
import { QUESTIONS, TOTAL_QUESTIONS } from '../shared/questions.js';

const app = express();
const PORT = process.env.PORT || 8787;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin888';

app.use(express.json({ limit: '1mb' }));

// ---------- 简单防刷：同一 IP 10 分钟内最多 12 次密码尝试 ----------
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, ts: now };
  if (now - rec.ts > 10 * 60 * 1000) {
    rec.count = 0;
    rec.ts = now;
  }
  rec.count += 1;
  attempts.set(ip, rec);
  return rec.count > 12;
}

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, driver: store.driver, cloud: isCloud });
});

/** 1. 密码校验 + 扣减次数 */
app.post('/api/auth', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
      return res.status(429).json({ ok: false, message: '尝试次数过多，请十分钟后再试。' });
    }
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ ok: false, message: '请输入密码。' });

    const result = await store.reservePassword(code);
    if (!result.ok) {
      return res.status(403).json({
        ok: false,
        message: result.reason === 'exhausted' ? '这个密码的 3 次测试机会已经用完了。' : '密码不正确，请核对后再试。',
      });
    }

    const history = await store.listSessionsByCode(result.row.code);
    const attemptNo = history.length + 1;
    const inheritedUnlock = history.some((s) => Boolean(s.unlocked));

    const id = crypto.randomUUID();
    await store.createSession({ id, code: result.row.code, attemptNo, unlocked: inheritedUnlock });
    const remaining = result.row.max_uses - result.row.used_count;

    res.json({
      ok: true,
      token: id,
      remaining,
      attemptNo,
      maxUses: result.row.max_uses,
      totalQuestions: TOTAL_QUESTIONS,
    });
  } catch (err) {
    console.error('[auth]', err);
    res.status(500).json({ ok: false, message: '服务开小差了，请稍后再试。' });
  }
});

/** 2. 提交答案，服务端计算并落库 */
app.post('/api/complete', async (req, res) => {
  try {
    const { token, answers } = req.body || {};
    const session = token ? await store.getSession(token) : null;
    if (!session) return res.status(401).json({ ok: false, message: '会话不存在或已过期。' });

    for (const q of QUESTIONS) {
      const idx = answers?.[q.id];
      if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
        return res.status(400).json({ ok: false, message: `第 ${q.id} 题还没有作答。` });
      }
    }

    const result = buildResult(answers, false);
    await store.completeSession(token, {
      answers,
      result,
      episode: result.episode,
      archetype: result.archetype.name,
      total: result.total,
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.error('[complete]', err);
    res.status(500).json({ ok: false, message: '结果结算失败，请重试。' });
  }
});

/** 3. 读取结果（按解锁状态返回公开版 / 完整版） */
app.get('/api/result/:token', async (req, res) => {
  try {
    const session = await store.getSession(req.params.token);
    if (!session) return res.status(404).json({ ok: false, message: '结果不存在。' });
    const pwd = await store.getPassword(session.code);
    const remaining = pwd ? pwd.max_uses - pwd.used_count : null;
    if (!session.completed) {
      return res.json({ ok: true, completed: false, remaining });
    }

    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : session.answers;
    const unlocked = Boolean(session.unlocked);
    const result = buildResult(answers, unlocked);

    res.json({
      ok: true,
      completed: true,
      unlocked,
      remaining,
      attemptNo: session.attempt_no || 1,
      result,
    });
  } catch (err) {
    console.error('[result]', err);
    res.status(500).json({ ok: false, message: '读取结果失败。' });
  }
});

/** 4. 模拟支付 → 解锁完整版 */
app.post('/api/unlock', async (req, res) => {
  try {
    const { token } = req.body || {};
    const session = token ? await store.getSession(token) : null;
    if (!session) return res.status(401).json({ ok: false, message: '会话不存在。' });
    if (!session.completed) return res.status(400).json({ ok: false, message: '请先完成测试。' });

    await store.unlockByCode(session.code);
    const answers = typeof session.answers === 'string' ? JSON.parse(session.answers) : session.answers;
    const result = buildResult(answers, true);

    res.json({ ok: true, result, payment: { mode: 'simulated', amount: 9.9 } });
  } catch (err) {
    console.error('[unlock]', err);
    res.status(500).json({ ok: false, message: '解锁失败，请稍后再试。' });
  }
});

/** 5. 重测：复用同一密码的剩余次数，新建下一次会话 */
app.post('/api/retest', async (req, res) => {
  try {
    const { token } = req.body || {};
    const session = token ? await store.getSession(token) : null;
    if (!session) return res.status(401).json({ ok: false, message: '会话不存在或已过期。' });
    if (!session.completed) return res.status(400).json({ ok: false, message: '请先完成本次测评。' });

    const reserved = await store.reservePassword(session.code);
    if (!reserved.ok) {
      return res.status(403).json({ ok: false, message: '这个密码的测试机会已经用完了。' });
    }

    const history = await store.listSessionsByCode(session.code);
    const attemptNo = history.length + 1;
    const inheritedUnlock = history.some((s) => Boolean(s.unlocked));
    const id = crypto.randomUUID();
    await store.createSession({ id, code: session.code, attemptNo, unlocked: inheritedUnlock });

    res.json({
      ok: true,
      token: id,
      attemptNo,
      remaining: reserved.row.max_uses - reserved.row.used_count,
      maxUses: reserved.row.max_uses,
    });
  } catch (err) {
    console.error('[retest]', err);
    res.status(500).json({ ok: false, message: '重测开启失败，请稍后再试。' });
  }
});

/** 6. 同一密码下的全部测评记录（用于两次结果对照） */
app.get('/api/attempts/:token', async (req, res) => {
  try {
    const session = await store.getSession(req.params.token);
    if (!session) return res.status(404).json({ ok: false, message: '结果不存在。' });

    const rows = await store.listSessionsByCode(session.code);
    const pwd = await store.getPassword(session.code);
    const attempts = rows
      .filter((row) => row.completed)
      .map((row) => {
        const answers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers;
        const unlocked = Boolean(row.unlocked);
        return {
          token: row.id,
          attemptNo: row.attempt_no || 1,
          unlocked,
          createdAt: row.created_at,
          result: buildResult(answers, unlocked),
        };
      });

    res.json({
      ok: true,
      attempts,
      remaining: pwd ? pwd.max_uses - pwd.used_count : null,
      maxUses: pwd ? pwd.max_uses : null,
    });
  } catch (err) {
    console.error('[attempts]', err);
    res.status(500).json({ ok: false, message: '读取测评记录失败。' });
  }
});

/** 7. 简易后台（可用浏览器打开 /api/admin/passwords?key=admin888） */
app.get('/api/admin/passwords', async (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ ok: false, message: '无权访问。' });
  const rows = await store.listPasswords();
  const stats = await store.stats();
  res.json({ ok: true, driver: store.driver, stats, passwords: rows });
});

app.post('/api/admin/passwords', async (req, res) => {
  if (req.body?.key !== ADMIN_KEY) return res.status(403).json({ ok: false, message: '无权访问。' });
  const { codes, maxUses, note } = req.body || {};
  if (!Array.isArray(codes) || !codes.length) return res.status(400).json({ ok: false, message: '请提供 codes 数组。' });
  const n = await store.createPasswords(codes, Number(maxUses) || 3, note || '');
  res.json({ ok: true, created: n });
});

// ---------- 生产环境静态托管 ----------
const dist = path.join(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n  甄嬛生存力测评 API  →  http://localhost:${PORT}`);
  console.log(`  数据驱动：${store.driver}${isCloud ? '（云数据库）' : '（本地 SQLite，可切换 Supabase）'}`);
  console.log(`  后台密码列表：http://localhost:${PORT}/api/admin/passwords?key=${ADMIN_KEY}\n`);
});
