import React, { useState } from 'react';

export default function LockScreen({ onAuth, busy, onNotify }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setErr('请先输入测评密码');
      return;
    }
    setErr('');
    try {
      await onAuth(code);
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
          你在宫里
          <br />
          能活到<span className="hl">第几集</span>
        </h1>

        <p className="lock-sub">
          32 道真实情境题 · 六维权力生存力
          <br />
          算出一个属于你的集数
        </p>

        <div className="seal" aria-hidden="true">
          <span>生</span>
          <span>存</span>
        </div>

        <form className="lock-card" onSubmit={submit}>
          <label className="lock-label" htmlFor="code">
            请输入测评密码
          </label>
          <input
            id="code"
            className="lock-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="例如 ZHENHUAN-001"
            autoComplete="off"
            spellCheck="false"
          />
          <button className="btn-primary lock-btn" type="submit" disabled={busy}>
            {busy ? '正在验令…' : '开启殿门'}
          </button>
          {err && <p className="lock-error">{err}</p>}
          <p className="lock-hint">每个密码可测 3 次，用完即止</p>
        </form>

        <p className="lock-foot">本测评为娱乐向性格测验，结果不构成任何现实建议</p>
      </div>
    </section>
  );
}
