# Netlify 正式部署实施报告

日期：2026-11-08 ｜ 架构：Netlify 静态托管 + 同域 Functions 白名单代理 → Supabase

## 一、目标与结论

解决国内无代理无法访问的问题（workers.dev / vercel.app / supabase.co 直连均被墙）。

**正式地址（国内可直接访问）：https://gongdou-test.netlify.app**

浏览器只与同域 `gongdou-test.netlify.app` 通信，由 Netlify Function 把 `/sb/*` 白名单转发到 Supabase，国内链路全程不触碰被墙域名。**验收全部通过。**

## 二、修改文件清单

| 文件 | 变更 |
|---|---|
| `netlify.toml` | 新建。构建命令、dist 发布目录、functions 目录、SPA 回退 |
| `netlify/functions/proxy.mjs` | 新建。同域白名单代理（仅 `auth/v1/*`、`functions/v1/api/*`） |
| `src/lib/supabase.js` | 生产默认 `window.location.origin + /sb`；本地开发直连 Supabase |
| `src/App.jsx` | API_BASE 生产默认走 `/sb/functions/v1`；过期页按钮与用完页统一为"使用新兑换码"，移除死代码 `purchase` / `VITE_PURCHASE_URL` |
| `.github/workflows/deploy-netlify.yml` | 新建。push main 自动构建部署，只注入 anon key |

GitHub Pages 与 Cloudflare Workers 构建通过显式注入 `VITE_SUPABASE_URL` / `VITE_API_BASE` 保持原有直连逻辑不变，三个平台共用一份代码。

## 三、代理安全设计（proxy.mjs）

- 白名单前缀：仅 `auth/v1/` 与 `functions/v1/api/`，其余一律 403
- 转发头白名单：`authorization` / `apikey` / `content-type` / `x-client-info`（**`x-admin-key` 不转发**，管理端无法经公网代理触达）
- 上游固定为 `juiaetgiyltpbmmvctdc.supabase.co`，不可被请求参数改写
- 15 秒超时（504）、上游异常 502、OPTIONS 预检 204、所有响应 `cache-control: no-store`
- 前端只持有 publishable anon key，无 Service Role Key
- 限流/防暴破在服务端 Edge Function 内生效（5 次/分钟/IP、10 次失败封 15 分钟），激活失败文案统一，不泄露码是否存在

## 四、验收结果

### 1. 静态与代理链路（11/11 PASS，此前已完成）

首页 200、SPA 回退、静态资源、代理 health、4 条非白名单路径线上 403、代理匿名登录（is_anonymous=true）、Token 刷新、带 JWT 的 /me。

### 2. 真实浏览器全链路（browser_use 实测，全 PASS）

- 锁屏页文案、5 位码输入框、"开启殿门"正常
- 激活码 45465 成功：剩余 3/3，有效期至 2026-11-15
- 25 题作答 → 结果页完整：第 17 集 · 死因"说得太多" · 叶澜依型（不驯的野马）· 生存力 40.9 · 六维雷达图 · 各分析模块
- 刷新页面：身份恢复，不回落锁屏，显示历史"第 1 次 · 活到 17 集"，次数 3→2
- 控制台零报错，全部网络请求成功

### 3. 线上 API 回归（经 /sb 代理，10/10 PASS）

用码 53298 全流程：匿名注册 → 激活（3/3）→ 第 1 次完成扣次（余 2）→ 同 request_id 重复完成幂等不扣 → 非法答案失败不扣（仍余 2）→ 第 2 次（余 1）→ 第 3 次（余 0）→ **第 4 次被服务端 403 拒绝（reason=exhausted）** → 分享结果 `/result/:id` 公开读取正常。

### 4. 分享功能说明

分享形式为"结果长图 + 分享文案"（结果页 ShareModal），另有 `/result/:id` 链接可公开读取结果 JSON，两项均验证正常。

## 五、剩余事项与风险

1. **手机浏览器实测**：仅桌面浏览器验证过，建议你用手机（关 WiFi 用蜂窝 + 各开一次微信内置浏览器）打开 https://gongdou-test.netlify.app 自测一遍。
2. **运营操作的代理依赖**：`scripts/admin.mjs`（生成/冻结/作废码）直连 supabase.co，你的终端需要开代理才能用；不开代理时可以交给我执行。
3. **匿名身份与浏览器绑定**：用户清除浏览器数据会丢失身份（兑换码绑在匿名 user 上），需用 `admin.mjs migrate` 人工迁移，SOP 已覆盖。
4. **备用入口**：GitHub Pages 与 Cloudflare Workers 仍同步自动部署，国外或挂代理环境可用。

## 六、免费额度注意事项（Netlify Free 档）

- 带宽 100GB/月、函数调用 125k 次/月、构建 300 分钟/月（以官网当前档位为准）
- 单次完整测评约消耗 4~6 次函数调用（注册/刷新/me/激活/开始/完成），**每月约可支撑 2 万次以上测评**，小规模售卖完全够用
- 若小红书引流爆量，优先在 Netlify Dashboard 看函数调用量；超出后再考虑升级或加一层边缘缓存
