import React, { useEffect, useState } from 'react';
import LockScreen from './components/LockScreen.jsx';
import { TOTAL_QUESTIONS } from '../shared/questions.js';
import Quiz from './components/Quiz.jsx';
import ResultView from './components/ResultView.jsx';
import ReportView from './components/ReportView.jsx';
import { ensureIdentity, accessToken } from './lib/supabase.js';

const ATTEMPT_KEY = 'zh_attempt';
const draftKey = (rid) => `zh_answers:${rid}`;

// 本地开发走 Vite 代理；线上通过 VITE_API_BASE 指向 Supabase Edge Function
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const PURCHASE_URL = import.meta.env.VITE_PURCHASE_URL || '';

async function api(path, body) {
  const token = await accessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const err = new Error(data.message || '网络异常，请重试');
    err.reason = data.reason;
    err.entitlement = data.entitlement;
    throw err;
  }
  return data;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function App() {
  const [stage, setStage] = useState('boot');
  const [userId, setUserId] = useState(null);
  const [entitlement, setEntitlement] = useState(null); // { bound, status, remaining, expiresAt, totalUses }
  const [attempt, setAttempt] = useState(null); // 进行中测评 { token, requestId, attemptNo }
  const [attempts, setAttempts] = useState([]); // 已完成记录
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [viewOnly, setViewOnly] = useState(false); // 通过分享链接看别人的结果
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const refreshAttempts = async () => {
    try {
      const data = await api('/api/attempts');
      setAttempts(data.attempts || []);
      return data.attempts || [];
    } catch {
      return [];
    }
  };

  // 根据权益状态决定去哪个页面
  const routeByEntitlement = async (ent) => {
    if (!ent?.bound) {
      setStage('lock');
      return;
    }
    if (ent.status === 'active') {
      const list = await refreshAttempts();
      // 有进行中的测评：直接恢复到断点
      const saved = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || 'null');
      if (saved?.requestId) {
        try {
          const r = await api('/api/attempts', { request_id: saved.requestId });
          const draft = JSON.parse(localStorage.getItem(draftKey(saved.requestId)) || '{}');
          setAttempt({ token: r.token, requestId: saved.requestId, attemptNo: r.attemptNo });
          setAnswers(draft);
          setIndex(Math.min(Object.keys(draft).length, TOTAL_QUESTIONS - 1));
          setStage('quiz');
          return;
        } catch {
          localStorage.removeItem(ATTEMPT_KEY);
        }
      }
      setAttempts(list);
      setStage('gate');
      return;
    }
    if (ent.status === 'exhausted') {
      await refreshAttempts();
      setStage('exhausted');
      return;
    }
    if (ent.status === 'expired') {
      setStage('expired');
      return;
    }
    setStage('lock'); // frozen / void / inactive
  };

  // 启动：匿名身份 → 分享链接优先 → 权益路由
  useEffect(() => {
    (async () => {
      try {
        await ensureIdentity();
        const urlToken = new URLSearchParams(window.location.search).get('t');
        if (urlToken) {
          const res = await fetch(`${API_BASE}/api/result/${urlToken}`);
          const data = await res.json().catch(() => ({}));
          if (data?.ok && data.completed) {
            setResult(data.result);
            setViewOnly(true);
            setStage('result');
            return;
          }
        }
        const me = await api('/api/me');
        setUserId(me.userId);
        setEntitlement(me.entitlement);
        await routeByEntitlement(me.entitlement);
      } catch (e) {
        notify(e.message || '初始化失败，请刷新重试');
        setStage('lock');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 激活兑换码
  const handleActivate = async (code) => {
    setBusy(true);
    try {
      const data = await api('/api/activate', { code });
      setEntitlement(data.entitlement);
      notify('兑换成功，权益已绑定本设备');
      await routeByEntitlement(data.entitlement);
    } finally {
      setBusy(false);
    }
  };

  // 开始 / 继续一次测评
  const handleBegin = async () => {
    setBusy(true);
    try {
      const saved = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || 'null');
      const requestId = saved?.requestId || crypto.randomUUID();
      const r = await api('/api/attempts', { request_id: requestId });
      localStorage.setItem(ATTEMPT_KEY, JSON.stringify({ requestId, token: r.token }));
      const draft = r.resumed
        ? JSON.parse(localStorage.getItem(draftKey(requestId)) || '{}')
        : {};
      setAttempt({ token: r.token, requestId, attemptNo: r.attemptNo });
      setAnswers(draft);
      setIndex(Math.min(Object.keys(draft).length, TOTAL_QUESTIONS - 1));
      setStage('quiz');
    } catch (e) {
      if (e.entitlement) {
        setEntitlement(e.entitlement);
        await routeByEntitlement(e.entitlement);
      }
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = (qid, optIndex) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: optIndex };
      if (attempt) localStorage.setItem(draftKey(attempt.requestId), JSON.stringify(next));
      return next;
    });
  };

  // 提交：服务端计分 + 原子扣次
  const handleFinish = async (finalAnswers) => {
    setBusy(true);
    try {
      const data = await api('/api/attempts/complete', {
        request_id: attempt.requestId,
        answers: finalAnswers,
      });
      localStorage.removeItem(ATTEMPT_KEY);
      localStorage.removeItem(draftKey(attempt.requestId));
      setResult(data.result);
      setViewOnly(false);
      setEntitlement((prev) => (prev ? { ...prev, remaining: data.remaining } : prev));
      setStage('result');
      window.scrollTo({ top: 0, behavior: 'instant' });
      refreshAttempts();
    } catch (e) {
      if (e.entitlement) {
        setEntitlement(e.entitlement);
        await routeByEntitlement(e.entitlement);
      }
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  // 重测 = 再开一次测评（次数由服务端原子控制）
  const handleRetest = async () => {
    localStorage.removeItem(ATTEMPT_KEY);
    setResult(null);
    setAttempt(null);
    setAnswers({});
    setIndex(0);
    await handleBegin();
  };

  const handleSelectAttempt = (a) => {
    setResult(a.result);
    setViewOnly(false);
    setStage('result');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const purchase = () => {
    if (PURCHASE_URL) window.open(PURCHASE_URL, '_blank');
    else notify('购买入口即将上线，请留意小红书店铺');
  };

  const remaining = entitlement?.remaining ?? null;

  return (
    <div className="app">
      {stage === 'boot' && <div className="boot">正在开殿门…</div>}

      {stage === 'lock' && (
        <LockScreen onAuth={handleActivate} busy={busy} onNotify={notify} entitlement={entitlement} />
      )}

      {stage === 'gate' && (
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
            <div className="ent-card">
              <div className="ent-row">
                <span>剩余测评次数</span>
                <b>{remaining} / {entitlement?.totalUses ?? 3}</b>
              </div>
              <div className="ent-row">
                <span>有效期至</span>
                <b>{fmtDate(entitlement?.expiresAt)}</b>
              </div>
              <div className="ent-row">
                <span>当前状态</span>
                <b className="ent-ok">可测评</b>
              </div>
            </div>
            <button className="btn-primary lock-btn" onClick={handleBegin} disabled={busy}>
              {busy ? '正在安排…' : attempts.length > 0 ? '再测一次' : '开始测评'}
            </button>
            {attempts.length > 0 && (
              <div className="gate-history">
                {attempts.map((a) => (
                  <button key={a.token} className="gate-history-item" onClick={() => handleSelectAttempt(a)}>
                    第 {a.attemptNo} 次 · 活到 {a.result.episode} 集
                  </button>
                ))}
              </div>
            )}
            <p className="lock-hint">权益已绑定本设备浏览器，清除数据或换设备需联系客服迁移</p>
          </div>
        </section>
      )}

      {stage === 'quiz' && attempt && (
        <Quiz
          answers={answers}
          index={index}
          setIndex={setIndex}
          onAnswer={handleAnswer}
          onFinish={handleFinish}
          remaining={remaining}
          expiresAt={fmtDate(entitlement?.expiresAt)}
          busy={busy}
        />
      )}

      {stage === 'result' && result && (
        <ResultView
          result={result}
          attempts={viewOnly ? [] : attempts}
          activeToken={attempt?.token}
          remaining={viewOnly ? null : remaining}
          expiresAt={fmtDate(entitlement?.expiresAt)}
          viewOnly={viewOnly}
          onNext={() => {
            setStage('report');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          onSelectAttempt={handleSelectAttempt}
          onRetest={handleRetest}
          onSwitchCode={() => setStage('lock')}
        />
      )}

      {stage === 'report' && result && (
        <ReportView
          result={result}
          onBack={() => {
            setStage('result');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
        />
      )}

      {stage === 'exhausted' && (
        <section className="lock">
          <div className="lock-bg" aria-hidden="true">
            <div className="lock-wall" />
            <div className="lock-glow" />
          </div>
          <div className="lock-inner">
            <p className="lock-eyebrow">体 验 权 益</p>
            <h1 className="lock-title">本次体验权益<br />已使用完毕</h1>
            <p className="lock-sub">您已完成 {entitlement?.totalUses ?? 3} 次测评，感谢体验！</p>
            <button className="btn-primary lock-btn" onClick={purchase}>去购买</button>
            {attempts.length > 0 && (
              <div className="gate-history">
                {attempts.map((a) => (
                  <button key={a.token} className="gate-history-item" onClick={() => handleSelectAttempt(a)}>
                    第 {a.attemptNo} 次 · 活到 {a.result.episode} 集
                  </button>
                ))}
              </div>
            )}
            <button className="switch-code" onClick={() => setStage('lock')}>使用新兑换码</button>
          </div>
        </section>
      )}

      {stage === 'expired' && (
        <section className="lock">
          <div className="lock-bg" aria-hidden="true">
            <div className="lock-wall" />
            <div className="lock-glow" />
          </div>
          <div className="lock-inner">
            <p className="lock-eyebrow">体 验 权 益</p>
            <h1 className="lock-title">您的体验权益<br />已过期</h1>
            <p className="lock-sub">如需继续使用，请重新购买体验权益。</p>
            <button className="btn-primary lock-btn" onClick={purchase}>去购买</button>
            <button className="switch-code" onClick={() => setStage('lock')}>使用新兑换码</button>
          </div>
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
