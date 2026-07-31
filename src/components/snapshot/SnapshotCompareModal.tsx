// ============================================================
// 快照对比弹窗 — 金额/比例对比 + 品类/明细切换
// ============================================================

import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { formatMoney, formatPercent } from '@/lib/calculations';
import type { Snapshot, SnapshotCompareItem } from '@/types';

interface SnapshotCompareModalProps {
  open: boolean;
  onClose: () => void;
  snapshotA: Snapshot;
  snapshotB: Snapshot;
}

type CompareMode = 'amount' | 'ratio';
type DetailLevel = 'category' | 'detail';

export function SnapshotCompareModal({
  open,
  onClose,
  snapshotA,
  snapshotB,
}: SnapshotCompareModalProps) {
  const { getLabel, getColor } = useCategories();
  const [mode, setMode] = useState<CompareMode>('amount');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('category');

  // 提取两个快照的品类设置（可能不同）
  const catsA = snapshotA.snapshotData.settings?.categories ?? [];
  const catsB = snapshotB.snapshotData.settings?.categories ?? [];

  const compareItems = useMemo(() => {
    const assetsA = snapshotA.snapshotData.basePortfolio?.assets ?? [];
    const assetsB = snapshotB.snapshotData.basePortfolio?.assets ?? [];

    // 创建品类查找
    const catMap = new Map<string, { name: string; color: string }>();
    for (const c of [...catsA, ...catsB]) {
      if (!catMap.has(c.id)) catMap.set(c.id, { name: c.name, color: c.color });
    }

    if (detailLevel === 'category') {
      // 按品类汇总
      const totalA = assetsA.reduce((s, a) => s + a.amount, 0);
      const totalB = assetsB.reduce((s, a) => s + a.amount, 0);

      const groupA = new Map<string, number>();
      const groupB = new Map<string, number>();
      for (const a of assetsA) groupA.set(a.category, (groupA.get(a.category) || 0) + a.amount);
      for (const a of assetsB) groupB.set(a.category, (groupB.get(a.category) || 0) + a.amount);

      const allCategories = new Set([...groupA.keys(), ...groupB.keys()]);

      return Array.from(allCategories).map((catId): SnapshotCompareItem => {
        const amountA = groupA.get(catId) || 0;
        const amountB = groupB.get(catId) || 0;
        const ratioA = totalA > 0 ? (amountA / totalA) * 100 : 0;
        const ratioB = totalB > 0 ? (amountB / totalB) * 100 : 0;
        const changeAmount = amountB - amountA;
        const changeRatio = ratioB - ratioA;

        return {
          categoryId: catId,
          categoryName: catMap.get(catId)?.name ?? catId,
          amountA, amountB, ratioA, ratioB,
          changeAmount,
          changeRatio,
          trend: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
        };
      });
    } else {
      // 按资产明细
      const allNames = new Set([
        ...assetsA.map((a) => `${a.category}|${a.name}`),
        ...assetsB.map((a) => `${a.category}|${a.name}`),
      ]);

      const findAsset = (assets: typeof assetsA, key: string) => {
        for (const a of assets) {
          if (`${a.category}|${a.name}` === key) return a;
        }
        return null;
      };

      const totalA = assetsA.reduce((s, a) => s + a.amount, 0);
      const totalB = assetsB.reduce((s, a) => s + a.amount, 0);

      return Array.from(allNames).map((key): SnapshotCompareItem => {
        const assetA = findAsset(assetsA, key);
        const assetB = findAsset(assetsB, key);
        const amountA = assetA?.amount ?? 0;
        const amountB = assetB?.amount ?? 0;
        const catId = (assetA ?? assetB)?.category ?? '';
        const name = (assetA ?? assetB)?.name ?? key.split('|')[1];
        const ratioA = totalA > 0 ? (amountA / totalA) * 100 : 0;
        const ratioB = totalB > 0 ? (amountB / totalB) * 100 : 0;
        const changeAmount = amountB - amountA;

        return {
          categoryId: catId,
          categoryName: `${getLabel(catId)} · ${name}`,
          amountA, amountB, ratioA, ratioB,
          changeAmount,
          changeRatio: ratioB - ratioA,
          trend: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
        };
      });
    }
  }, [snapshotA, snapshotB, detailLevel, catsA, catsB, getLabel]);

  const totalA = compareItems.reduce((s, i) => s + i.amountA, 0);
  const totalB = compareItems.reduce((s, i) => s + i.amountB, 0);
  const totalChange = totalB - totalA;

  return (
    <Modal open={open} onClose={onClose} title="快照对比" maxWidth="max-w-2xl">
      {/* 快照标签 */}
      <div className="flex items-center justify-center gap-4 mb-4 text-sm">
        <div className="text-center">
          <div className="font-medium text-gray-900">{snapshotA.label}</div>
          <div className="text-xs text-gray-400">
            {new Date(snapshotA.createdAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
        <div className="text-gray-300 text-lg">→</div>
        <div className="text-center">
          <div className="font-medium text-gray-900">{snapshotB.label}</div>
          <div className="text-xs text-gray-400">
            {new Date(snapshotB.createdAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>

      {/* 总变化 */}
      <div className="flex items-center justify-center gap-2 mb-4 p-3 bg-gray-50 rounded-lg">
        <span className="text-sm text-gray-500">总变化：</span>
        <span className={`text-lg font-bold ${totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-500'}`}>
          {totalChange > 0 ? '+' : ''}{formatMoney(totalChange)}
        </span>
        <span className="text-xs text-gray-400">
          ({formatMoney(totalA)} → {formatMoney(totalB)})
        </span>
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
              <th className="text-right py-2 font-normal w-24">快照A</th>
              <th className="text-right py-2 font-normal w-24">快照B</th>
              <th className="text-right py-2 font-normal w-24">变化</th>
              <th className="text-center py-2 font-normal w-12">趋势</th>
            </tr>
          </thead>
          <tbody>
            {compareItems.map((item, i) => {
              const changeValue =
                mode === 'amount' ? item.changeAmount : item.changeRatio;
              const valueA = mode === 'amount' ? item.amountA : item.ratioA;
              const valueB = mode === 'amount' ? item.amountB : item.ratioB;
              const formatValue = mode === 'amount' ? formatMoney : formatPercent;

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
                  <td className="text-right py-2 text-gray-600">{formatValue(valueA)}</td>
                  <td className="text-right py-2 text-gray-900 font-medium">
                    {formatValue(valueB)}
                  </td>
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
                      {item.trend === 'up' ? '+' : ''}
                      {mode === 'amount'
                        ? formatMoney(changeValue as number)
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
