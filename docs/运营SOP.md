# 甄嬛传测评 · 日常运营 SOP

> 最后更新：2026-11-08

## 〇、基础信息卡

| 项目 | 值 |
|---|---|
| 正式网址 | https://gongdou-test.netlify.app |
| 备用网址 | https://nicejk.github.io/zhenhuan-survival-test/（国内可能不稳定） |
| 商品规则 | 5 位数字码 / 3 次测评 / 首次激活起 7 天有效 / 绑定一台设备 |
| 管理后台 | Supabase Dashboard → Table Editor → codes 表（看状态）；终端脚本（干活） |
| 管理脚本 | `scripts/admin.mjs`（密钥在 `scripts/.admin-key`，绝不外传） |

使用终端命令前，先进入项目目录（每个新终端窗口只需执行一次，代理已自动处理）：

```bash
cd /Users/whs/Desktop/trae_project/test_page
```

---

## 一、备货（每周或库存不足时）

```bash
node scripts/admin.mjs generate 50 3 批次-1108
```

1. 输出里的明文码**立刻**复制到本地备忘录/Excel 保存（一码一行）。
2. 在表格里加一列"状态"：未售 / 已售-订单号。

> ⚠️ 数据库只存哈希，明文只在生成时出现一次，丢了找不回，只能作废重发。

## 二、用户下单 → 发货（约 30 秒/单）

1. 确认收款（小红书私信/闲鱼）。
2. 从库存表顺序取一个**未售**码，标记为"已售-买家昵称/订单号"。
3. 发送话术（直接复制）：

> 你的测评兑换码：**51017**
> ① 打开 https://gongdou-test.netlify.app
> ② 输入兑换码，即可开始
> 可测 3 次，首次使用后 7 天内有效。兑换码绑定首次使用的设备，请勿分享给他人，也不要清除浏览器数据。

## 三、售后场景速查

| 买家说 | 你做什么 |
|---|---|
| "码不能用/提示不正确" | `node scripts/admin.mjs query 51017` 查状态。多半已被别的设备绑定 → 问买家是否换过设备/浏览器 |
| "我换手机了 / 清了浏览器" | 0.99 元商品建议直接补发新码；坚持换绑则用 `node scripts/admin.mjs migrate 51017 <新用户UUID> 换设备` |
| "我要退款" | `node scripts/admin.mjs freeze 51017` 冻结，库存补一个新码 |
| "次数不对/少了一次" | `node scripts/admin.mjs records 51017` 查该码全部测评记录，截图核对 |

其他常用命令：

```bash
node scripts/admin.mjs list                 # 最近码的状态总览
node scripts/admin.mjs unfreeze 51017       # 解冻
node scripts/admin.mjs void 51017           # 作废（不可恢复）
```

## 四、每日 / 每周例行

**每日**（有单时）：按第二节发货即可。

**每周**（约 3 分钟）：

1. `node scripts/admin.mjs list` 扫一眼有无异常状态（frozen 堆积、陌生绑定）。
2. 库存 < 10 个时执行第一节备货。
3. 打开 Supabase 项目首页确认用量未接近免费额度。

## 五、红线（别踩）

1. **一码只发一人**——发出即登记订单号，售后全靠它对账。
2. `scripts/.admin-key` 是管理后台钥匙，不发给任何人。
3. 不要直接改数据库给买家"加次数"——要补偿就发新码。
4. 网站代码改动通过 git push 自动部署，不影响已售出的码。

## 六、应急

| 情况 | 处理 |
|---|---|
| 网站打不开 | 先试备用地址；两个都不行 → 联系开发 |
| 大量买家反馈激活失败 | 可能是限流误伤（多人共用 IP），`admin.mjs list` 无异常 → 联系开发 |
| 怀疑码被批量盗刷 | `admin.mjs list` 看是否有大量陌生激活 → 有则把未售批次全部 `void`，重新备货 |
