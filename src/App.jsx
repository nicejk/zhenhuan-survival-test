import React, { useEffect, useState } from 'react';
import LockScreen from './components/LockScreen.jsx';
import Quiz from './components/Quiz.jsx';
import ResultView from './components/ResultView.jsx';
import ReportView from './components/ReportView.jsx';

const STORAGE_KEY = 'zh_token';
const draftKey = (token) => `zh_answers:${token}`;

// 本地开发走 Vite 代理；GitHub Pages 上通过 VITE_API_BASE 指向 Supabase Edge Function
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

async function api(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.message || '网络异常，请重试');
  return data;
}

async function loadAttempts(token) {
  try {
    const data = await api(`/api/attempts/${token}`);
    return data.attempts || [];
  } catch {
    return [];
  }
}

export default function App() {
  const [stage, setStage] = useState('boot');
  const [token, setToken] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const notify = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  // 刷新恢复：已完成直接进结果页，未完成回到断点；支持 ?t=<token> 凭链接回看结果
  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('t');
    const saved = urlToken || localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setStage('lock');
      return;
    }
    localStorage.setItem(STORAGE_KEY, saved);
    api(`/api/result/${saved}`)
      .then(async (data) => {
        setToken(saved);
        setRemaining(data.remaining ?? null);
        if (!data.completed) {
          const savedAnswers = JSON.parse(localStorage.getItem(draftKey(saved)) || '{}');
          setAnswers(savedAnswers);
          const answered = Object.keys(savedAnswers).length;
          setIndex(Math.min(answered, 31));
          setStage('quiz');
          return;
        }
        setResult(data.result);
        setUnlocked(data.unlocked);
        setAttempts(await loadAttempts(saved));
        setStage(data.unlocked ? 'report' : 'result');
      })
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(draftKey(saved));
        setStage('lock');
      });
  }, []);

  const handleAuth = async (code) => {
    setBusy(true);
    try {
      const data = await api('/api/auth', { code });
      localStorage.setItem(STORAGE_KEY, data.token);
      setToken(data.token);
      setRemaining(data.remaining);
      setAttempts([]);
      setAnswers({});
      setIndex(0);
      setUnlocked(false);
      setStage('quiz');
    } finally {
      setBusy(false);
    }
  };

  const handleAnswer = (qid, optIndex) => {
    setAnswers((prev) => {
      const next = { ...prev, [qid]: optIndex };
      localStorage.setItem(draftKey(token), JSON.stringify(next));
      return next;
    });
  };

  const handleReselect = (qid) => {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[qid];
      localStorage.setItem(draftKey(token), JSON.stringify(next));
      return next;
    });
  };

  const handleFinish = async (finalAnswers) => {
    setBusy(true);
    try {
      const data = await api('/api/complete', { token, answers: finalAnswers });
      setResult(data.result);
      setStage('result');
      window.scrollTo({ top: 0, behavior: 'instant' });
      const list = await loadAttempts(token);
      setAttempts(list);
      const current = list.find((a) => a.token === token);
      setUnlocked(Boolean(current?.unlocked));
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    const data = await api('/api/unlock', { token });
    setResult(data.result);
    setUnlocked(true);
    setAttempts(await loadAttempts(token));
  };

  // 重测：复用同一密码的剩余次数，新建下一次会话
  const handleRetest = async () => {
    setBusy(true);
    try {
      const data = await api('/api/retest', { token });
      localStorage.removeItem(draftKey(data.token));
      setToken(data.token);
      localStorage.setItem(STORAGE_KEY, data.token);
      setRemaining(data.remaining);
      setAnswers({});
      setIndex(0);
      setAttempts([]);
      setUnlocked(false);
      setResult(null);
      setStage('quiz');
      notify(`第 ${data.attemptNo} 次测评开始`);
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSelectAttempt = (attempt) => {
    setToken(attempt.token);
    localStorage.setItem(STORAGE_KEY, attempt.token);
    setResult(attempt.result);
    setUnlocked(attempt.unlocked);
    setStage('result');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // 回到密码页，换一个密码重新开始
  const handleSwitchCode = () => {
    localStorage.removeItem(STORAGE_KEY);
    if (token) localStorage.removeItem(draftKey(token));
    const url = new URL(window.location.href);
    url.searchParams.delete('t');
    window.history.replaceState({}, '', url.pathname);
    setToken(null);
    setResult(null);
    setAttempts([]);
    setAnswers({});
    setIndex(0);
    setRemaining(null);
    setUnlocked(false);
    setStage('lock');
  };

  return (
    <div className="app">
      {stage === 'boot' && <div className="boot">正在开殿门…</div>}

      {stage === 'lock' && <LockScreen onAuth={handleAuth} busy={busy} onNotify={notify} />}

      {stage === 'quiz' && (
        <Quiz
          answers={answers}
          index={index}
          setIndex={setIndex}
          onAnswer={handleAnswer}
          onReselect={handleReselect}
          onFinish={handleFinish}
          remaining={remaining}
          busy={busy}
        />
      )}

      {stage === 'result' && result && (
        <ResultView
          result={result}
          attempts={attempts}
          activeToken={token}
          remaining={remaining}
          onNext={() => {
            setStage('report');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          onSelectAttempt={handleSelectAttempt}
          onRetest={handleRetest}
          onSwitchCode={handleSwitchCode}
        />
      )}

      {stage === 'report' && result && (
        <ReportView
          result={result}
          unlocked={unlocked}
          onUnlock={handleUnlock}
          onNotify={notify}
          onBack={() => {
            setStage('result');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
