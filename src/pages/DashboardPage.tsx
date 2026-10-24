import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TrendingUp, PiggyBank, History, Save, RotateCcw } from 'lucide-react';
import { Button } from 'animal-island-ui';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  calcBaseTotal,
  calcDailyDCATotal,
  calcMonthlyDCATotal,
  calcSalaryRatio,
  isDCABudgetExceeded,
  formatMoney,
  formatPercent,
} from '@/lib/calculations';
import { useCategories } from '@/hooks/useCategories';
import { CustomPieTooltip } from '@/components/charts/CustomPieTooltip';
import { PageHeader, StatCard, EmptyState } from '@/components/ui/Common';
import { showToast } from '@/stores/toastStore';
import { SnapshotManageModal } from '@/components/snapshot/SnapshotManageModal';

/** 基于可见品类重新聚合占比（隐藏的品类不参与统计，剩余项重新归一化到 100%） */
function recalcRatios(
  assets: { category: string; amount: number }[],
  hidden: Set<string>
): { category: string; amount: number; ratio: number }[] {
  const visible = assets.filter((a) => !hidden.has(a.category));
  const total = visible.reduce((s, a) => s + a.amount, 0);
  if (total === 0) return [];
  const byCategory = new Map<string, number>();
  for (const a of visible) {
    byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
  }
  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount, ratio: (amount / total) * 100 }))
    .sort((a, b) => b.ratio - a.ratio);
}

function toggleInSet(value: string, set: Set<string>, setter: (s: Set<string>) => void) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

