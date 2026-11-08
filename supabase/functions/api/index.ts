// Supabase Edge Function：0.99 元测评权益系统 API。
// 身份：Supabase Anonymous Auth，所有用户接口必须带 Authorization: Bearer <JWT>。
// 数据：全部经 service_role 在服务端完成；扣次走 RPC 事务，前端无任何数据库权限。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildResult } from '../_shared/scoring.js';
import { QUESTIONS } from '../_shared/questions.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ADMIN_KEY = Deno.env.get('ADMIN_KEY') ?? '';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// service_role：仅服务端
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// 新码为 5 位纯数字（含前导零）；兼容存量 16 位 Crockford 旧码
const CODE_RE = /^(\d{5}|[0-9A-Z]{4}(-[0-9A-Z]{4}){2,3})$/;

function normalizeCode(raw: unknown): string {
  return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

async function hashCode(raw: unknown): Promise<string> {
  const normalized = normalizeCode(raw);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 从 Authorization 头解析匿名/登录用户；失败返回 null */
async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

function codeState(row: any): string {
  if (!row) return 'none';
  if (row.status === 'frozen' || row.status === 'void') return row.status;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  if (row.remaining_uses <= 0) return 'exhausted';
  return row.status === 'inactive' ? 'inactive' : 'active';
}

function entitlementOf(row: any) {
  if (!row) return { bound: false };
  return {
    bound: true,
    status: codeState(row),
    remaining: row.remaining_uses,
    totalUses: row.total_uses,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
  };
}

/** 当前用户绑定的兑换码：优先还有次数且未过期的，其次最近绑定的 */
async function codeOfUser(userId: string) {
  const { data } = await sb
    .from('codes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!data?.length) return null;
  return data.find((c: any) => codeState(c) === 'active') ?? data[0];
}

async function getSession(id: string) {
  const { data } = await sb.from('sessions').select('*').eq('id', id).maybeSingle();
  return data;
}

// ---------- 管理端工具 ----------
/** 5 位纯数字兑换码（00000-99999，保留前导零）。密码学安全随机数 + 拒绝采样消除模偏差，不使用 Math.random */
function generatePlainCode(): string {
  const buf = new Uint32Array(1);
  const LIMIT = 4294900000; // floor(2^32 / 100000) * 100000
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < LIMIT) return String(buf[0] % 100000).padStart(5, '0');
  }
}

/** 取客户端 IP 并归一化：Supabase 链路 x-forwarded-for 末端是平台中继 IP（逐请求变化），
 *  真实客户端在倒数第二位（攻击者伪造的头部只会出现在更左侧，不影响）；
 *  去相邻重复后取倒数第二；IPv6 收敛到 /64 网段 */
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const parts = fwd.split(',').map((s) => s.trim()).filter(Boolean);
  const dedup = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  const ip = dedup.length >= 2 ? dedup[dedup.length - 2] : (dedup[0] || '');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}::/64`;
  return ip || 'unknown';
}

function requireAdmin(req: Request): boolean {
  return Boolean(ADMIN_KEY) && req.headers.get('x-admin-key') === ADMIN_KEY;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const marker = parts.indexOf('api');
  const route = marker >= 0 ? parts.slice(marker + 1) : parts;

  try {
    // ================= 公开 =================
    if (route[0] === 'health' && req.method === 'GET') {
      return json({ ok: true, driver: 'supabase', cloud: true, version: 'entitlement-1' });
    }

    /** 结果分享页读取：结果本身可分享，不含任何身份/权益信息 */
    if (route[0] === 'result' && req.method === 'GET' && route[1]) {
      const session = await getSession(route[1]);
      if (!session || !session.completed) {
        return json({ ok: false, message: '结果不存在。' }, 404);
      }
      const result = session.result ?? buildResult(
        typeof session.answers === 'string' ? JSON.parse(session.answers) : session.answers
      );
      return json({ ok: true, completed: true, attemptNo: session.attempt_no || 1, result });
    }

    // ================= 管理端（x-admin-key，仅服务端持有） =================
    if (route[0] === 'admin') {
      if (!requireAdmin(req)) return json({ ok: false, message: '无权访问。' }, 403);
      const sub = route[1];
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

      /** 批量生成兑换码：明文只在本次响应返回一次，库里只存哈希 */
      if (sub === 'generate' && req.method === 'POST') {
        const count = Math.min(Math.max(Number(body?.count) || 1, 1), 200);
        const uses = Math.min(Math.max(Number(body?.uses) || 3, 1), 99);
        const note = String(body?.note || '');
        const plain: string[] = [];
        // 逐个生成并插入：撞库（唯一约束 23505）时自动重新生成，保证不重复
        for (let i = 0; i < count; i += 1) {
          let inserted = false;
          for (let t = 0; t < 25 && !inserted; t += 1) {
            const code = generatePlainCode();
            const { error } = await sb.from('codes').insert({
              code_hash: await hashCode(code), total_uses: uses, remaining_uses: uses, note,
            });
            if (!error) {
              plain.push(code);
              inserted = true;
            } else if (error.code !== '23505') {
              throw error;
            }
          }
          if (!inserted) throw new Error('兑换码空间冲突过多，请重试');
        }
        await sb.from('admin_logs').insert({ action: 'generate', detail: { count, uses, note } });
        return json({ ok: true, codes: plain, count, uses });
      }

      /** 临时调试：查看限流使用的 IP 归一化结果 */
      if (sub === 'debug-ip' && req.method === 'GET') {
        return json({ ok: true, ip: clientIp(req), xff: req.headers.get('x-forwarded-for') });
      }

      /** 清空验证尝试记录（运维清理 / 风控测试复位） */
      if (sub === 'purge-attempts' && req.method === 'POST') {
        const { error } = await sb.from('code_attempts').delete().gte('id', 0);
        if (error) throw error;
        await sb.from('admin_logs').insert({ action: 'purge-attempts', detail: {} });
        return json({ ok: true });
      }

      /** 查询兑换码（支持按明文码查单个） */
      if (sub === 'codes' && req.method === 'GET') {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        let query = sb.from('codes').select('*').order('created_at', { ascending: false }).limit(200);
        if (code) query = sb.from('codes').select('*').eq('code_hash', await hashCode(code));
        const { data, error } = await query;
        if (error) throw error;
        return json({
          ok: true,
          codes: (data ?? []).map((c: any) => ({
            id: c.id, status: codeState(c), totalUses: c.total_uses, remaining: c.remaining_uses,
            userId: c.user_id, note: c.note, createdAt: c.created_at,
            activatedAt: c.activated_at, expiresAt: c.expires_at,
          })),
        });
      }

      /** 冻结 / 解冻 / 作废 */
      if ((sub === 'freeze' || sub === 'unfreeze' || sub === 'void') && req.method === 'POST') {
        const codeHash = await hashCode(body?.code);
        const target = sub === 'unfreeze' ? 'active' : sub === 'freeze' ? 'frozen' : 'void';
        const { data, error } = await sb
          .from('codes')
          .update({ status: target, updated_at: new Date().toISOString() })
          .eq('code_hash', codeHash)
          .neq('status', 'void')
          .select('id');
        if (error) throw error;
        if (!data?.length) return json({ ok: false, message: '兑换码不存在或已作废。' }, 404);
        await sb.from('admin_logs').insert({ action: sub, detail: { code_hash: codeHash } });
        return json({ ok: true, status: target });
      }

      /** 某兑换码的测评使用记录 */
      if (sub === 'records' && req.method === 'GET') {
        const url = new URL(req.url);
        const code = url.searchParams.get('code');
        if (!code) return json({ ok: false, message: '缺少 code 参数。' }, 400);
        const codeHash = await hashCode(code);
        const { data: codeRow } = await sb.from('codes').select('id').eq('code_hash', codeHash).maybeSingle();
        if (!codeRow) return json({ ok: false, message: '兑换码不存在。' }, 404);
        const { data, error } = await sb
          .from('sessions')
          .select('id, user_id, request_id, status, consumed, attempt_no, episode, archetype, started_at, completed_at')
          .eq('code_id', codeRow.id)
          .order('started_at', { ascending: true });
        if (error) throw error;
        return json({ ok: true, records: data ?? [] });
      }

      /** 人工迁移：换绑用户，留痕 */
      if (sub === 'migrate' && req.method === 'POST') {
        const codeHash = await hashCode(body?.code);
        const toUser = String(body?.to_user_id || '');
        const reason = String(body?.reason || '');
        if (!toUser || !reason) return json({ ok: false, message: '缺少 to_user_id 或 reason。' }, 400);
        const { data: cur } = await sb.from('codes').select('user_id').eq('code_hash', codeHash).maybeSingle();
        const { data: r, error } = await sb.rpc('migrate_code_user', {
          p_code_hash: codeHash,
          p_from: cur?.user_id ?? null,
          p_to: toUser,
          p_reason: reason,
        });
        if (error) throw error;
        if (!r?.ok) return json({ ok: false, message: '迁移失败：' + (r?.reason ?? '未知') }, 400);
        return json({ ok: true });
      }

      return json({ ok: false, message: '接口不存在。' }, 404);
    }

    // ================= 用户端（必须匿名身份） =================
    const user = await requireUser(req);
    if (!user) return json({ ok: false, message: '身份校验失败，请刷新页面重试。' }, 401);
    const uid = user.id;

    /** 当前身份 + 权益状态 */
    if (route[0] === 'me' && req.method === 'GET') {
      const code = await codeOfUser(uid);
      return json({ ok: true, userId: uid, entitlement: entitlementOf(code), totalQuestions: QUESTIONS.length });
    }

    /** 激活兑换码：绑定当前匿名用户，起算 7 天。带服务端限流；错误信息对外统一，不泄露码是否存在/绑定状态 */
    if (route[0] === 'activate' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const raw = String(body?.code || '').trim().toUpperCase();
      if (!CODE_RE.test(raw)) {
        return json({ ok: false, reason: 'invalid', message: '兑换码不正确或不可用，如有疑问请联系客服。' }, 403);
      }
      const { data: r, error } = await sb.rpc('activate_code', {
        p_code_hash: await hashCode(raw),
        p_user_id: uid,
        p_ip: clientIp(req),
      });
      if (error) throw error;

      if (!r?.ok) {
        // 失败响应加随机延迟，钝化计时侧信道
        await new Promise((res) => setTimeout(res, 200 + Math.floor(Math.random() * 400)));
        if (r.reason === 'rate_limited') {
          return json({ ok: false, reason: r.reason, message: '操作过于频繁，请 1 分钟后再试。' }, 429);
        }
        if (r.reason === 'blocked') {
          return json({ ok: false, reason: r.reason, message: '验证失败次数过多，已临时限制，请 15 分钟后再试。' }, 429);
        }
        // invalid / bound / frozen / void 等一律返回同一文案，不泄露兑换码是否存在、是否被他人绑定
        return json({ ok: false, reason: 'invalid', message: '兑换码不正确或不可用，如有疑问请联系客服。' }, 403);
      }
      const code = await codeOfUser(uid);
      return json({ ok: true, already: r.already, entitlement: entitlementOf(code) });
    }

    /** 开始一次测评：校验权益 + 建记录（不扣次），幂等 */
    if (route[0] === 'attempts' && !route[1] && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const requestId = String(body?.request_id || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) {
        return json({ ok: false, message: '请求参数不正确。' }, 400);
      }
      const code = await codeOfUser(uid);
      if (!code) return json({ ok: false, reason: 'not_activated', message: '请先输入兑换码。' }, 403);

      const { data: r, error } = await sb.rpc('begin_attempt', {
        p_code_hash: code.code_hash,
        p_user_id: uid,
        p_request_id: requestId,
        p_session_id: crypto.randomUUID(),
      });
      if (error) throw error;
      if (!r?.ok) {
        return json({ ok: false, reason: r.reason, entitlement: entitlementOf(code) }, 403);
      }
      return json({
        ok: true,
        token: r.session_id,
        requestId,
        attemptNo: r.attempt_no,
        resumed: r.resumed,
        entitlement: entitlementOf({ ...code }),
      });
    }

    /** 完成测评：服务端计分 + RPC 原子扣次（失败/重复不扣） */
    if (route[0] === 'attempts' && route[1] === 'complete' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const requestId = String(body?.request_id || '');

      // 答案校验失败：标记失败，不扣次
      let answersOk = true;
      for (const q of QUESTIONS) {
        const idx = body?.answers?.[q.id];
        if (!Number.isInteger(idx) || idx < 0 || idx > 3) { answersOk = false; break; }
      }
      if (!answersOk) {
        await sb.rpc('fail_attempt', { p_request_id: requestId, p_user_id: uid });
        return json({ ok: false, message: '还有题目没有作答。' }, 400);
      }

      const result = buildResult(body.answers);
      const { data: r, error } = await sb.rpc('finalize_attempt', {
        p_request_id: requestId,
        p_user_id: uid,
        p_result: result,
        p_episode: result.episode,
        p_archetype: result.archetype.name,
        p_total: result.total,
      });
      if (error) throw error;
      if (!r?.ok) {
        const code = await codeOfUser(uid);
        return json({ ok: false, reason: r.reason, entitlement: entitlementOf(code) }, 403);
      }
      const session = await sb.from('sessions').select('id').eq('request_id', requestId).maybeSingle();
      return json({ ok: true, token: session.data?.id, result, remaining: r.remaining });
    }

    /** 我的测评记录（对照/历史）：按当前兑换码隔离，换码后不串记录 */
    if (route[0] === 'attempts' && req.method === 'GET') {
      const code = await codeOfUser(uid);
      if (!code) return json({ ok: true, attempts: [] });
      const { data, error } = await sb
        .from('sessions')
        .select('id, request_id, attempt_no, status, consumed, result, started_at, completed_at')
        .eq('user_id', uid)
        .eq('code_id', code.id)
        .eq('status', 'completed')
        .order('attempt_no', { ascending: true });
      if (error) throw error;
      return json({
        ok: true,
        attempts: (data ?? []).map((row: any) => ({
          token: row.id,
          attemptNo: row.attempt_no || 1,
          createdAt: row.completed_at ?? row.started_at,
          result: row.result,
        })),
      });
    }

    return json({ ok: false, message: '接口不存在。' }, 404);
  } catch (err) {
    console.error('[edge-api]', err);
    return json({ ok: false, message: '服务开小差了，请稍后再试。' }, 500);
  }
});
