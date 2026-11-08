// Netlify 线上验收（A 组：部署与代理 / B 组：权益与次数）
// 用法：node scripts/acceptance.mjs <兑换码>
// 只访问 https://gongdou-test.netlify.app，不直连 Supabase，无需开代理

const ORIGIN = 'https://gongdou-test.netlify.app';
const ANON = 'sb_publishable_Tp1VOq_rS-DMjVK978HqpA_WyoMNTuV';
const CODE = process.argv[2];

// 国内直连 Netlify 生效慢，默认 10s 连接超时容易误判失败
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { timeout: 40000 }, headersTimeout: 60000, bodyTimeout: 60000 }));

const { QUESTIONS } = await import('file://' + process.cwd() + '/shared/questions.js');
const VALID = Object.fromEntries(QUESTIONS.map((q) => [q.id, 0]));
const INVALID = { ...VALID, [QUESTIONS[0].id]: 9 };

let pass = 0;
let fail = 0;
const group = (t) => console.log(`\n=== ${t} ===`);
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  | ' + extra : ''}`);
  cond ? pass++ : fail++;
};

const http = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const res = await fetch(ORIGIN + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { apikey: ANON, authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data, headers: res.headers, text };
};

const api = (path, opts) => http('/sb/functions/v1/api' + path, opts);

