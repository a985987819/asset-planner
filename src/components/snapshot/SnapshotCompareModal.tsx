// ============================================================
// 快照对比弹窗 — 多快照（N 条）金额/比例对比 + 变化贡献瀑布图
// 摘要：总变化 / 区间 / 年化 / 主要增减项；表格：排序、占比条、
// 变化百分比、新增/清仓标记、多期迷你趋势线
// ============================================================

import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Button } from 'animal-island-ui';
import { Modal } from '@/components/ui/Modal';
import { useCategories } from '@/hooks/useCategories';
import { formatInterval, buildCategoryMap } from '@/lib/snapshotUtils';
import { formatMoney, formatPercent } from '@/lib/calculations';
import { WaterfallChart, type WaterfallItem } from '@/components/charts/WaterfallChart';
import { StructureCompareChart, type StructureSegment } from '@/components/charts/StructureCompareChart';
import { MiniSparkline } from '@/components/charts/MiniSparkline';
import type { Asset, Snapshot, SnapshotCompareRow } from '@/types';

interface SnapshotCompareModalProps {
  open: boolean;
  onClose: () => void;
  snapshots: Snapshot[]; // 已按 createdAt 升序
}

type CompareMode = 'amount' | 'ratio';
type DetailLevel = 'category' | 'detail';
type CompareScope = 'base' | 'dca';
type SortKey = 'change' | 'amount' | 'original';

const COLOR_UP = '#6fba2c';
const COLOR_DOWN = '#e05a5a';

// 明细匹配主键：优先资产 id，旧数据无 id 时回退 category|name
const keyOf = (a: Asset) => (a.id ? `id:${a.id}` : `cat:${a.category}|${a.name}`);

