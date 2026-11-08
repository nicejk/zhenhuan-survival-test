import React, { useState } from 'react';

export default function LockScreen({ onAuth, busy, entitlement }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const frozenNote =
    entitlement?.status === 'frozen'
      ? '你的兑换码已被冻结，请联系客服。'
      : entitlement?.status === 'void'
        ? '你的兑换码已作废，请联系客服。'
        : '';

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.trim();
    if (!clean) {
      setErr('请先输入兑换码');
      return;
    }
    setErr('');
    try {
      await onAuth(clean);
    } catch (ex) {
      setErr(ex.message);
    }
  };

  return (
    <section className="lock">
      <div className="lock-bg" aria-hidden="true">
        <div className="lock-wall" />
        <div className="lock-glow" />
      </div>

      <div className="lock-inner">
        <p className="lock-eyebrow">甄 嬛 传 · 生 存 力 测 评</p>

        <h1 className="lock-title">
          你能在甄嬛传中
          <br />
          活到<span className="hl">大结局</span>吗
        </h1>

        <p className="lock-sub">
          25 道真实情境题 · 六维权力生存力
          <br />
          算出一个属于你的集数
        </p>

        <div className="seal" aria-hidden="true">
          <span>生</span>
          <span>存</span>
        </div>

        <form className="lock-card" onSubmit={submit}>
          <label className="lock-label" htmlFor="code">
            请输入兑换码
          </label>
          <input
            id="code"
            className="lock-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="请输入 5 位数字兑换码"
            maxLength={19}
            autoComplete="off"
            spellCheck="false"
          />
          <button className="btn-primary lock-btn" type="submit" disabled={busy}>
            {busy ? '正在验证…' : '开启殿门'}
          </button>
          {err && <p className="lock-error">{err}</p>}
          {frozenNote && !err && <p className="lock-error">{frozenNote}</p>}
          <p className="lock-hint">每个兑换码可测 3 次，首次使用后 7 天内有效</p>
        </form>

        <p className="lock-foot">
          本测评为娱乐向性格测验，结果不构成任何现实建议
        </p>
      </div>
    </section>
  );
}
