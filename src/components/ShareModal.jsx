import React, { useRef, useState } from 'react';
import ShareCard from './ShareCard.jsx';

export default function ShareModal({ result, open, onClose }) {
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
        pixelRatio: 2,
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

  const saveToAlbum = async () => {
    if (!image) return;
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], 'zhenhuan-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: result.shareText, title: '我的宫斗生存力' });
        return;
      } catch (e) {
        /* 用户取消 → 回退到保存 */
      }
    }
    const a = document.createElement('a');
    a.href = image;
    a.download = 'zhenhuan-result.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTip('已保存。iOS 若只打开了图片，请长按图片选择「存储到照片」。');
  };

  const shareToGroup = async () => {
    if (!image) return;
    const blob = await (await fetch(image)).blob();
    const file = new File([blob], 'zhenhuan-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: result.shareText, title: '我的宫斗生存力' });
        return;
      } catch (e) {
        /* ignore */
      }
    }
    setTip('当前浏览器不支持直接分享，请先保存图片，再手动发到群里。');
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(result.shareText);
      setTip('分享文案已复制，去群里粘贴即可。');
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
          <h3 className="modal-title">你的结果长图</h3>

          <div className="share-preview">
            {loading && <div className="gen-loading">正在绘制长图…</div>}
            {!loading && image && <img src={image} alt="结果长图" />}
          </div>

          {tip && <p className="share-tip">{tip}</p>}

          <div className="modal-actions col">
            <button className="btn-primary" onClick={shareToGroup} disabled={!image}>分享到社群</button>
            <button className="btn-ghost" onClick={saveToAlbum} disabled={!image}>保存到手机相册</button>
            <button className="btn-text" onClick={copyText}>复制分享文案</button>
            {!image && !loading && <button className="btn-text" onClick={generate}>重新生成</button>}
          </div>
          <p className="share-note">iOS / 微信内若无法直接分享，请先保存图片，再手动发送到群里。</p>
        </div>
      </div>

      <div className="offscreen" aria-hidden="true">
        <div ref={cardRef}>
          <ShareCard result={result} />
        </div>
      </div>
    </>
  );
}
