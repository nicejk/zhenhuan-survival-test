import React from 'react';

/**
 * 六维雷达图（纯 SVG，无第三方依赖，便于长图导出）
 */
export default function Radar({ items, size = 260, color = '#8b1e1e', gold = '#c9a24c', dark = false }) {
  const n = items.length;
  const cx = size / 2;
  const cy = size / 2;
  const pad = size * 0.2;
  const r = size / 2 - pad;

  const pt = (i, ratio) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return [cx + Math.cos(a) * r * ratio, cy + Math.sin(a) * r * ratio];
  };

  const ring = (ratio) =>
    items.map((_, i) => pt(i, ratio).join(',')).join(' ');

  const dataPts = items.map((d, i) => pt(i, Math.max(0.04, d.score / 100)).join(',')).join(' ');

  const labelPos = (i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    const R = r + size * 0.1;
    return {
      x: cx + Math.cos(a) * R,
      y: cy + Math.sin(a) * R,
      anchor: Math.cos(a) > 0.3 ? 'start' : Math.cos(a) < -0.3 ? 'end' : 'middle',
    };
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="六维生存力雷达图">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon
          key={ratio}
          points={ring(ratio)}
          fill="none"
          stroke={gold}
          strokeOpacity={ratio === 1 ? 0.55 : 0.22}
          strokeWidth={ratio === 1 ? 1.2 : 0.8}
        />
      ))}
      {items.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={gold} strokeOpacity={0.25} strokeWidth={0.8} />;
      })}
      <polygon points={dataPts} fill={color} fillOpacity={dark ? 0.35 : 0.22} stroke={color} strokeWidth={1.6} />
      {items.map((d, i) => {
        const [x, y] = pt(i, Math.max(0.04, d.score / 100));
        return <circle key={i} cx={x} cy={y} r={2.4} fill={color} />;
      })}
      {items.map((d, i) => {
        const p = labelPos(i);
        return (
          <g key={i}>
            <text x={p.x} y={p.y} textAnchor={p.anchor} className="radar-label" fill={dark ? '#e6cf95' : '#5a4a3c'}>
              {d.name}
            </text>
            <text
              x={p.x}
              y={p.y + 12}
              textAnchor={p.anchor}
              className="radar-score"
              fill={dark ? '#c9a24c' : '#8b1e1e'}
            >
              {d.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
