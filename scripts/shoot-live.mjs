// 临时脚本：用本机 Chrome headless + CDP 截取线上真实页面（答题页 / 结果页）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROXY = process.env.http_proxy || process.env.HTTP_PROXY || '';
// 本机 Chrome 调试端口直连，避免被终端代理环境变量影响
for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy']) delete process.env[k];
process.env.NO_PROXY = '127.0.0.1,localhost';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const SITE = 'https://gongdou-test.netlify.app';
const CODE = process.argv[2] || '16808';
const OUT = '.screenshots';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/cdp-shoot',
    '--hide-scrollbars',
    '--no-first-run',
    '--disable-extensions',
    ...(PROXY ? [`--proxy-server=${PROXY}`] : []),
    'about:blank',
  ], { stdio: 'ignore', detached: false });

  // 等 devtools 就绪
  let wsUrl;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await r.json();
      wsUrl = j.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
    await sleep(250);
  }
  if (!wsUrl) throw new Error('Chrome 未能启动');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response.url || '';
      if (u.includes('/sb/')) console.log('NET', m.params.response.status, u.replace(SITE, ''));
    }
    if (m.method === 'Network.loadingFailed') {
      console.log('NET-FAIL', m.params.errorText, 'canceled=' + m.params.canceled);
    }
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // 拿一个 page target
  const targets = await send('Target.getTargets');
  const page = targets.targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const cmd = (method, params = {}) => send(method, params, sessionId);
  // 带 sessionId 的请求需要走 message 的 sessionId 字段，这里重写 send
  const sendS = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  await sendS('Page.enable');
  await sendS('Network.enable');
  await sendS('Runtime.enable');
  await sendS('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true,
  });
  await sendS('Emulation.setUserAgentOverride', {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });

  const evalJS = async (expr) => {
    const r = await sendS('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };

  const waitFor = async (expr, timeout = 30000, label = '') => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evalJS(expr)) return true;
      await sleep(400);
    }
    throw new Error('等待超时: ' + (label || expr));
  };

  const shot = async (file) => {
    const { data } = await sendS('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const p = path.resolve(OUT, file);
    fs.writeFileSync(p, Buffer.from(data, 'base64'));
    console.log('saved', p, fs.statSync(p).size);
  };

  await sendS('Page.navigate', { url: SITE });
  await waitFor(`!!document.querySelector('#code')`, 60000, '锁屏页');
  // 等待匿名登录 + /api/me 初始化完成（期间按钮会处于 busy，过早点击会丢请求）
  await waitFor(`!document.querySelector('.lock-btn')?.disabled`, 30000, '按钮可用');
  await sleep(3000);

  console.log('HEALTH-CHROME:', await evalJS(`fetch('/sb/functions/v1/api/health', {cache:'no-store'}).then(r=>'status:'+r.status).catch(e=>'err:'+(e.message||e))`));

  // 填码并提交
  await evalJS(`(() => {
    const i = document.querySelector('#code');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(i, '${CODE}');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.lock-btn').click();
    return true;
  })()`);

  // 采样 12 秒内的提示文案（捕获 toast / 错误）
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const t = await evalJS(`document.body.innerText`);
    const hit = (t || '').split('\n').map((s) => s.trim()).filter((s) => /失败|错误|不正确|不可用|重试|过期|绑定/.test(s));
    for (const h of hit) if (!seen.has(h)) { seen.add(h); console.log('MSG:', h); }
    if (i === 6) console.log('DIAG:', await evalJS(`(() => { const b=document.querySelector('.lock-btn'); const i2=document.querySelector('#code'); return JSON.stringify({val:i2&&i2.value,disabled:b&&b.disabled,btn:b&&b.textContent}); })()`));
    if (i === 9) await shot('debug-after-activate.png');
    await sleep(500);
  }

  // 待开始页 → 开始测评
  await waitFor(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('开始测评') || b.textContent.includes('再测一次')) || !!document.querySelector('.quiz-options .opt')`, 30000, '待开始页');
  await sleep(800);
  await evalJS(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('开始测评') || x.textContent.includes('再测一次'));
    if (b) b.click();
    return !!b;
  })()`);

  // 答题页出现
  await waitFor(`!!document.querySelector('.quiz-options .opt')`, 30000, '答题页');
  await sleep(700);
  // 先答 2 题再截图，画面更完整（进度条已推进）
  await evalJS(`document.querySelectorAll('.quiz-options .opt')[1].click()`);
  await sleep(600);
  await evalJS(`document.querySelectorAll('.quiz-options .opt')[0].click()`);
  await sleep(900);
  await shot('live-quiz.png');

  // 快速答完剩余题目
  for (let i = 0; i < 40; i++) {
    const stillQuiz = await evalJS(`!!document.querySelector('.quiz-options .opt')`);
    if (!stillQuiz) break;
    await evalJS(`(() => { const o = document.querySelectorAll('.quiz-options .opt')[0]; if (o) o.click(); return !!o; })()`);
    await sleep(420);
  }

  await waitFor(`!!document.querySelector('.result')`, 40000, '结果页');
  await sleep(2200);
  await shot('live-result.png');

  const info = await evalJS(`(() => {
    const ep = document.querySelector('.ep-num')?.textContent;
    const label = document.querySelector('.ep-label')?.textContent;
    const arch = document.querySelector('.result')?.innerText.slice(0, 400);
    return JSON.stringify({ ep, label, arch });
  })()`);
  console.log('RESULT:', info);

  ws.close();
  chrome.kill('SIGKILL');
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
