// ============================================================
// 快照对比弹窗 — 多快照（N 条）金额/比例对比 + 品类/明细切换
// 明细按资产 id 匹配（旧数据无 id 时回退 category|name）
// ============================================================

import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { formatMoney, formatPercent } from '@/lib/calculations';
import type { Asset, Snapshot, SnapshotCompareRow } from '@/types';

interface SnapshotCompareModalProps {
  open: boolean;
  onClose: () => void;
  snapshots: Snapshot[]; // 已按 createdAt 升序
}

type CompareMode = 'amount' | 'ratio';
type DetailLevel = 'category' | 'detail';

// 明细匹配主键：优先资产 id，旧数据无 id 时回退 category|name
const keyOf = (a: Asset) => (a.id ? `id:${a.id}` : `cat:${a.category}|${a.name}`);

function formatInterval(a: string, b: string): string {
  const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  if (days < 1) return '同日';
  if (days < 30) return `${days} 天`;
  return `${days} 天（约 ${Math.round(days / 30)} 个月）`;
}

export function SnapshotCompareModal({
  open,
  onClose,
  snapshots,
}: SnapshotCompareModalProps) {
  const { getLabel, getColor } = useCategories();
  const [mode, setMode] = useState<CompareMode>('amount');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('category');

  // 每个快照的品类设置（可能不同），并集用于品类名/颜色
  const catMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const s of snapshots) {
      for (const c of s.snapshotData.settings?.categories ?? []) {
        if (!map.has(c.id)) map.set(c.id, { name: c.name, color: c.color });
      }
    }
    return map;
  }, [snapshots]);

  // 每个快照的底仓资产 + 总额 + 品类聚合
  const perSnapshot = useMemo(
    () =>
      snapshots.map((s) => {
        const assets = s.snapshotData.basePortfolio?.assets ?? [];
        const total = assets.reduce((sum, a) => sum + a.amount, 0);
        const byCat = new Map<string, number>();
        for (const a of assets) byCat.set(a.category, (byCat.get(a.category) ?? 0) + a.amount);
        return { assets, total, byCat };
      }),
    [snapshots]
  );

  const compareRows = useMemo<SnapshotCompareRow[]>(() => {
    if (detailLevel === 'category') {
      const allCats = new Set(perSnapshot.flatMap((p) => Array.from(p.byCat.keys())));
      return Array.from(allCats).map((catId): SnapshotCompareRow => {
        const amounts = perSnapshot.map((p) => p.byCat.get(catId) ?? 0);
        const ratios = amounts.map((amt, i) =>
          perSnapshot[i].total > 0 ? (amt / perSnapshot[i].total) * 100 : 0
        );
        const changeAmount = amounts[amounts.length - 1] - amounts[0];
        const changeRatio = ratios[ratios.length - 1] - ratios[0];
        return {
          categoryId: catId,
          categoryName: catMap.get(catId)?.name ?? catId,
          amounts,
          ratios,
          changeAmount,
          changeRatio,
          trend: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
        };
      });
    }

    // 按资产明细：主键 = 资产 id（回退 category|name）
    const perSnapshotMaps = perSnapshot.map((p) => new Map(p.assets.map((a) => [keyOf(a), a])));
    const allKeys = new Set(perSnapshotMaps.flatMap((m) => Array.from(m.keys())));
    return Array.from(allKeys).map((key): SnapshotCompareRow => {
      const assets = perSnapshotMaps.map((m) => m.get(key) ?? null);
      const amounts = assets.map((a) => a?.amount ?? 0);
      const ratios = amounts.map((amt, i) =>
        perSnapshot[i].total > 0 ? (amt / perSnapshot[i].total) * 100 : 0
      );
      const first = assets.find((a): a is Asset => Boolean(a));
      const catId = first?.category ?? '';
      const name = first?.name ?? key.split('|')[1] ?? key;
      const changeAmount = amounts[amounts.length - 1] - amounts[0];
      const changeRatio = ratios[ratios.length - 1] - ratios[0];
      return {
        categoryId: catId,
        categoryName: `${getLabel(catId)} · ${name}`,
        amounts,
        ratios,
        changeAmount,
        changeRatio,
        trend: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
      };
    });
  }, [perSnapshot, detailLevel, catMap, getLabel]);

  const totalA = perSnapshot[0]?.total ?? 0;
  const totalB = perSnapshot[perSnapshot.length - 1]?.total ?? 0;
  const totalChange = totalB - totalA;
  const interval = snapshots.length >= 2 ? formatInterval(snapshots[0].createdAt, snapshots[snapshots.length - 1].createdAt) : '';

  return (
    <Modal open={open} onClose={onClose} title="快照对比" maxWidth="max-w-2xl">
      {/* 快照标签 */}
      <div className="mb-4 flex items-center justify-center gap-3 overflow-x-auto text-sm">
        {snapshots.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            {i > 0 && <div className="text-gray-300 text-lg">→</div>}
            <div className="text-center">
              <div className="font-medium text-gray-900">{s.label}</div>
              <div className="text-xs text-gray-400">
                {new Date(s.createdAt).toLocaleDateString('zh-CN')}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 总变化 + 区间时长 */}
      <div className="mb-4 flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">总变化：</span>
          <span className={`text-lg font-bold ${totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
            {totalChange > 0 ? '+' : ''}{formatMoney(totalChange)}
          </span>
          <span className="text-xs text-gray-400">
            ({formatMoney(totalA)} → {formatMoney(totalB)})
          </span>
        </div>
        {interval && <div className="text-xs text-gray-400">区间 {interval}</div>}
      </div>

      {/* 模式切换 */}
      <div className="flex gap-2 mb-4">
        <div className="flex bg-gray-100 rounded-lg p-0.5 flex-1">
          <button
            onClick={() => setMode('amount')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'amount' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            金额对比
          </button>
          <button
            onClick={() => setMode('ratio')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === 'ratio' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
            }`}
          >
            比例对比
          </button>
        </div>
        <button
          onClick={() => setDetailLevel(detailLevel === 'category' ? 'detail' : 'category')}
          className="btn-ghost text-xs"
        >
          {detailLevel === 'category' ? '按明细' : '按品类'}
        </button>
      </div>

      {/* 对比表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-normal">品类</th>
              {snapshots.map((s, i) => (
                <th key={s.id} className="text-right py-2 font-normal w-24">
                  {i === 0 ? '首期' : i === snapshots.length - 1 ? '末期' : `第${i + 1}期`}
                </th>
              ))}
              <th className="text-right py-2 font-normal w-24">变化</th>
              <th className="text-center py-2 font-normal w-12">趋势</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((item, i) => {
              const formatValue = mode === 'amount' ? formatMoney : formatPercent;
              const changeValue = mode === 'amount' ? item.changeAmount : item.changeRatio;

              return (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getColor(item.categoryId) }}
                      />
                      <span className="text-gray-700 truncate max-w-[120px]">
                        {item.categoryName}
                      </span>
                    </div>
                  </td>
                  {item.amounts.map((_, j) => (
                    <td
                      key={j}
                      className={`text-right py-2 ${
                        j === item.amounts.length - 1 ? 'text-gray-900 font-medium' : 'text-gray-600'
                      }`}
                    >
                      {formatValue(mode === 'amount' ? item.amounts[j] : item.ratios[j])}
                    </td>
                  ))}
                  <td className="text-right py-2">
                    <span
                      className={
                        item.trend === 'up'
                          ? 'text-green-600'
                          : item.trend === 'down'
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }
                    >
                      {mode === 'amount'
                        ? `${item.trend === 'up' ? '+' : ''}${formatMoney(changeValue as number)}`
                        : `${(changeValue as number) > 0 ? '+' : ''}${(changeValue as number).toFixed(1)}pp`}
                    </span>
                  </td>
                  <td className="text-center py-2">
                    {item.trend === 'up' ? (
                      <TrendingUp size={14} className="text-green-500 inline" />
                    ) : item.trend === 'down' ? (
                      <TrendingDown size={14} className="text-red-500 inline" />
                    ) : (
                      <Minus size={14} className="text-gray-300 inline" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
