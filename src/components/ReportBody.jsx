import React from 'react';

/**
 * 完整版报告正文（不含底部操作按钮与弹窗），
 * 供 ReportView 页面与"完整版长图"截图复用。
 */
export default function ReportBody({ result }) {
  const full = result.full;

  return (
    <>
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
    </>
  );
}
