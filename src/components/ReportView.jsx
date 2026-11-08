import React, { useState } from 'react';
import ShareModal from './ShareModal.jsx';
import ReportBody from './ReportBody.jsx';

export default function ReportView({ result, onBack }) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <section className="report full-report">
      <ReportBody result={result} />

      <div className="report-actions">
        <button className="btn-primary" onClick={() => setShareOpen(true)}>生成完整版长图</button>
        <button className="btn-ghost" onClick={onBack}>返回结果页</button>
      </div>

      <ShareModal full result={result} open={shareOpen} onClose={() => setShareOpen(false)} />
    </section>
  );
}
