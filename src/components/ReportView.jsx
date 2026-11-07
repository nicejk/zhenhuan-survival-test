import React, { useState } from 'react';
import ShareModal from './ShareModal.jsx';

export default function ReportView({ result, unlocked, onUnlock, onNotify, onBack }) {
  const [payOpen, setPayOpen] = useState(false);
  const [payState, setPayState] = useState('idle'); // idle | paying | success
  const [shareOpen, setShareOpen] = useState(false);

  const pay = async () => {
    setPayState('paying');
    try {
      await new Promise((r) => setTimeout(r, 1500));
      await onUnlock();
      setPayState('success');
      setTimeout(() => {
        setPayOpen(false);
        setPayState('idle');
      }, 900);
    } catch (e) {
      setPayState('idle');
      onNotify(e.message || '支付失败，请重试');
    }
  };

  if (!unlocked) {
    return (
      <section className="report">
        <header className="report-head">
          <p className="report-eyebrow">完整版 · 深度报告</p>
          <h2 className="report-title">你的宫斗生存力<br />还没看完</h2>
          <p className="report-sub">这一页只是结算单，真正能用的东西在下面。</p>
        </header>

        <div className="paywall">
          <div className="paywall-price">
            <span className="price-symbol">¥</span>
            <span className="price-num">9.9</span>
            <span className="price-old">¥29.9</span>
          </div>
          <ul className="paywall-list">
            <li>六维逐项深读 · 每一项都告诉你为什么是这个分</li>
            <li>三个高风险时刻 · 你会栽在哪一步，怎么提前拆局</li>
            <li>职场 / 家庭 / 亲密关系 · 三种场景下的具体活法</li>
            <li>30 天微调计划 · 每周一个可执行动作</li>
            <li>专属排版 · 可截图收藏，也可打印出来</li>
          </ul>
          <button className="btn-primary paywall-btn" onClick={() => setPayOpen(true)}>
            解锁完整版报告
          </button>
          <p className="paywall-note">一次付费，本结果永久可看</p>
        </div>

        {payOpen && (
          <div className="modal-mask" onClick={() => payState === 'idle' && setPayOpen(false)}>
            <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
              {payState === 'idle' && (
                <>
                  <button className="modal-close" onClick={() => setPayOpen(false)}>✕</button>
                  <h3 className="modal-title">确认支付</h3>
                  <div className="pay-amount">
                    <span className="price-symbol">¥</span>
                    <span className="price-num">9.9</span>
                  </div>
                  <p className="pay-desc">解锁《{result.archetype.name}型 · {result.archetype.alias}》完整版深度报告</p>
                  <button className="btn-primary" onClick={pay}>微信支付</button>
                  <p className="pay-note">当前为演示环境，点击即视为支付成功</p>
                </>
              )}
              {payState === 'paying' && (
                <div className="pay-loading">
                  <div className="spinner" />
                  <p>正在支付…</p>
                </div>
              )}
              {payState === 'success' && (
                <div className="pay-success">
                  <div className="success-mark">✓</div>
                  <p>支付成功，正在展开完整报告</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  const full = result.full;

  return (
    <section className="report full-report">
      <header className="report-head">
        <p className="report-eyebrow">完整版 · 深度报告</p>
        <h2 className="report-title">
          {result.archetype.name}型
          <br />
          <span className="report-alias">{result.archetype.alias}</span>
        </h2>
        <div className="report-meta">
          <span>第 {result.episode} 集</span>
          <span>{result.cause.title.replace('死于', '死于')}</span>
          <span>生存力 {result.total}</span>
        </div>
      </header>

      <article className="chapter">
        <div className="chapter-no">壹</div>
        <h3 className="chapter-title">你的生存画像</h3>
        {full.portrait.map((p, i) => (
          <p className="chapter-body" key={i}>{p}</p>
        ))}
      </article>

      <article className="chapter">
        <div className="chapter-no">贰</div>
        <h3 className="chapter-title">六维逐项深读</h3>
        {full.dimDetail.map((d) => (
          <div className="deep-dim" key={d.key}>
            <div className="deep-dim-head">
              <span className="deep-dim-name">{d.name}</span>
              <span className={`deep-dim-score s-${d.level}`}>{d.score}</span>
            </div>
            <p className="deep-dim-text">{d.reading}</p>
            <p className="deep-dim-theory">{d.theory}</p>
          </div>
        ))}
      </article>

      <article className="chapter">
        <div className="chapter-no">叁</div>
        <h3 className="chapter-title">三个高风险时刻</h3>
        {full.moments.map((m, i) => (
          <div className="moment" key={i}>
            <span className="moment-no">{i + 1}</span>
            <div>
              <b>{m.title}</b>
              <p>{m.text}</p>
            </div>
          </div>
        ))}
      </article>

      <article className="chapter">
        <div className="chapter-no">肆</div>
        <h3 className="chapter-title">现实中的三个角色</h3>
        {full.roles.map((r, i) => (
          <div className="role-item" key={i}>
            <span className="role-scene">{r.scene}</span>
            <p>{r.text}</p>
          </div>
        ))}
      </article>

      <article className="chapter">
        <div className="chapter-no">伍</div>
        <h3 className="chapter-title">30 天微调计划</h3>
        <div className="plan">
          {full.plan.map((p, i) => (
            <div className="plan-item" key={i}>
              <span className="plan-week">{p.period}</span>
              <p>{p.text}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="chapter closing">
        <div className="chapter-no">结</div>
        <h3 className="chapter-title">写在最后</h3>
        <p className="chapter-body">{full.closing}</p>
        <p className="closing-quote">「{result.archetype.quote}」</p>
      </article>

      <div className="end-seal">已 阅</div>

      <div className="report-actions">
        <button className="btn-primary" onClick={() => setShareOpen(true)}>生成结果长图</button>
        <button className="btn-ghost" onClick={onBack}>返回结果页</button>
      </div>

      <ShareModal result={result} open={shareOpen} onClose={() => setShareOpen(false)} />
    </section>
  );
}
