import React, { useState } from 'react';
import Radar from './Radar.jsx';
import ShareModal from './ShareModal.jsx';

export default function ResultView({
  result,
  onNext,
  attempts = [],
  activeToken,
  remaining,
  viewOnly = false,
  onSelectAttempt,
  onRetest,
  onSwitchCode,
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [retestOpen, setRetestOpen] = useState(false);
  const dims = result.dimDetail.map((d) => ({ name: d.name, score: d.score }));

  const hasCompare = attempts.length > 1;
  const first = hasCompare ? attempts[0] : null;
  const latest = hasCompare ? attempts[attempts.length - 1] : null;

  let deltaText = '';
  let compareLine = '';
  let dimDiffs = [];
  if (hasCompare) {
    const episodeDiff = latest.result.episode - first.result.episode;
    if (episodeDiff > 0) deltaText = `第 ${latest.attemptNo} 次比第 1 次多活了 ${episodeDiff} 集`;
    else if (episodeDiff < 0) deltaText = `第 ${latest.attemptNo} 次比第 1 次少活了 ${-episodeDiff} 集`;
    else deltaText = `第 1 次和第 ${latest.attemptNo} 次集数完全一样`;

    dimDiffs = latest.result.dimDetail
      .map((d, i) => ({ name: d.name, diff: d.score - first.result.dimDetail[i].score }))
      .filter((d) => Math.abs(d.diff) >= 15)
      .slice(0, 3);

    const archetypeChanged = first.result.archetype.name !== latest.result.archetype.name;
    if (archetypeChanged) {
      compareLine = `原型从 ${first.result.archetype.name}型 走到了 ${latest.result.archetype.name}型`;
    } else if (dimDiffs.length === 0) {
      compareLine = '两次差异很小，第一次的结果更可信';
    } else {
      compareLine = `原型仍是 ${latest.result.archetype.name}型，变化主要落在下面几项`;
    }
  }

  return (
    <section className="result">
      {hasCompare && (
        <div className="compare">
          <p className="compare-eyebrow">测评对照</p>
          <div className="compare-tabs">
            {attempts.map((a) => (
              <button
                key={a.token}
                className={`compare-tab ${a.token === activeToken ? 'active' : ''}`}
                onClick={() => onSelectAttempt(a)}
              >
                第 {a.attemptNo} 次 · {a.result.episode} 集
              </button>
            ))}
          </div>
          <p className="compare-delta">{deltaText}</p>
          <p className="compare-line">
            第 1 次 vs 第 {latest.attemptNo} 次｜{compareLine}
          </p>
          {dimDiffs.length > 0 && (
            <div className="compare-chips">
              {dimDiffs.map((d) => (
                <span key={d.name} className={`compare-chip ${d.diff < 0 ? 'down' : ''}`}>
                  {d.name} {d.diff > 0 ? '+' : ''}
                  {d.diff}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="result-hero">
        <p className="result-eyebrow">你的宫斗生存力结算</p>
        <div className="ep-block">
          <span className="ep-pre">你能活到</span>
          <span className="ep-num">{result.episode}</span>
          <span className="ep-suf">集</span>
        </div>
        <p className="ep-label">{result.episodeLabel}</p>

        <div className="cause-pill">
          <span className="cause-tag">死因</span>
          <span>{result.cause.title.replace('死于', '')}</span>
        </div>
        <p className="cause-line">{result.cause.line}</p>
      </div>

      <div className="arch-card">
        <div className="arch-head">
          <span className="arch-name">
            {result.archetype.name}型
            <em>｜{result.archetype.alias}</em>
          </span>
          <span className="arch-total">生存力 {result.total}</span>
        </div>
        <p className="arch-verdict">「{result.archetype.verdict}」</p>
      </div>

      <div className="radar-wrap">
        <Radar items={dims} size={300} />
      </div>

      <div className="dim-list">
        {result.dimDetail.map((d) => (
          <div className={`dim-row ${d.isWeakest ? 'weak' : ''} ${d.isStrongest ? 'strong' : ''}`} key={d.key}>
            <span className="dim-name">
              {d.name}
              {d.isStrongest && <i className="badge strong">最强</i>}
              {d.isWeakest && <i className="badge weak">短板</i>}
            </span>
            <span className="dim-track"><span className="dim-fill" style={{ width: `${d.score}%` }} /></span>
            <span className="dim-score">{d.score}</span>
          </div>
        ))}
      </div>

      <article className="sec">
        <h3 className="sec-title"><i />你的核心优势</h3>
        <p className="sec-lead">{result.archetype.advantageTitle}</p>
        <p className="sec-body">{result.archetype.advantage}</p>
        <p className="theory-tag">理论依据 · {result.archetype.theory}</p>
      </article>

      <article className="sec">
        <h3 className="sec-title"><i />你的致命风险</h3>
        <p className="sec-lead">{result.archetype.riskTitle}</p>
        <p className="sec-body">{result.archetype.risk}</p>
      </article>

      <article className="sec">
        <h3 className="sec-title"><i />现实里的你</h3>
        <p className="sec-body">{result.archetype.reality}</p>
      </article>

      <blockquote className="quote">「{result.archetype.quote}」</blockquote>

      <article className="sec">
        <h3 className="sec-title"><i />你可以练的一件事</h3>
        <p className="sec-body practice">{result.archetype.practice}</p>
      </article>

      <div className="result-actions">
        <button className="btn-primary" onClick={() => setShareOpen(true)}>生成结果长图</button>
      </div>

      <div className="paywall-card" onClick={onNext}>
        <span className="paywall-badge">完整版</span>
        <div className="paywall-copy">
          <b>六维逐项深读、三个高风险时刻、30 天微调计划</b>
          <span>点击直接查看，无需付费</span>
        </div>
        <span className="paywall-arrow">→</span>
      </div>

      {!viewOnly && (
        <div className="retest">
          {remaining > 0 ? (
            <button className="retest-link" onClick={() => setRetestOpen(true)}>
              这不太像我？再测一次
              <span className="retest-remaining">（还剩 {remaining} 次）</span>
            </button>
          ) : remaining === 0 ? (
            <p className="retest-empty">本兑换码的 3 次机会已用完。</p>
          ) : (
            <button className="retest-link" onClick={() => setRetestOpen(true)}>
              这不太像我？再测一次
            </button>
          )}
        </div>
      )}

      {retestOpen && (
        <div className="modal-mask" onClick={() => setRetestOpen(false)}>
          <div className="modal retest-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setRetestOpen(false)}>✕</button>
            <h3 className="modal-title">再测一次？</h3>
            <p className="retest-text">
              重测会消耗 1 次机会
              {remaining > 0 ? `（本兑换码还剩 ${remaining} 次）` : ''}。第一次的结果不会丢，
              我们会把两次放在一起，看看你变了多少。
            </p>
            <p className="retest-tip">建议隔一段时间再测。刚做完立刻重测，答案会受上一轮影响。</p>
            <button
              className="btn-primary"
              onClick={() => {
                setRetestOpen(false);
                onRetest();
              }}
            >
              开始重测
            </button>
            <button className="btn-ghost" onClick={() => setRetestOpen(false)}>先不了</button>
          </div>
        </div>
      )}

      <ShareModal result={result} open={shareOpen} onClose={() => setShareOpen(false)} />
    </section>
  );
}
