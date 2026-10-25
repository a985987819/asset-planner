// ============================================================
// 瀑布图 — 两期对比的变化贡献归因（首期 → 各项增减 → 末期）
// 纯 SVG 渲染：首期/末期为整柱，中间为浮动增减柱，虚线连接累计水位
// ============================================================

import { useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface WaterfallItem {
  id: string;
  name: string;
  change: number; // 正=增加，负=减少
}

interface WaterfallChartProps {
  startTotal: number;
  endTotal: number;
  items: WaterfallItem[];
  formatValue: (v: number) => string;
  startLabel?: string;
  endLabel?: string;
  height?: number;
}

const COLOR_UP = '#6fba2c';
const COLOR_DOWN = '#e05a5a';
const COLOR_START = '#b3a68f';
const COLOR_END = '#19c8b9';
const COLOR_OTHER = '#b3a68f';
const MAX_BARS = 7;

type Bar =
  | { kind: 'total'; label: string; value: number; color: string }
  | { kind: 'delta'; label: string; name: string; change: number; from: number; to: number };

/** 名字超长截断（中文 4 字为宜），完整名走 title 提示 */
const shortName = (name: string) => (name.length > 4 ? `${name.slice(0, 4)}…` : name);

export function WaterfallChart({
  startTotal,
  endTotal,
  items,
  formatValue,
  startLabel = '首期',
  endLabel = '末期',
  height = 200,
}: WaterfallChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 折叠微小项：按 |change| 取前 MAX_BARS，其余并入「其他」
  const bars = useMemo<{ bars: Bar[]; folded: number }>(() => {
    const threshold = Math.max(1, Math.abs(startTotal) * 0.001);
    const sorted = [...items].sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    const major = sorted.filter((i) => Math.abs(i.change) >= threshold).slice(0, MAX_BARS);
    const majorIds = new Set(major.map((i) => i.id));
    const rest = sorted.filter((i) => !majorIds.has(i.id));
    const restSum = rest.reduce((s, i) => s + i.change, 0);

    const seq: Bar[] = [{ kind: 'total', label: startLabel, value: startTotal, color: COLOR_START }];
    let cum = startTotal;
    for (const item of major) {
      const to = cum + item.change;
      seq.push({ kind: 'delta', label: item.name, name: item.name, change: item.change, from: cum, to });
      cum = to;
    }
    if (Math.abs(restSum) >= threshold && rest.length > 0) {
      const to = cum + restSum;
      seq.push({ kind: 'delta', label: `其他${rest.length}项`, name: `其他 ${rest.length} 项`, change: restSum, from: cum, to });
      cum = to;
    }
    seq.push({ kind: 'total', label: endLabel, value: endTotal, color: COLOR_END });
    return { bars: seq, folded: rest.length };
  }, [items, startTotal, endTotal, startLabel, endLabel]);

  if (width === 0) {
    return <div ref={wrapRef} style={{ height }} />;
  }

  // 布局常量
  const padTop = 20; // 柱顶数值标签
  const padBottom = 26; // 底部名称标签
  const padX = 6;
  const plotH = height - padTop - padBottom;
  const plotW = width - padX * 2;

  // Y 轴域：覆盖累计水位路径（首期、各累计点、末期）
  const cumValues: number[] = [];
  for (const b of bars.bars) {
    if (b.kind === 'total') cumValues.push(b.value);
    else {
      cumValues.push(b.from, b.to);
    }
  }
  let yMin = Math.min(...cumValues);
  let yMax = Math.max(...cumValues);
  if (yMax === yMin) {
    yMin -= 1;
    yMax += 1;
  }
  const pad = (yMax - yMin) * 0.08;
  yMin -= pad;
  yMax += pad;

  const yOf = (v: number) => padTop + ((yMax - v) / (yMax - yMin)) * plotH;

  const n = bars.bars.length;
  const slot = plotW / n;
  const barW = Math.min(36, slot * 0.6);
  const xOf = (i: number) => padX + slot * i + slot / 2;

  return (
    <div ref={wrapRef}>
      <svg width={width} height={height} role="img" aria-label="变化构成瀑布图">
        {/* 连接虚线：上一柱的累计水位 → 下一柱起点 */}
        {bars.bars.slice(0, -1).map((b, i) => {
          const level = b.kind === 'total' ? b.value : b.to;
          const x1 = xOf(i) + barW / 2;
          const x2 = xOf(i + 1) - barW / 2;
          return (
            <line
              key={`c-${i}`}
              x1={x1}
              y1={yOf(level)}
              x2={x2}
              y2={yOf(level)}
              stroke="#c9bfa8"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          );
        })}

        {bars.bars.map((b, i) => {
          const cx = xOf(i);
          if (b.kind === 'total') {
            // 首期/末期：从域底到水位的整柱
            const yTop = yOf(b.value);
            const yBottom = padTop + plotH;
            const h = Math.max(1, yBottom - yTop);
            return (
              <g key={`b-${i}`}>
                <title>{`${b.label} ${formatValue(b.value)}`}</title>
                <rect x={cx - barW / 2} y={yTop} width={barW} height={h} rx={4} fill={b.color} />
                <text x={cx} y={yTop - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#794f27">
                  {formatValue(b.value)}
                </text>
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill="#9f927d">
                  {b.label}
                </text>
              </g>
            );
          }
          // 增减浮动柱
          const up = b.change >= 0;
          const yA = yOf(Math.max(b.from, b.to));
          const yB = yOf(Math.min(b.from, b.to));
          const h = Math.max(1, yB - yA);
          const color = up ? COLOR_UP : COLOR_DOWN;
          const labelY = up ? yA - 5 : yB + 11;
          const signText = `${up ? '+' : ''}${formatValue(b.change)}`;
          return (
            <g key={`b-${i}`}>
              <title>{`${b.name} ${signText}`}</title>
              <rect x={cx - barW / 2} y={yA} width={barW} height={h} rx={3} fill={color} />
              <text x={cx} y={labelY} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
                {signText}
              </text>
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={10} fill="#9f927d">
                {shortName(b.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
