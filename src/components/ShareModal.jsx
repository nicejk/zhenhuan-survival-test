import React, { useRef, useState } from 'react';
import ShareCard from './ShareCard.jsx';
import ReportBody from './ReportBody.jsx';

export default function ShareModal({ result, open, onClose, full = false }) {
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tip, setTip] = useState('');
  const cardRef = useRef(null);

  const generate = async () => {
    if (!cardRef.current) return;
    setLoading(true);
    setTip('');
    try {
      const node = cardRef.current;
      const { toPng } = await import('html-to-image'); // 仅生成分享长图时加载，减小首屏包
      const dataUrl = await toPng(node, {
        pixelRatio: full ? 1.5 : 2, // 完整版更长，降低倍率避免超出画布上限
        backgroundColor: '#f2e7d5',
        width: node.offsetWidth,
        height: node.offsetHeight,
        style: { transform: 'none' },
      });
      setImage(dataUrl);
    } catch (e) {
      setTip('长图生成失败，请重试，或直接截图保存。');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (open) {
      setImage('');
      setTimeout(generate, 60);
    }
  }, [open]);

  // 直接触发浏览器下载（不走系统分享面板）；iOS 若只打开图片，提示长按存储
  const saveToAlbum = async () => {
    if (!image) return;
    try {
      const blob = await (await fetch(image)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zhenhuan-${result.episode}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      setTip('已开始保存。若浏览器只打开了图片，请长按图片选择「存储到照片」。');
    } catch {
      setTip('保存失败，请长按图片手动保存。');
    }
  };

  const shareNow = async () => {
    if (!image) return;
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], `zhenhuan-${result.episode}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: result.shareText, title: '我的宫斗生存力' });
        return;
      } catch (e) {
        /* 用户取消 */
      }
    }
    setTip('当前浏览器不支持直接分享，请先保存图片，再手动发送。');
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(result.shareText);
      setTip('分享文案已复制，去粘贴即可。');
    } catch {
      setTip('复制失败，请手动长按选择文字。');
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="modal-mask" onClick={onClose}>
        <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close" onClick={onClose}>✕</button>
          <h3 className="modal-title">{full ? '完整版结果长图' : '你的结果长图'}</h3>

          <div className="share-preview">
            {loading && <div className="gen-loading">正在绘制长图…</div>}
            {!loading && image && <img src={image} alt="结果长图" />}
          </div>

          {tip && <p className="share-tip">{tip}</p>}

          <div className="modal-actions col">
            <button className="btn-primary" onClick={shareNow} disabled={!image}>分享</button>
            <button className="btn-ghost" onClick={saveToAlbum} disabled={!image}>保存到手机相册</button>
            <button className="btn-text" onClick={copyText}>复制分享文案</button>
            {!image && !loading && <button className="btn-text" onClick={generate}>重新生成</button>}
          </div>
          <p className="share-note">iOS 若只打开了图片，请长按图片选择「存储到照片」；微信内可长按图片转发。</p>
        </div>
      </div>

      <div className="offscreen" aria-hidden="true">
        <div ref={cardRef} className={full ? 'shot-full' : ''}>
          {full ? (
            <div className="report full-report">
              <ReportBody result={result} />
            </div>
          ) : (
            <ShareCard result={result} />
          )}
        </div>
      </div>
    </>
  );
}
