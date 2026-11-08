import React from 'react';
import Radar from './Radar.jsx';

export default function ShareCard({ result }) {
  const { episode, cause, archetype, dims } = result;
  const dimList = [
    { name: '察言观色', score: dims.D1.score },
    { name: '人情经营', score: dims.D2.score },
    { name: '情绪自控', score: dims.D3.score },
    { name: '进退分寸', score: dims.D4.score },
    { name: '决断魄力', score: dims.D5.score },
    { name: '心性底线', score: dims.D6.score },
  ];

  return (
    <div className="share-card" id="share-card">
      <div className="sc-frame">
        <div className="sc-corner tl" />
        <div className="sc-corner tr" />
        <div className="sc-corner bl" />
        <div className="sc-corner br" />

        <p className="sc-eyebrow">甄 嬛 传 · 生 存 力 测 评</p>

        <div className="sc-ep">
          <span className="sc-ep-pre">我在甄嬛传中活到</span>
          <div className="sc-ep-num">
            <span className="sc-ep-label">第</span>
            <span className="sc-ep-digit">{episode}</span>
            <span className="sc-ep-label">集</span>
          </div>
        </div>

        <div className="sc-cause">
          <span className="sc-cause-tag">死因</span>
          <span className="sc-cause-text">{cause.title.replace('死于', '')}</span>
        </div>

        <div className="sc-arch">
          <div className="sc-arch-name">
            {archetype.name}型
            <span className="sc-arch-alias">｜{archetype.alias}</span>
          </div>
          <p className="sc-arch-verdict">{archetype.verdict}</p>
        </div>

        <div className="sc-radar">
          <Radar items={dimList} size={380} color="#8b1e1e" gold="#c9a24c" />
        </div>

        <div className="sc-dims">
          {dimList.map((d) => (
            <div className="sc-dim" key={d.name}>
              <span className="sc-dim-name">{d.name}</span>
              <span className="sc-dim-track">
                <span className="sc-dim-fill" style={{ width: `${d.score}%` }} />
              </span>
              <span className="sc-dim-score">{d.score}</span>
            </div>
          ))}
        </div>

        <p className="sc-quote">「{archetype.quote}」</p>

        <div className="sc-foot">
          <div className="sc-seal">生存力</div>
          <p className="sc-cta">你也来算一算，你能活到第几集</p>
        </div>
      </div>
    </div>
  );
}
