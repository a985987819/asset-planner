// ============================================================
// 趋势回溯页 — 基于快照的间隔对比 + 时间序列
// 用户按 3/6 个月节奏更新，每次保存一条快照，这里展示长期轨迹
// ============================================================

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Save, GitCompare, RotateCcw } from 'lucide-react';
import { Button, Select } from 'animal-island-ui';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCategories } from '@/hooks/useCategories';
import { formatInterval, toggleInSet, buildCategoryMap } from '@/lib/snapshotUtils';
import {
  calcBaseTotal,
  calcMonthlyDCATotal,
  formatMoney,
  formatPercent,
} from '@/lib/calculations';
import { PageHeader, EmptyState } from '@/components/ui/Common';
import { SnapshotCompareModal } from '@/components/snapshot/SnapshotCompareModal';
import { SankeyChart } from '@/components/charts/SankeyChart';
import { buildSankeyData } from '@/lib/sankey';
import type { Snapshot } from '@/types';

interface TrendTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  getLabel: (id: string) => string;
  formatValue: (v: number) => string;
}

function TrendTooltip({ active, payload, label, getLabel, formatValue }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-100 px-3 py-2 text-sm">
      <div className="font-medium text-gray-900 mb-1">{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-gray-500">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span>{getLabel(entry.dataKey)}</span>
          <span className="ml-auto font-medium text-gray-900">{formatValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function TrendPage() {
  const snapshots = usePortfolioStore((s) => s.snapshots);
  const createDailySnapshot = usePortfolioStore((s) => s.createDailySnapshot);
  const tradingDays = useSettingsStore((s) => s.monthlyTradingDays);
  const { categories, getLabel, getColor } = useCategories();

  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [showDca, setShowDca] = useState(true);
  const [compareSnapshots, setCompareSnapshots] = useState<Snapshot[]>([]);

  // 桑基图状态
  const [sankeyPortfolio, setSankeyPortfolio] = useState<'base' | 'dca'>('base');
  const [sankeyMode, setSankeyMode] = useState<'single' | 'compare'>('single');
  const [sankeySingleId, setSankeySingleId] = useState('');
  const [sankeyStartId, setSankeyStartId] = useState('');
  const [sankeyEndId, setSankeyEndId] = useState('');

  // 快照按时间升序
  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [snapshots]
  );

  // 数据跨年时 X 轴标签带年份，避免每年同月日重名
  const multiYear =
    new Set(sorted.map((s) => new Date(s.createdAt).getFullYear())).size > 1;

  // 每个快照的底仓总额 / 月定投 / 品类聚合
  const perSnapshot = useMemo(
    () =>
      sorted.map((s) => {
        const base = s.snapshotData.basePortfolio?.assets ?? [];
        const dca = s.snapshotData.dcaPortfolio?.assets ?? [];
        const byCat = new Map<string, number>();
        for (const a of base) byCat.set(a.category, (byCat.get(a.category) ?? 0) + a.amount);
        return {
          time: new Date(s.createdAt).toLocaleDateString(
            'zh-CN',
            multiYear
              ? { year: 'numeric', month: 'numeric', day: 'numeric' }
              : { month: 'numeric', day: 'numeric' }
          ),
          baseTotal: calcBaseTotal(base),
          dcaMonthly: calcMonthlyDCATotal(dca, tradingDays),
          byCat,
        };
      }),
    [sorted, multiYear, tradingDays]
  );

  // 所有快照中出现过的品类并集
  const allCatIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of perSnapshot) for (const c of p.byCat.keys()) set.add(c);
    return Array.from(set);
  }, [perSnapshot]);

  // 图例顺序：按当前品类管理顺序，未在设置中的品类排最后
  const catOrder = useMemo(() => {
    const m = new Map<string, number>();
    categories.forEach((c, i) => m.set(c.id, i));
    return m;
  }, [categories]);
  const legendCats = useMemo(
    () => [...allCatIds].sort((a, b) => (catOrder.get(a) ?? 999) - (catOrder.get(b) ?? 999)),
    [allCatIds, catOrder]
  );

  // ① 总资产折线
  const lineData = useMemo(
    () => perSnapshot.map((p) => ({ time: p.time, baseTotal: p.baseTotal, dcaMonthly: p.dcaMonthly })),
    [perSnapshot]
  );

  // ② 品类金额堆叠（隐藏品类置 0）
  const areaData = useMemo(
    () =>
      perSnapshot.map((p) => {
        const row: Record<string, number | string> = { time: p.time };
        for (const c of allCatIds) row[c] = hiddenCats.has(c) ? 0 : (p.byCat.get(c) ?? 0);
        return row;
      }),
    [perSnapshot, allCatIds, hiddenCats]
  );

  // ③ 品类占比 100% 堆叠（隐藏品类后剩余项归一化到 100%）
  const ratioData = useMemo(
    () =>
      perSnapshot.map((p) => {
        const row: Record<string, number | string> = { time: p.time };
        const visibleTotal = allCatIds.reduce(
          (sum, c) => sum + (hiddenCats.has(c) ? 0 : (p.byCat.get(c) ?? 0)),
          0
        );
        for (const c of allCatIds) {
          row[c] = hiddenCats.has(c)
            ? 0
            : visibleTotal > 0
            ? (((p.byCat.get(c) ?? 0) / visibleTotal) * 100)
            : 0;
        }
        return row;
      }),
    [perSnapshot, allCatIds, hiddenCats]
  );

  // 环比摘要：最近两期
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
  const latest = sorted.length >= 1 ? sorted[sorted.length - 1] : null;
  const prevTotal = prev ? calcBaseTotal(prev.snapshotData.basePortfolio?.assets ?? []) : 0;
  const latestTotal = latest ? calcBaseTotal(latest.snapshotData.basePortfolio?.assets ?? []) : 0;
  const totalChange = latestTotal - prevTotal;
  const changePct = prevTotal > 0 ? (totalChange / prevTotal) * 100 : 0;

  // 记录概览跨度
  const span = useMemo(() => {
    if (sorted.length < 2) return '';
    const ms =
      new Date(sorted[sorted.length - 1].createdAt).getTime() -
      new Date(sorted[0].createdAt).getTime();
    const months = ms / (30 * 86400000);
    return months < 1 ? `${Math.round(ms / 86400000)} 天` : `${Math.round(months)} 个月`;
  }, [sorted]);

  // 桑基图：品类名/颜色取快照自身设置，未知品类回退当前设置
  const catMap = useMemo(() => buildCategoryMap(snapshots), [snapshots]);

  const getCategoryInfo = (id: string) =>
    catMap.get(id) ?? { name: getLabel(id), color: getColor(id) };

  const buildSankey = (snapshot: Snapshot) => {
    const assets =
      sankeyPortfolio === 'base'
        ? snapshot.snapshotData.basePortfolio?.assets ?? []
        : snapshot.snapshotData.dcaPortfolio?.assets ?? [];
    return buildSankeyData(assets, getCategoryInfo);
  };

  const singleSnapshot = sorted.find((s) => s.id === sankeySingleId) ?? sorted[sorted.length - 1];
  const startSnapshot = sorted.find((s) => s.id === sankeyStartId) ?? sorted[0];
  const endSnapshot = sorted.find((s) => s.id === sankeyEndId) ?? sorted[sorted.length - 1];
  const sankeyRootLabel = sankeyPortfolio === 'base' ? '总资产' : '日定投';
  const singleSankey = buildSankey(singleSnapshot);
  const startSankey = buildSankey(startSnapshot);
  const endSankey = buildSankey(endSnapshot);

  if (sorted.length < 2) {
    return (
      <div className="pb-20">
        <PageHeader title="趋势回溯" subtitle="按固定间隔更新，直观看到资产变化" />
        <EmptyState
          icon={<TrendingUp size={48} />}
          title="至少需要 2 期记录"
          description="每 3/6 个月回来更新一次资产，保存今日记录后即可对比总资产、各部分与占比的变化。"
          action={
            <Button type="primary" size="small" icon={<Save size={16} />} onClick={createDailySnapshot}>
              保存今日记录
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageHeader title="趋势回溯" subtitle="按固定间隔更新，直观看到资产变化" />

      {/* 环比摘要卡 */}
      {prev && latest && (
        <div className="card mb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-gray-500">
                距上次更新 {formatInterval(prev.createdAt, latest.createdAt)}
              </div>
              <div className="mt-1 text-lg font-bold">
                <span className={totalChange > 0 ? 'text-green-600' : totalChange < 0 ? 'text-red-600' : 'text-gray-500'}>
                  {totalChange > 0 ? '+' : ''}{formatMoney(totalChange)}
                </span>
                <span className="ml-2 text-sm font-normal text-gray-400">
                  ({prevTotal > 0 ? `${totalChange > 0 ? '+' : ''}${changePct.toFixed(1)}%` : '—'})
                </span>
              </div>
              <div className="text-xs text-gray-400">
                {formatMoney(prevTotal)} → {formatMoney(latestTotal)}
              </div>
            </div>
            <Button
              onClick={() => setCompareSnapshots([prev, latest])}
              size="small"
              icon={<GitCompare size={16} />}
            >
              查看明细对比
            </Button>
          </div>
        </div>
      )}

      {/* 记录概览 */}
      <div className="mb-4 text-xs text-gray-400">
        {sorted.length} 期记录 · 跨度 {span}
      </div>

      {/* 总资产走势 */}
      <div className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={18} className="text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">总资产走势</h2>
          <button
            onClick={() => setShowDca((v) => !v)}
            className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              showDca ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'
            }`}
          >
            月定投 {showDca ? '显示' : '隐藏'}
          </button>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={lineData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
              {/* 总资产与月定投量纲差 2 个数量级，分左右轴避免月定投线贴地不可读 */}
              <YAxis
                yAxisId="total"
                tick={{ fontSize: 11 }}
                width={44}
                tickFormatter={(v) => formatMoney(Number(v)).replace('¥', '')}
              />
              <YAxis
                yAxisId="dca"
                orientation="right"
                tick={{ fontSize: 11 }}
                width={40}
                tickFormatter={(v) => formatMoney(Number(v)).replace('¥', '')}
              />
              <Tooltip formatter={(value) => formatMoney(Number(value))} />
              <Line
                yAxisId="total"
                type="monotone"
                dataKey="baseTotal"
                name="底仓总额"
                stroke="#19c8b9"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              {showDca && (
                <Line
                  yAxisId="dca"
                  type="monotone"
                  dataKey="dcaMonthly"
                  name="月定投"
                  stroke="#f5c31c"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 品类金额堆叠 */}
      <div className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={18} className="text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">品类金额</h2>
          {hiddenCats.size > 0 && (
            <span className="ml-auto text-xs text-gray-400">已排除 {hiddenCats.size} 项</span>
          )}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={areaData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={44}
                tickFormatter={(v) => formatMoney(Number(v)).replace('¥', '')}
              />
              <Tooltip
                content={
                  <TrendTooltip getLabel={getLabel} formatValue={(v) => formatMoney(v)} />
                }
              />
              {legendCats.map((c) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  name={getLabel(c)}
                  stackId="1"
                  stroke={getColor(c)}
                  fill={getColor(c)}
                  fillOpacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 品类占比 100% 堆叠 */}
      <div className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={18} className="text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">品类占比</h2>
          {hiddenCats.size > 0 && (
            <span className="ml-auto text-xs text-gray-400">已排除 {hiddenCats.size} 项</span>
          )}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ratioData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                width={36}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={
                  <TrendTooltip getLabel={getLabel} formatValue={(v) => `${v.toFixed(1)}%`} />
                }
              />
              {legendCats.map((c) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  name={getLabel(c)}
                  stackId="1"
                  stroke={getColor(c)}
                  fill={getColor(c)}
                  fillOpacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 桑基图（单期构成图：总资产/日定投 → 品类 → 具体基金） */}
      <div className="card mb-4">
        <div className="mb-3 flex items-center gap-2">
          <GitCompare size={18} className="text-primary-600" />
          <h2 className="text-base font-semibold text-gray-900">桑基图</h2>
        </div>

        {/* 组合 + 模式切换 */}
        <div className="mb-3 flex gap-2">
          <div className="flex flex-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setSankeyPortfolio('base')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sankeyPortfolio === 'base' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              底仓
            </button>
            <button
              onClick={() => setSankeyPortfolio('dca')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sankeyPortfolio === 'dca' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              定投
            </button>
          </div>
          <div className="flex flex-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setSankeyMode('single')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sankeyMode === 'single' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              单期
            </button>
            <button
              onClick={() => setSankeyMode('compare')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                sankeyMode === 'compare' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              对比
            </button>
          </div>
        </div>

        {sankeyMode === 'single' ? (
          <>
            <Select
              options={sorted.map((s) => ({
                key: s.id,
                label: `${s.label} · ${new Date(s.createdAt).toLocaleDateString('zh-CN')}`,
              }))}
              value={singleSnapshot.id}
              onChange={(key) => setSankeySingleId(key)}
            />
            <div className="mt-3">
              <SankeyChart
                data={singleSankey}
                formatValue={formatMoney}
                rootLabel={sankeyRootLabel}
              />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  options={sorted.map((s) => ({
                    key: s.id,
                    label: `${s.label} · ${new Date(s.createdAt).toLocaleDateString('zh-CN')}`,
                  }))}
                  value={startSnapshot.id}
                  onChange={(key) => setSankeyStartId(key)}
                />
              </div>
              <span className="text-lg text-gray-300">→</span>
              <div className="min-w-0 flex-1">
                <Select
                  options={sorted.map((s) => ({
                    key: s.id,
                    label: `${s.label} · ${new Date(s.createdAt).toLocaleDateString('zh-CN')}`,
                  }))}
                  value={endSnapshot.id}
                  onChange={(key) => setSankeyEndId(key)}
                />
              </div>
            </div>
            {startSnapshot.id === endSnapshot.id && (
              <div className="mt-2 text-xs text-amber-600">请选择两个不同日期</div>
            )}
            <div className="mt-3 space-y-4">
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">
                  {startSnapshot.label} · {new Date(startSnapshot.createdAt).toLocaleDateString('zh-CN')}
                </div>
                <SankeyChart
                  data={startSankey}
                  formatValue={formatMoney}
                  rootLabel={sankeyRootLabel}
                />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-gray-500">
                  {endSnapshot.label} · {new Date(endSnapshot.createdAt).toLocaleDateString('zh-CN')}
                </div>
                <SankeyChart
                  data={endSankey}
                  formatValue={formatMoney}
                  rootLabel={sankeyRootLabel}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 品类图例（点击隐藏/恢复，三图共用） */}
      <div className="card">
        <div className="space-y-1.5">
          {legendCats.map((c) => {
            const isHidden = hiddenCats.has(c);
            return (
              <button
                key={c}
                onClick={() => toggleInSet(c, hiddenCats, setHiddenCats)}
                className={`flex w-full items-center gap-2 text-sm transition-opacity ${
                  isHidden ? 'opacity-30 line-through' : 'hover:bg-gray-50'
                }`}
                title={isHidden ? '点击恢复该项统计' : '点击取消该项统计'}
              >
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: getColor(c) }}
                />
                <span className="flex-1 text-left text-gray-600">{getLabel(c)}</span>
              </button>
            );
          })}
          {hiddenCats.size > 0 && (
            <Button
              type="text"
              size="small"
              block
              className="mt-1"
              icon={<RotateCcw size={12} />}
              onClick={() => setHiddenCats(new Set())}
            >
              重置排除（恢复全部统计）
            </Button>
          )}
        </div>
      </div>

      {compareSnapshots.length >= 2 && (
        <SnapshotCompareModal
          open={compareSnapshots.length >= 2}
          onClose={() => setCompareSnapshots([])}
          snapshots={compareSnapshots}
        />
      )}
    </div>
  );
}
