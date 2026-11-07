// Supabase Edge Function：把原 Express 接口整体搬到这里，前端只依赖一个 API Base。
// 数据库访问使用 service_role，前端拿不到数据库权限。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildResult } from '../_shared/scoring.js';
import { QUESTIONS } from '../_shared/questions.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const sb = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } }
);

function parseAnswers(raw: unknown) {
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function getSession(id: string) {
  const { data } = await sb.from('sessions').select('*').eq('id', id).maybeSingle();
  return data;
}

async function getPassword(code: string) {
  const clean = String(code || '').trim().toUpperCase();
  const { data } = await sb.from('passwords').select('*').eq('code', clean).maybeSingle();
  return data;
}

async function listSessions(code: string) {
  const { data } = await sb
    .from('sessions')
    .select('*')
    .eq('code', code)
    .order('attempt_no', { ascending: true })
    .order('created_at', { ascending: true });
  return data ?? [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const marker = parts.indexOf('api');
  const route = marker >= 0 ? parts.slice(marker + 1) : parts;

  try {
    /** 健康检查 */
    if (route[0] === 'health' && req.method === 'GET') {
      return json({ ok: true, driver: 'supabase', cloud: true });
    }

    /** 密码校验 + 扣减次数 */
    if (route[0] === 'auth' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const code = String(body?.code || '').trim();
      if (!code) return json({ ok: false, message: '请输入密码。' }, 400);

      const { data: reserved, error } = await sb.rpc('reserve_password', { p_code: code });
      if (error) throw error;
      if (!reserved?.ok) {
        return json(
          {
            ok: false,
            message:
              reserved?.reason === 'exhausted'
                ? '这个密码的 3 次测试机会已经用完了。'
                : '密码不正确，请核对后再试。',
          },
          403
        );
      }

      const row = reserved.row;
      const history = await listSessions(row.code);
      const attemptNo = history.length + 1;
      const inheritedUnlock = history.some((s: any) => Boolean(s.unlocked));
      const id = crypto.randomUUID();
      const { error: insertError } = await sb
        .from('sessions')
        .insert({ id, code: row.code, attempt_no: attemptNo, unlocked: inheritedUnlock });
      if (insertError) throw insertError;

      return json({
        ok: true,
        token: id,
        remaining: row.max_uses - row.used_count,
        attemptNo,
        maxUses: row.max_uses,
        totalQuestions: QUESTIONS.length,
      });
    }

    /** 提交答案，服务端计算并落库 */
    if (route[0] === 'complete' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const session = body?.token ? await getSession(body.token) : null;
      if (!session) return json({ ok: false, message: '会话不存在或已过期。' }, 401);

      for (const q of QUESTIONS) {
        const idx = body?.answers?.[q.id];
        if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
          return json({ ok: false, message: `第 ${q.id} 题还没有作答。` }, 400);
        }
      }

      const result = buildResult(body.answers, false);
      const { error } = await sb
        .from('sessions')
        .update({
          completed: true,
          answers: body.answers,
          result,
          episode: result.episode,
          archetype: result.archetype.name,
          total: result.total,
        })
        .eq('id', body.token);
      if (error) throw error;

      return json({ ok: true, result });
    }

    /** 读取结果 */
    if (route[0] === 'result' && req.method === 'GET' && route[1]) {
      const session = await getSession(route[1]);
      if (!session) return json({ ok: false, message: '结果不存在。' }, 404);

      const pwd = await getPassword(session.code);
      const remaining = pwd ? pwd.max_uses - pwd.used_count : null;
      if (!session.completed) return json({ ok: true, completed: false, remaining });

      const answers = parseAnswers(session.answers);
      const unlocked = Boolean(session.unlocked);
      return json({
        ok: true,
        completed: true,
        unlocked,
        remaining,
        attemptNo: session.attempt_no || 1,
        result: buildResult(answers, unlocked),
      });
    }

    /** 解锁完整版：同一密码下的所有结果一起解锁 */
    if (route[0] === 'unlock' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const session = body?.token ? await getSession(body.token) : null;
      if (!session) return json({ ok: false, message: '会话不存在。' }, 401);
      if (!session.completed) return json({ ok: false, message: '请先完成测试。' }, 400);

      const { error } = await sb.from('sessions').update({ unlocked: true }).eq('code', session.code);
      if (error) throw error;

      const answers = parseAnswers(session.answers);
      return json({
        ok: true,
        result: buildResult(answers, true),
        payment: { mode: 'simulated', amount: 9.9 },
      });
    }

    /** 重测：复用同一密码的剩余次数 */
    if (route[0] === 'retest' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const session = body?.token ? await getSession(body.token) : null;
      if (!session) return json({ ok: false, message: '会话不存在或已过期。' }, 401);
      if (!session.completed) return json({ ok: false, message: '请先完成本次测评。' }, 400);

      const { data: reserved, error } = await sb.rpc('reserve_password', { p_code: session.code });
      if (error) throw error;
      if (!reserved?.ok) {
        return json({ ok: false, message: '这个密码的测试机会已经用完了。' }, 403);
      }

      const history = await listSessions(session.code);
      const attemptNo = history.length + 1;
      const inheritedUnlock = history.some((s: any) => Boolean(s.unlocked));
      const id = crypto.randomUUID();
      const { error: insertError } = await sb
        .from('sessions')
        .insert({ id, code: session.code, attempt_no: attemptNo, unlocked: inheritedUnlock });
      if (insertError) throw insertError;

      return json({
        ok: true,
        token: id,
        attemptNo,
        remaining: reserved.row.max_uses - reserved.row.used_count,
        maxUses: reserved.row.max_uses,
      });
    }

    /** 同一密码下的测评记录 */
    if (route[0] === 'attempts' && req.method === 'GET' && route[1]) {
      const session = await getSession(route[1]);
      if (!session) return json({ ok: false, message: '结果不存在。' }, 404);

      const rows = await listSessions(session.code);
      const pwd = await getPassword(session.code);
      const attempts = rows
        .filter((row: any) => row.completed)
        .map((row: any) => {
          const unlocked = Boolean(row.unlocked);
          return {
            token: row.id,
            attemptNo: row.attempt_no || 1,
            unlocked,
            createdAt: row.created_at,
            result: buildResult(parseAnswers(row.answers), unlocked),
          };
        });

      return json({
        ok: true,
        attempts,
        remaining: pwd ? pwd.max_uses - pwd.used_count : null,
        maxUses: pwd ? pwd.max_uses : null,
      });
    }

    return json({ ok: false, message: '接口不存在。' }, 404);
  } catch (err) {
    console.error('[edge-api]', err);
    return json({ ok: false, message: '服务开小差了，请稍后再试。' }, 500);
  }
});