/** 行内小分段控件 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SnapshotCompareModal({ open, onClose, snapshots }: SnapshotCompareModalProps) {
  const { getLabel, getColor } = useCategories();
  const [mode, setMode] = useState<CompareMode>('amount');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('category');
  const [scope, setScope] = useState<CompareScope>('base');
  const [sortKey, setSortKey] = useState<SortKey>('change');

  // 每个快照的品类设置（可能不同），并集用于品类名/颜色
  const catMap = useMemo(() => buildCategoryMap(snapshots), [snapshots]);

  // 每个快照的底仓/定投资产（scope 切换无需重算原始数据）
  const perSnapshot = useMemo(
    () =>
      snapshots.map((s) => ({
        base: s.snapshotData.basePortfolio?.assets ?? [],
        dca: s.snapshotData.dcaPortfolio?.assets ?? [],
      })),
    [snapshots]
  );

  // 当前 scope 下的资产、总额与品类聚合
  const scoped = useMemo(
    () =>
      perSnapshot.map((p) => {
        const assets = scope === 'base' ? p.base : p.dca;
        const total = assets.reduce((sum, a) => sum + a.amount, 0);
        const byCat = new Map<string, number>();
        for (const a of assets) byCat.set(a.category, (byCat.get(a.category) ?? 0) + a.amount);
        return { assets, total, byCat };
      }),
    [perSnapshot, scope]
  );

  const compareRows = useMemo<SnapshotCompareRow[]>(() => {
    if (detailLevel === 'category') {
      const allCats = new Set(scoped.flatMap((p) => Array.from(p.byCat.keys())));
      return Array.from(allCats).map((catId): SnapshotCompareRow => {
        const amounts = scoped.map((p) => p.byCat.get(catId) ?? 0);
        const ratios = amounts.map((amt, i) =>
          scoped[i].total > 0 ? (amt / scoped[i].total) * 100 : 0
        );
        const changeAmount = amounts[amounts.length - 1] - amounts[0];
        const changeRatio = ratios[ratios.length - 1] - ratios[0];
        return {
          categoryId: catId,
          // 快照内品类设置优先，缺失时回退当前设置的中文名，避免露出内部 id
          categoryName: catMap.get(catId)?.name ?? getLabel(catId),
          amounts,
          ratios,
          changeAmount,
          changeRatio,
          trend: changeAmount > 0 ? 'up' : changeAmount < 0 ? 'down' : 'flat',
        };
      });
    }

    // 按资产明细：主键 = 资产 id（回退 category|name）
    const perSnapshotMaps = scoped.map((p) => new Map(p.assets.map((a) => [keyOf(a), a])));
    const allKeys = new Set(perSnapshotMaps.flatMap((m) => Array.from(m.keys())));
    return Array.from(allKeys).map((key): SnapshotCompareRow => {
      const assets = perSnapshotMaps.map((m) => m.get(key) ?? null);
      const amounts = assets.map((a) => a?.amount ?? 0);
      const ratios = amounts.map((amt, i) =>
        scoped[i].total > 0 ? (amt / scoped[i].total) * 100 : 0
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
  }, [scoped, detailLevel, catMap, getLabel]);

  // 展示排序：默认按变化幅度降序（谁动了排前面）
  const sortedRows = useMemo(() => {
    const arr = [...compareRows];
    if (sortKey === 'change') {
      arr.sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
    } else if (sortKey === 'amount') {
      arr.sort(
        (a, b) => b.amounts[b.amounts.length - 1] - a.amounts[a.amounts.length - 1]
      );
    }
    return arr;
  }, [compareRows, sortKey]);

  const totalA = scoped[0]?.total ?? 0;
  const totalB = scoped[scoped.length - 1]?.total ?? 0;
  const totalChange = totalB - totalA;
  const interval =
    snapshots.length >= 2
      ? formatInterval(snapshots[0].createdAt, snapshots[snapshots.length - 1].createdAt)
      : '';
  const intervalDays =
    snapshots.length >= 2
      ? Math.round(
          (new Date(snapshots[snapshots.length - 1].createdAt).getTime() -
            new Date(snapshots[0].createdAt).getTime()) /
            86400000
        )
      : 0;

  // 年化收益率（底仓口径；区间 ≥ 30 天才有意义）
  const annualized =
    scope === 'base' && totalA > 0 && intervalDays >= 30
      ? (Math.pow(totalB / totalA, 365 / intervalDays) - 1) * 100
      : null;

  // 变化贡献（品类口径，与瀑布图一致）
  const waterfallItems = useMemo<WaterfallItem[]>(() => {
    const allCats = new Set(scoped.flatMap((p) => Array.from(p.byCat.keys())));
    return Array.from(allCats)
      .map((catId) => ({
        id: catId,
        name: catMap.get(catId)?.name ?? getLabel(catId),
        change: (scoped[scoped.length - 1].byCat.get(catId) ?? 0) - (scoped[0].byCat.get(catId) ?? 0),
      }))
      .filter((i) => Math.abs(i.change) >= 1);
  }, [scoped, catMap, getLabel]);

  const topUp = waterfallItems.reduce<WaterfallItem | null>(
    (best, i) => (!best || i.change > best.change ? i : best),
    null
  );
  const topDown = waterfallItems.reduce<WaterfallItem | null>(
    (best, i) => (!best || i.change < best.change ? i : best),
    null
  );
  const hasTopUp = Boolean(topUp && topUp.change > 0);
  const hasTopDown = Boolean(topDown && topDown.change < 0);

  // 品类占比（首期/末期占总额 %）与占比变动 pp —— 结构视角
  const shareRows = useMemo<StructureSegment[]>(() => {
    const first = scoped[0];
    const last = scoped[scoped.length - 1];
    const all = new Set<string>([...first.byCat.keys(), ...last.byCat.keys()]);
    return Array.from(all)
      .map((catId) => {
        const a = first.total > 0 ? ((first.byCat.get(catId) ?? 0) / first.total) * 100 : 0;
        const b = last.total > 0 ? ((last.byCat.get(catId) ?? 0) / last.total) * 100 : 0;
        return {
          id: catId,
          name: catMap.get(catId)?.name ?? getLabel(catId),
          color: getColor(catId),
          shareA: a,
          shareB: b,
        };
      })
      .filter((s) => s.shareA > 0.05 || s.shareB > 0.05);
  }, [scoped, catMap, getLabel, getColor]);

  const topShareUp = shareRows.reduce<StructureSegment | null>(
    (best, s) => (!best || s.shareB - s.shareA > best.shareB - best.shareA ? s : best),
    null
  );
  const topShareDown = shareRows.reduce<StructureSegment | null>(
    (best, s) => (!best || s.shareB - s.shareA < best.shareB - best.shareA ? s : best),
    null
  );
  const hasShareUp = Boolean(topShareUp && topShareUp.shareB - topShareUp.shareA > 0.1);
  const hasShareDown = Boolean(topShareDown && topShareDown.shareB - topShareDown.shareA < -0.1);

  // 行内占比条的缩放基准：全表首/末占比的最大值（跨行可比）
  const maxShare = Math.max(
    ...compareRows.map((r) => Math.max(r.ratios[0] ?? 0, r.ratios[r.ratios.length - 1] ?? 0)),
    0.01
  );

  const scopeLabel = scope === 'base' ? '总资产' : '日定投合计';
  const sparkStroke = (trend: SnapshotCompareRow['trend']) =>
    trend === 'up' ? COLOR_UP : trend === 'down' ? COLOR_DOWN : '#c4b89e';

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

      {/* 摘要：总变化 + 区间 + 年化 + 主要贡献 */}
      <div className="mb-4 flex flex-col items-center gap-1 rounded-xl bg-gray-50 p-3">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm text-gray-500">{scopeLabel}变化：</span>
          <span
            className={`text-lg font-bold ${
              totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {totalChange > 0 ? '+' : ''}
            {formatMoney(totalChange)}
          </span>
          <span className="text-xs text-gray-400">
            ({formatMoney(totalA)} → {formatMoney(totalB)})
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-400">
          {interval && <span>区间 {interval}</span>}
          {annualized !== null && (
            <span className={annualized >= 0 ? 'text-primary-600' : 'text-red-500'}>
              年化 {annualized >= 0 ? '+' : ''}
              {annualized.toFixed(1)}%
            </span>
          )}
          {hasTopUp && topUp && (
            <span>
              主要增长 <span className="text-green-600">{topUp.name} +{formatMoney(topUp.change)}</span>
            </span>
          )}
          {hasTopDown && topDown && (
            <span>
              主要减少 <span className="text-red-500">{topDown.name} {formatMoney(topDown.change)}</span>
            </span>
          )}
        </div>
        {(hasShareUp || hasShareDown) && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-400">
            {hasShareUp && topShareUp && (
              <span>
                占比提升最多{' '}
                <span className="text-primary-600">
                  {topShareUp.name} +{(topShareUp.shareB - topShareUp.shareA).toFixed(1)}pp
                </span>
              </span>
            )}
            {hasShareDown && topShareDown && (
              <span>
                占比下降最多{' '}
                <span className="text-red-500">
                  {topShareDown.name} {(topShareDown.shareB - topShareDown.shareA).toFixed(1)}pp
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 变化构成瀑布图（绝对金额归因）+ 首末结构对比（占比迁移） */}
      {waterfallItems.length > 0 && (
        <div className="mb-4 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1" style={{ minWidth: 240 }}>
            <div className="mb-1 text-xs font-medium text-gray-500">
              变化构成（{scopeLabel}从哪来）
            </div>
            <WaterfallChart
              startTotal={totalA}
              endTotal={totalB}
              items={waterfallItems}
              formatValue={formatMoney}
              height={190}
            />
          </div>
          <div className="flex-shrink-0">
            <div className="mb-1 text-xs font-medium text-gray-500">结构变化（占比）</div>
            <StructureCompareChart segments={shareRows} height={170} />
          </div>
        </div>
      )}

      {/* 范围 / 口径 / 粒度 / 排序 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'base', label: '底仓' },
            { value: 'dca', label: '定投' },
          ]}
        />
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'amount', label: '金额' },
            { value: 'ratio', label: '比例' },
          ]}
        />
        <Button
          type="text"
          size="small"
          onClick={() => setDetailLevel(detailLevel === 'category' ? 'detail' : 'category')}
        >
          {detailLevel === 'category' ? '按明细' : '按品类'}
        </Button>
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          排序
          {(
            [
              { value: 'change', label: '变化' },
              { value: 'amount', label: '金额' },
              { value: 'original', label: '默认' },
            ] as Array<{ value: SortKey; label: string }>
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortKey(opt.value)}
              className={`rounded-md px-1.5 py-0.5 transition-colors ${
                sortKey === opt.value ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 对比表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-normal">品类</th>
              <th className="text-left py-2 font-normal w-16">占比</th>
              {snapshots.map((s, i) => (
                <th key={s.id} className="text-right py-2 font-normal w-24">
                  {i === 0 ? '首期' : i === snapshots.length - 1 ? '末期' : `第${i + 1}期`}
                </th>
              ))}
              {snapshots.length >= 3 && (
                <th className="text-center py-2 font-normal w-16">走势</th>
              )}
              <th className="text-right py-2 font-normal w-28">变化</th>
              <th className="text-center py-2 font-normal w-10">趋势</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((item) => {
              const formatValue = mode === 'amount' ? formatMoney : formatPercent;
              const lastAmount = item.amounts[item.amounts.length - 1];
              const firstAmount = item.amounts[0];
              const shareFirst = item.ratios[0] ?? 0;
              const shareLast = item.ratios[item.ratios.length - 1] ?? 0;
              const isNew = firstAmount === 0 && lastAmount > 0;
              const isGone = lastAmount === 0 && firstAmount > 0;
              const changePct = firstAmount > 0 ? (item.changeAmount / firstAmount) * 100 : null;
              // 占比变动方向可能与金额变动方向相反（金额涨但占比跌），单独着色
              const ppColor =
                item.changeRatio > 0.05
                  ? 'text-green-600'
                  : item.changeRatio < -0.05
                  ? 'text-red-500'
                  : 'text-gray-400';
              // 显著性：变化不足 1 元的行淡化
              const muted = Math.abs(item.changeAmount) < 1;
              const trendColor =
                item.trend === 'up'
                  ? 'text-green-600'
                  : item.trend === 'down'
                  ? 'text-red-600'
                  : 'text-gray-400';

              return (
                <tr
                  key={`${item.categoryId}|${item.categoryName}`}
                  className={`border-b border-gray-50 hover:bg-gray-50 ${muted ? 'opacity-50' : ''}`}
                >
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getColor(item.categoryId) }}
                      />
                      <span className="text-gray-700 truncate max-w-[120px]" title={item.categoryName}>
                        {item.categoryName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-2" title={`占比 ${shareFirst.toFixed(1)}% → ${shareLast.toFixed(1)}%`}>
                    {/* 首末占比双条：上灰=首期、下彩=末期，条的迁移即占比变化 */}
                    <div className="flex flex-col gap-0.5">
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-gray-400"
                          style={{ width: `${Math.min(100, (shareFirst / maxShare) * 100)}%` }}
                        />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (shareLast / maxShare) * 100)}%`,
                            backgroundColor: getColor(item.categoryId),
                          }}
                        />
                      </div>
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
                  {snapshots.length >= 3 && (
                    <td className="py-2">
                      <div className="flex items-center justify-center gap-1">
                        <span title="金额走势">
                          <MiniSparkline values={item.amounts} stroke={sparkStroke(item.trend)} />
                        </span>
                        <span title="占比走势">
                          <MiniSparkline values={item.ratios} stroke="#9f927d" />
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="text-right py-2">
                    {/* 绝对金额变化（含行内幅度%）与占比变化 pp 双行常驻 */}
                    <div className={`font-medium ${trendColor}`}>
                      {item.changeAmount > 0 ? '+' : ''}
                      {formatMoney(item.changeAmount)}
                    </div>
                    <div className="flex items-center justify-end gap-1 text-[10px]">
                      {changePct !== null && (
                        <span className={trendColor}>
                          {changePct > 0 ? '+' : ''}
                          {changePct.toFixed(1)}%
                        </span>
                      )}
                      {(isNew || isGone) && (
                        <span
                          className={`px-1 py-0.5 rounded-full ${
                            isNew ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
                          }`}
                        >
                          {isNew ? '新增' : '清仓'}
                        </span>
                      )}
                    </div>
                    <div className={`text-[10px] ${ppColor}`}>
                      占比 {item.changeRatio > 0 ? '+' : ''}
                      {item.changeRatio.toFixed(1)}pp
                    </div>
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
