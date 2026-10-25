// ============================================================
// 迷你趋势线 — 表格行内展示多期走势形态（纯 SVG，无依赖）
// ============================================================

interface MiniSparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
}

export function MiniSparkline({
  values,
  width = 56,
  height = 18,
  stroke = '#9f927d',
}: MiniSparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = 2 + (i / (values.length - 1)) * (width - 4);
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return { x, y };
  });
  const last = pts[pts.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <polyline
        points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2} fill={stroke} />
    </svg>
  );
}
