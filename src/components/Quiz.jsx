import React, { useEffect, useRef, useState } from 'react';
import { QUESTION_BY_ID, USER_ORDER } from '../../shared/questions.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Quiz({ answers, index, setIndex, onAnswer, onFinish, remaining, busy }) {
  const total = USER_ORDER.length;
  const current = QUESTION_BY_ID[USER_ORDER[index]];
  const selected = answers[current.id];
  const answered = Object.keys(answers).length;
  const isLast = index === total - 1;
  const progress = ((index + 1) / total) * 100;
  const [advancing, setAdvancing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  // 切换题目后重置过渡态
  useEffect(() => { setAdvancing(false); }, [index]);

  const pick = (i) => {
    if (advancing || busy) return;
    onAnswer(current.id, i);
    setAdvancing(true);
    // 停留一瞬，让用户看到选中反馈，再自动进入下一题 / 提交
    timerRef.current = setTimeout(() => {
      if (isLast) onFinish({ ...answers, [current.id]: i });
      else setIndex(index + 1);
    }, 320);
  };

  return (
    <section className="quiz">
      <header className="quiz-top">
        <button
          className="icon-btn"
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="上一题"
        >
          ←
        </button>
        <div className="quiz-count">
          第 <b>{index + 1}</b> / {total} 题
        </div>
        <div className="quiz-remaining">{remaining !== null ? `剩余 ${remaining} 次` : ''}</div>
      </header>

      <div className="quiz-bar">
        <div className="quiz-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <main className="quiz-body" key={current.id}>
        <p className="quiz-scene">{current.scene}</p>
        <h2 className="quiz-q">{current.text}</h2>

        <div className="quiz-options">
          {current.options.map((opt, i) => (
            <button
              key={i}
              className={`opt ${selected === i ? 'selected' : ''}`}
              onClick={() => pick(i)}
              disabled={busy}
            >
              <span className="opt-letter">{LETTERS[i]}</span>
              <span className="opt-text">{opt.text}</span>
              {selected === i && <span className="opt-check">✓</span>}
            </button>
          ))}
        </div>
      </main>

      <footer className="quiz-nav">
        <button className="btn-ghost" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>
          上一题
        </button>
        {isLast && busy && <span className="quiz-submitting">正在结算…</span>}
      </footer>

      <p className="quiz-meta">已作答 {answered} / {total}</p>
    </section>
  );
}