export default function DashboardPage() {
  const getActiveBase = usePortfolioStore((s) => s.getActiveBase);
  const getActiveDCA = usePortfolioStore((s) => s.getActiveDCA);
  const snapshots = usePortfolioStore((s) => s.snapshots);
  const createDailySnapshot = usePortfolioStore((s) => s.createDailySnapshot);
  const removeSnapshot = usePortfolioStore((s) => s.removeSnapshot);
  const restoreSnapshot = usePortfolioStore((s) => s.restoreSnapshot);
  const settings = useSettingsStore();
  const { getLabel, getColor } = useCategories();

  // 隐藏的品类（点击右侧图例切换；隐藏后该品类不参与统计，剩余项重新归一化）
  const [hiddenBase, setHiddenBase] = useState<Set<string>>(new Set());
  const [hiddenDca, setHiddenDca] = useState<Set<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);

  const basePortfolio = getActiveBase();
  const dcaPortfolio = getActiveDCA();
  const baseAssets = basePortfolio?.assets ?? [];
  const dcaAssets = dcaPortfolio?.assets ?? [];

  const baseTotal = useMemo(() => calcBaseTotal(baseAssets), [baseAssets]);
  // 原始品类聚合（图例展示用，包含所有品类）
  const baseRatiosAll = useMemo(() => {
    const total = baseTotal;
    if (total === 0) return [];
    const byCategory = new Map<string, number>();
    for (const a of baseAssets) byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
    return Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount, ratio: (amount / total) * 100 }))
      .sort((a, b) => b.ratio - a.ratio);
  }, [baseAssets, baseTotal]);
  // 饼图数据：基于可见品类重新计算占比
  const baseRatios = useMemo(() => recalcRatios(baseAssets, hiddenBase), [baseAssets, hiddenBase]);
  // 饼图统计总额（仅可见项，与饼图口径一致）
  const baseVisibleTotal = useMemo(
    () => baseRatios.reduce((s, i) => s + i.amount, 0),
    [baseRatios]
  );

  const dailyDCA = useMemo(() => calcDailyDCATotal(dcaAssets), [dcaAssets]);
  const monthlyDCA = useMemo(() => calcMonthlyDCATotal(dcaAssets), [dcaAssets]);
  const salaryRatio = useMemo(() => calcSalaryRatio(dcaAssets, settings), [dcaAssets, settings]);
  const budgetExceeded = useMemo(
    () => isDCABudgetExceeded(dcaAssets, settings),
    [dcaAssets, settings]
  );

  const dcaRatiosAll = useMemo(() => {
    const total = dailyDCA;
    if (total === 0) return [];
    const byCategory = new Map<string, number>();
    for (const a of dcaAssets) byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
    return Array.from(byCategory.entries())
      .map(([category, amount]) => ({ category, amount, ratio: (amount / total) * 100 }))
      .sort((a, b) => b.ratio - a.ratio);
  }, [dcaAssets, dailyDCA]);
  const dcaRatios = useMemo(() => recalcRatios(dcaAssets, hiddenDca), [dcaAssets, hiddenDca]);
  const dcaVisibleTotal = useMemo(
    () => dcaRatios.reduce((s, i) => s + i.amount, 0),
    [dcaRatios]
  );

  const hasData = baseAssets.length > 0 || dcaAssets.length > 0;

  if (!hasData) {
    return (
      <div className="pb-20" id="dashboard-empty">
        <PageHeader title="资产总览" subtitle="底仓配置 + 定投计划" />
        <EmptyState
          title="还没有数据"
          description="在“底仓”和“定投”页面添加你的资产配置，这里会实时显示总览。"
        />
      </div>
    );
  }

  return (
    <div className="pb-20" id="dashboard-page">
      <PageHeader title="资产总览" subtitle="底仓配置 + 定投计划" />

      <div id="dashboard-stats" className="grid grid-cols-2 gap-3 mb-5">
        <StatCard
          label="底仓总额"
          value={formatMoney(baseTotal)}
          sub={baseAssets.length > 0 ? `${baseAssets.length} 个品种` : undefined}
        />
        <StatCard
          label="日定投额"
          value={formatMoney(dailyDCA)}
          sub={dcaAssets.length > 0 ? `${dcaAssets.length} 个品种` : undefined}
        />
        <StatCard label="月定投额 (x22)" value={formatMoney(monthlyDCA)} />
        <StatCard
          label="月薪占比"
          value={settings.monthlySalary > 0 ? formatPercent(salaryRatio) : '未设置'}
          sub={settings.monthlySalary > 0 ? `上限 ${settings.dcaRatioLimit}%` : undefined}
          alert={budgetExceeded}
          color={budgetExceeded ? 'red' : 'default'}
        />
      </div>

      <div id="dashboard-snapshot-actions" className="mb-4 flex gap-2">
        <Button
          type="primary"
          block
          size="small"
          icon={<Save size={16} />}
          onClick={() => {
            createDailySnapshot();
            showToast('今日记录已保存');
          }}
        >
          保存今日记录
        </Button>
        <Button block size="small" icon={<History size={16} />} onClick={() => setHistoryOpen(true)}>
          查看历史对比
        </Button>
      </div>

      {baseAssets.length > 0 && (
        <div id="dashboard-base-chart" className="card mb-4">
          <div className="mb-3 flex items-center gap-2">
            <PiggyBank size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">底仓占比</h2>
            <span className="ml-auto text-xs text-gray-400">
              统计总额 {formatMoney(baseVisibleTotal)}
              {hiddenBase.size > 0 && <span className="ml-1 text-gray-400">（已排除 {hiddenBase.size} 项）</span>}
            </span>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div id="dashboard-base-pie" className="h-44 w-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={baseRatios}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="ratio"
                    nameKey="category"
                  >
                    {baseRatios.map((entry) => (
                      <Cell key={entry.category} fill={getColor(entry.category)} stroke="none" />
                    ))}
                  </Pie>
                  <CustomPieTooltip
                    getLabel={getLabel}
                    formatPercent={formatPercent}
                    formatMoney={formatMoney}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div id="dashboard-base-legend" className="w-full flex-1 space-y-1.5">
              {baseRatiosAll.map((item) => {
                const isHidden = hiddenBase.has(item.category);
                return (
                  <button
                    key={item.category}
                    id={`dashboard-base-legend-${item.category}`}
                    onClick={() => toggleInSet(item.category, hiddenBase, setHiddenBase)}
                    className={`flex w-full items-center gap-2 text-sm transition-opacity ${
                      isHidden ? 'opacity-30 line-through' : 'hover:bg-gray-50'
                    }`}
                    title={isHidden ? '点击恢复该项统计' : '点击取消该项统计'}
                  >
                    <div
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: getColor(item.category) }}
                    />
                    <span className="flex-1 text-left text-gray-600">{getLabel(item.category)}</span>
                    <span className="font-medium text-gray-900">{formatPercent(item.ratio)}</span>
                  </button>
                );
              })}
              {hiddenBase.size > 0 && (
                <Button
                  type="text"
                  size="small"
                  block
                  className="mt-1"
                  icon={<RotateCcw size={12} />}
                  onClick={() => setHiddenBase(new Set())}
                >
                  重置排除（恢复全部统计）
                </Button>
              )}
            </div>
          </div>
        </div>
      )}


      {dcaAssets.length > 0 && (
        <div id="dashboard-dca-chart" className="card">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-primary-600" />
            <h2 className="text-base font-semibold text-gray-900">定投占比</h2>
            <span className="ml-auto text-xs text-gray-400">
              统计日定投 {formatMoney(dcaVisibleTotal)}
              {hiddenDca.size > 0 && <span className="ml-1 text-gray-400">（已排除 {hiddenDca.size} 项）</span>}
            </span>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div id="dashboard-dca-pie" className="h-44 w-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dcaRatios}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="ratio"
                    nameKey="category"
                  >
                    {dcaRatios.map((entry) => (
                      <Cell key={entry.category} fill={getColor(entry.category)} stroke="none" />
                    ))}
                  </Pie>
                  <CustomPieTooltip
                    getLabel={getLabel}
                    formatPercent={formatPercent}
                    formatMoney={formatMoney}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div id="dashboard-dca-legend" className="w-full flex-1 space-y-1.5">
              {dcaRatiosAll.map((item) => {
                const isHidden = hiddenDca.has(item.category);
                return (
                  <button
                    key={item.category}
                    id={`dashboard-dca-legend-${item.category}`}
                    onClick={() => toggleInSet(item.category, hiddenDca, setHiddenDca)}
                    className={`flex w-full items-center gap-2 text-sm transition-opacity ${
                      isHidden ? 'opacity-30 line-through' : 'hover:bg-gray-50'
                    }`}
                    title={isHidden ? '点击恢复该项统计' : '点击取消该项统计'}
                  >
                    <div
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: getColor(item.category) }}
                    />
                    <span className="flex-1 text-left text-gray-600">{getLabel(item.category)}</span>
                    <span className="font-medium text-gray-900">{formatPercent(item.ratio)}</span>
                  </button>
                );
              })}
              {hiddenDca.size > 0 && (
                <Button
                  type="text"
                  size="small"
                  block
                  className="mt-1"
                  icon={<RotateCcw size={12} />}
                  onClick={() => setHiddenDca(new Set())}
                >
                  重置排除（恢复全部统计）
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {budgetExceeded && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          月定投占月薪的 {formatPercent(salaryRatio)}，超出设定的 {settings.dcaRatioLimit}% 上限。
        </div>
      )}

      <SnapshotManageModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        snapshots={snapshots}
        removeSnapshot={removeSnapshot}
        restoreSnapshot={restoreSnapshot}
      />
    </div>
  );
}
