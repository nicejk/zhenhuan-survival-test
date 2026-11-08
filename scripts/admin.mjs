#!/usr/bin/env node
// 自动走系统代理（Node fetch 默认不读 http_proxy/https_proxy，需显式开启）
process.env.NODE_USE_ENV_PROXY ||= '1';
/**
 * 运营管理脚本（本地使用，密钥从 scripts/.admin-key 读取，绝不入库）。
 *
 * 用法：
 *   node scripts/admin.mjs generate 10 [次数=3] [备注]   批量生成兑换码（明文只显示这一次）
 *   node scripts/admin.mjs list                          查看最近兑换码状态
 *   node scripts/admin.mjs query <兑换码>                 查询单个码
 *   node scripts/admin.mjs freeze <兑换码>                冻结
 *   node scripts/admin.mjs unfreeze <兑换码>              解冻
 *   node scripts/admin.mjs void <兑换码>                  作废（不可恢复）
 *   node scripts/admin.mjs records <兑换码>               查看测评使用记录
 *   node scripts/admin.mjs migrate <兑换码> <新用户UUID> <原因>   人工迁移绑定
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const ADMIN_KEY = process.env.ADMIN_KEY || readFileSync(join(dir, '.admin-key'), 'utf8').trim();
const BASE = 'https://juiaetgiyltpbmmvctdc.supabase.co/functions/v1/api';

const [, , cmd, ...args] = process.argv;

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    console.error('失败：', data.message || res.status);
    process.exit(1);
  }
  return data;
}

const fmt = (c) =>
  `${c.id.slice(0, 8)}… 状态:${c.status} 剩余:${c.remaining}/${c.totalUses} 用户:${c.userId ? c.userId.slice(0, 8) + '…' : '未绑定'} 激活:${c.activatedAt?.slice(0, 10) ?? '-'} 过期:${c.expiresAt?.slice(0, 10) ?? '-'} ${c.note ?? ''}`;

switch (cmd) {
  case 'generate': {
    const count = Number(args[0]) || 1;
    const uses = Number(args[1]) || 3;
    const note = args[2] || '';
    const data = await call('/admin/generate', { count, uses, note });
    console.log(`已生成 ${data.count} 个兑换码（每个 ${data.uses} 次）。明文仅此一次，请立即保存：\n`);
    data.codes.forEach((c) => console.log(c));
    break;
  }
  case 'list': {
    const data = await call('/admin/codes');
    data.codes.forEach((c) => console.log(fmt(c)));
    break;
  }
  case 'query': {
    const data = await call(`/admin/codes?code=${encodeURIComponent(args[0] || '')}`);
    data.codes.forEach((c) => console.log(fmt(c)));
    break;
  }
  case 'freeze':
  case 'unfreeze':
  case 'void': {
    const data = await call(`/admin/${cmd}`, { code: args[0] });
    console.log('完成：', data.status);
    break;
  }
  case 'records': {
    const data = await call(`/admin/records?code=${encodeURIComponent(args[0] || '')}`);
    data.records.forEach((r) =>
      console.log(
        `${r.started_at?.slice(0, 19)} 第${r.attempt_no}次 状态:${r.status} 扣次:${r.consumed} 用户:${r.user_id?.slice(0, 8)}… ${r.episode ? `结果:${r.episode}集·${r.archetype}` : ''}`
      )
    );
    break;
  }
  case 'migrate': {
    await call('/admin/migrate', { code: args[0], to_user_id: args[1], reason: args[2] });
    console.log('迁移完成，已留痕。');
    break;
  }
  default:
    console.log('未知命令。查看脚本头部用法说明。');
}