const newUser = async () => {
  const res = await fetch(`${ORIGIN}/sb/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ data: {}, gotrue_meta_security: {} }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('匿名注册失败: ' + JSON.stringify(d));
  return d.access_token;
};

// ---------- A 组：部署与代理 ----------
group('A1 首页与静态资源');
const home = await http('/');
const html = home.text;
check('首页 200', home.status === 200);
check('首页含入口脚本', /assets\/index-[\w-]+\.js/.test(html));
check('首页含挂载点', html.includes('id="root"'));

const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => m[1]);
for (const a of assets.slice(0, 3)) {
  const r = await http(a.replace(/^\.?\//, '/'));
  check(`静态资源 ${a.split('/').pop()}`, r.status === 200);
}

const spa = await http('/some/deep/link');
check('SPA 回退（任意路径返回首页）', spa.status === 200 && spa.text.includes('id="root"'));

group('A2 代理边界');
const health = await api('/health');
check('代理 health', health.status === 200 && health.data.ok === true, `driver=${health.data.driver}`);
check('代理响应不缓存', (health.headers.get('cache-control') || '').includes('no-store'));

const blocked = ['/sb/rest/v1/codes', '/sb/storage/v1/object/public', '/sb/auth/v1/admin/users', '/sb/functions/v1/other'];
for (const p of blocked) {
  const r = await http(p);
  check(`非白名单被拒 ${p}`, r.status === 403);
}

// 关键是 x-admin-key 不被转发：带上管理密钥仍应 403
const adminViaProxy = await api('/admin/codes', { headers: { 'x-admin-key': 'any-value' } });
check('x-admin-key 不经代理转发（管理端不可公网触达）', adminViaProxy.status === 403, `status=${adminViaProxy.status}`);

// ---------- B 组：权益与次数 ----------
if (!CODE) {
  console.log('\n未提供兑换码，跳过 B 组。用法：node scripts/acceptance.mjs <兑换码>');
  console.log(`\n合计：${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

group('B1 激活与绑定');
const tokenA = await newUser();
const tokenB = await newUser();
check('匿名注册 A/B', !!tokenA && !!tokenB);

const act = await api('/activate', { method: 'POST', token: tokenA, body: { code: CODE } });
check(
  '新码激活成功',
  act.status === 200 && act.data.ok === true,
  `剩余 ${act.data.entitlement?.remaining}/${act.data.entitlement?.totalUses}
`
    .trim()
);

const me = await api('/me', { token: tokenA });
check('首次激活绑定当前用户 UUID', me.data.userId && me.data.entitlement?.bound === true, `userId=${me.data.userId?.slice(0, 8)}…`);

const again = await api('/activate', { method: 'POST', token: tokenA, body: { code: CODE } });
check('本人重复激活幂等', again.status === 200 && again.data.already === true);

const other = await api('/activate', { method: 'POST', token: tokenB, body: { code: CODE } });
check(
  '他人激活已绑定码被拒',
  other.status === 403 && other.data.message === '兑换码不正确或不可用，如有疑问请联系客服。',
  `status=${other.status}`
);

const badFormat = await api('/activate', { method: 'POST', token: tokenB, body: { code: '1234' } });
check('非法格式（4 位）被拒', badFormat.status === 403 && badFormat.data.ok === false);

const notExist = await api('/activate', { method: 'POST', token: tokenB, body: { code: '00000' } });
check(
  '不存在的码与已绑定码文案一致（不泄露）',
  notExist.status === 403 && notExist.data.message === other.data.message,
  `message=${notExist.data.message}`
);

group('B2 次数与扣减');
let shareToken = null;
const doAttempt = async (answers) => {
  const rid = crypto.randomUUID();
  const start = await api('/attempts', { method: 'POST', token: tokenA, body: { request_id: rid } });
  if (!start.data.ok) return { start, done: null };
  const done = await api('/attempts/complete', { method: 'POST', token: tokenA, body: { request_id: rid, answers } });
  return { start, done };
};

const a1 = await doAttempt(VALID);
check('第 1 次开始', a1.start.status === 200 && a1.start.data.attemptNo === 1, `attemptNo=${a1.start.data.attemptNo}`);
check('第 1 次完成扣次', a1.done.status === 200 && a1.done.data.remaining === 2, `remaining=${a1.done.data.remaining}`);
shareToken = a1.done.data.token;

// 幂等：同一个 request_id 再提交一次
const ridDup = crypto.randomUUID();
await api('/attempts', { method: 'POST', token: tokenA, body: { request_id: ridDup } });
await api('/attempts/complete', { method: 'POST', token: tokenA, body: { request_id: ridDup, answers: VALID } });
const dup = await api('/attempts/complete', { method: 'POST', token: tokenA, body: { request_id: ridDup, answers: VALID } });
const meAfterDup = await api('/me', { token: tokenA });
check(
  '同 request_id 重复完成不重复扣次',
  dup.status === 200 && meAfterDup.data.entitlement?.remaining === 1,
  `remaining=${meAfterDup.data.entitlement?.remaining}`
);

// 失败不扣次：开始后提交非法答案
const ridBad = crypto.randomUUID();
await api('/attempts', { method: 'POST', token: tokenA, body: { request_id: ridBad } });
const bad = await api('/attempts/complete', { method: 'POST', token: tokenA, body: { request_id: ridBad, answers: INVALID } });
const meAfterBad = await api('/me', { token: tokenA });
check(
  '答案非法提交失败不扣次',
  bad.status === 400 && meAfterBad.data.entitlement?.remaining === 1,
  `status=${bad.status}, remaining=${meAfterBad.data.entitlement?.remaining}`
);

const a3 = await doAttempt(VALID);
check('第 2 次完成扣次', a3.done.status === 200 && a3.done.data.remaining === 0, `remaining=${a3.done.data.remaining}`);

const exhausted = await api('/attempts', { method: 'POST', token: tokenA, body: { request_id: crypto.randomUUID() } });
check(
  '次数用完后被服务端拒绝',
  exhausted.status === 403 && exhausted.data.reason === 'exhausted',
  `status=${exhausted.status}, reason=${exhausted.data.reason}`
);

group('B3 结果读取');
const share = await api(`/result/${shareToken}`);
check(
  '分享结果公开读取',
  share.status === 200 && share.data.ok === true && share.data.result?.episode,
  `episode=${share.data.result?.episode}, archetype=${share.data.result?.archetype?.name}`
);

const history = await api('/attempts', { token: tokenA });
check('我的测评记录可读', history.status === 200 && (history.data.attempts || []).length === 3, `count=${history.data.attempts?.length}`);

console.log(`\n合计：${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
