import { store } from './store/index.js';
import crypto from 'node:crypto';

const count = Number(process.argv[2]) || 10;
const maxUses = Number(process.argv[3]) || 3;
const note = process.argv[4] || '批量生成';

const prefix = 'ZH';
const codes = Array.from({ length: count }, (_, i) => {
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${rand}-${String(i + 1).padStart(2, '0')}`;
});

await store.createPasswords(codes, maxUses, note);
console.log(`已生成 ${count} 个密码（每个 ${maxUses} 次）：`);
codes.forEach((c) => console.log('  ', c));
