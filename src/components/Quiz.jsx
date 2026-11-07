import React from 'react';
import { QUESTION_BY_ID, USER_ORDER } from '../../shared/questions.js';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function Quiz({ answers, index, setIndex, onAnswer, onReselect, onFinish, remaining, busy }) {
  const total = USER_ORDER.length;
  const current = QUESTION_BY_ID[USER_ORDER[index]];
  const selected = answers[current.id];
  const answered = Object.keys(answers).length;
  const isLast = index === total - 1;
  const progress = ((index + 1) / total) * 100;

  const next = () => {
    if (selected === undefined) return;
    if (isLast) onFinish(answers);
    else setIndex(index + 1);
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
              onClick={() => onAnswer(current.id, i)}
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
        <button
          className="btn-text"
          onClick={() => onReselect(current.id)}
          disabled={selected === undefined}
        >
          重新选择
        </button>
        <button className="btn-primary quiz-next" onClick={next} disabled={selected === undefined || busy}>
          {isLast ? (busy ? '正在结算…' : '提交测评') : '下一题'}
        </button>
      </footer>

      <p className="quiz-meta">已作答 {answered} / {total}</p>
    </section>
  );
}
