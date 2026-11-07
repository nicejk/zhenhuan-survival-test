import { store } from './store/index.js';

const DEMO_CODES = ['ZHENHUAN-001', 'ZHENHUAN-002', 'ZHENHUAN-003', 'BINGUAN-001', 'BINGUAN-002'];

const existing = await store.listPasswords();
if (existing.length > 0) {
  console.log(`已有 ${existing.length} 个密码，跳过种子数据。`);
} else {
  await store.createPasswords(DEMO_CODES, 3, '演示密码');
  console.log('已创建演示密码（每个可用 3 次）：');
  DEMO_CODES.forEach((c) => console.log('  •', c));
}
