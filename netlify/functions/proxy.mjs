// 同域 API 代理：浏览器 → /sb/* → Supabase（固定上游，白名单路径）
// 目的：国内网络无法直连 supabase.co，由 Netlify Function 中转。
// 安全约束：
//   - 上游域名写死，客户端不可指定目标（不是开放代理）
//   - 仅放行 auth/v1/*（匿名登录/Token 刷新）与 functions/v1/api/*（业务 API）
//   - 不持有任何密钥（Service Role Key / ADMIN_KEY 均不在此）
//   - 不缓存任何响应（含登录态与兑换码请求）

const UPSTREAM = 'https://juiaetgiyltpbmmvctdc.supabase.co';
const ALLOWED_PREFIXES = ['auth/v1/', 'functions/v1/api/'];
// auth/v1/admin/* 是 Supabase 管理 API（需 service_role），不应对公网代理开放
const DENIED_PREFIXES = ['auth/v1/admin/'];
const FORWARD_HEADERS = ['authorization', 'apikey', 'content-type', 'x-client-info'];
const TIMEOUT_MS = 15000;

const NO_STORE = { 'cache-control': 'no-store' };

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE },
  });
}

export default async (req) => {
  // 同源调用理论上不会预检；防御性处理 OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  const url = new URL(req.url);
  const rest = url.pathname.replace(/^\/sb\/?/, '');

  // 白名单校验：只允许认证与业务 API 两条前缀；管理端点显式拒绝
  const denied = DENIED_PREFIXES.some((p) => rest.startsWith(p));
  if (denied || !ALLOWED_PREFIXES.some((p) => rest.startsWith(p))) {
    return json(403, { ok: false, message: 'forbidden' });
  }

  const target = `${UPSTREAM}/${rest}${url.search}`;

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const init = { method: req.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(req.method)) {
    init.body = await req.text();
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  init.signal = controller.signal;

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    const out = new Headers(NO_STORE);
    const ct = res.headers.get('content-type');
    if (ct) out.set('content-type', ct);
    return new Response(body, { status: res.status, headers: out });
  } catch (err) {
    const isTimeout = err?.name === 'AbortError';
    return json(isTimeout ? 504 : 502, {
      ok: false,
      message: isTimeout ? '服务响应超时，请重试' : '网络异常，请稍后重试',
    });
  } finally {
    clearTimeout(timer);
  }
};

export const config = { path: '/sb/*' };
