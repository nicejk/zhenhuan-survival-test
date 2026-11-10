// 把 edge-functions 与 package.json 复制进 dist，供 edgeone pages deploy ./dist 使用
import { cpSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

if (!existsSync(dist)) {
  console.error('dist 不存在，请先执行 vite build');
  process.exit(1);
}

cpSync(resolve(root, 'edge-functions'), resolve(dist, 'edge-functions'), { recursive: true });
copyFileSync(resolve(root, 'package.json'), resolve(dist, 'package.json'));

console.log('已写入 dist/edge-functions 与 dist/package.json');
