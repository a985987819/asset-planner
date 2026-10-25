// ============================================================
// 结构对比图 — 首期 vs 末期两根 100% 堆叠柱
// 展示整体资金中各品类占比的结构迁移（纯 div 渲染）
// ============================================================

export interface StructureSegment {
  id: string;
  name: string;
  color: string;
  shareA: number; // 首期占比（%）
  shareB: number; // 末期占比（%）
}

interface StructureCompareChartProps {
  segments: StructureSegment[];
  height?: number;
  labelA?: string;
  labelB?: string;
}

function Column({
  segments,
  pick,
  height,
  label,
}: {
  segments: StructureSegment[];
  pick: (s: StructureSegment) => number;
  height: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex w-7 flex-col overflow-hidden rounded-md"
        style={{ height }}
        role="img"
        aria-label={`${label}结构`}
      >
        {segments.map((s) => {
          const pct = pick(s);
          if (pct <= 0) return null;
          return (
            <div
              key={s.id}
              style={{ height: `${Math.min(100, pct)}%`, backgroundColor: s.color }}
              title={`${s.name} ${pct.toFixed(1)}%`}
            />
          );
        })}
      </div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}

export function StructureCompareChart({
  segments,
  height = 150,
  labelA = '首期',
  labelB = '末期',
}: StructureCompareChartProps) {
  if (segments.length === 0) return null;
  // 末期占比降序，与表格/图例视觉顺序大体一致
  const sorted = [...segments].sort((a, b) => b.shareB - a.shareB || b.shareA - a.shareA);

  return (
    <div className="flex items-start justify-center gap-3">
      <Column segments={sorted} pick={(s) => s.shareA} height={height} label={labelA} />
      <div className="pt-1 text-gray-300">→</div>
      <Column segments={sorted} pick={(s) => s.shareB} height={height} label={labelB} />
    </div>
  );
}
