import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, FolderOpen, AlertTriangle, Camera, Search, X, RotateCcw, Link } from 'lucide-react';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  calcDailyDCATotal,
  calcMonthlyDCATotal,
  calcSalaryRatio,
  isDCABudgetExceeded,
  formatMoney,
  formatPercent,
} from '@/lib/calculations';
import { useCategories } from '@/hooks/useCategories';
import type { WatchlistItem } from '@/types';
import { PageHeader, EmptyState } from '@/components/ui/Common';
import { Modal } from '@/components/ui/Modal';
import { WatchlistPickerModal } from '@/components/watchlist/WatchlistPickerModal';
import { ReceiptPreviewModal } from '@/components/snapshot/ReceiptPreviewModal';
import { SnapshotManageModal } from '@/components/snapshot/SnapshotManageModal';
import { SankeyChart } from '@/components/charts/SankeyChart';
import { buildSankeyData } from '@/lib/sankey';

interface AssetFormData {
  category: string;
  name: string;
  amount: string;
  code: string;
  watchlistId: string;
}

const emptyForm: AssetFormData = { category: '', name: '', amount: '', code: '', watchlistId: '' };

/** 基于资产列表重新聚合品类占比（归一化到 100%） */
function aggregateRatios(assets: { category: string; amount: number }[]) {
  const total = assets.reduce((s, a) => s + a.amount, 0);
  if (total === 0) return [];
  const byCategory = new Map<string, number>();
  for (const a of assets) byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
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

export default function DCAPage() {
  const {
    getActiveDCA,
    addDCAAsset,
    updateDCAAsset,
    removeDCAAsset,
    dcaPortfolios,
    activeDCAId,
    createPortfolio,
    setActivePortfolio,
    deleteActivePortfolio,
    snapshots,
    createDailySnapshot,
    removeSnapshot: removeStoredSnapshot,
    restoreSnapshot,
  } = usePortfolioStore();

  const settings = useSettingsStore();
  const { categories, getLabel, getColor } = useCategories();
  const watchlist = useSettingsStore((s) => s.watchlist);

  const portfolio = getActiveDCA();
  const assets = portfolio?.assets ?? [];
  const dailyTotal = useMemo(() => calcDailyDCATotal(assets), [assets]);
  const monthlyTotal = useMemo(() => calcMonthlyDCATotal(assets), [assets]);
  const salaryRatio = useMemo(() => calcSalaryRatio(assets, settings), [assets, settings]);
  const budgetExceeded = useMemo(
    () => isDCABudgetExceeded(assets, settings),
    [assets, settings]
  );

  // 品类 Tab 状态
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // 搜索状态
  const [search, setSearch] = useState('');
  // 通过右侧图例隐藏的品类（点击图例切换；隐藏后该品类不参与统计）
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  // 通过明细列表排除的单项（点击明细切换；排除后仍留在列表中，可再点击恢复）
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // 计算品类 Tab 列表
  const categoryTabs = useMemo(() => {
    const usedIds = new Set(assets.map((a) => a.category));
    return [
      { id: 'all', label: '全部', color: '' },
      ...categories
        .filter((c) => usedIds.has(c.id))
        .map((c) => ({ id: c.id, label: c.name, color: c.color })),
    ];
  }, [assets, categories]);

  // 品类过滤 + 搜索过滤
  const categoryAssets = useMemo(
    () => (activeCategory === 'all' ? assets : assets.filter((a) => a.category === activeCategory)),
    [assets, activeCategory]
  );

  // 明细排序：先按品类管理顺序归并，同品类内按添加时间（sortOrder）
  const searchedAssets = useMemo(() => {
    let list = search.trim()
      ? categoryAssets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase().trim()))
      : categoryAssets;
    const catOrder = new Map(categories.map((c) => [c.id, c.sortOrder]));
    return [...list].sort((a, b) => {
      const oa = catOrder.get(a.category) ?? 999;
      const ob = catOrder.get(b.category) ?? 999;
      if (oa !== ob) return oa - ob;
      return a.sortOrder - b.sortOrder;
    });
  }, [categoryAssets, search, categories]);

  // 右侧图例：全量资产的品类聚合（包含所有品类，用于图例展示与点击切换）
  const ratiosAll = useMemo(() => aggregateRatios(assets), [assets]);

  // 饼图数据：在全量资产基础上，排除“隐藏品类”和“排除单项”，再重新归一化占比
  const chartAssets = useMemo(
    () =>
      assets.filter(
        (a) => !hiddenCategories.has(a.category) && !excludedIds.has(a.id)
      ),
    [assets, hiddenCategories, excludedIds]
  );
  const ratios = useMemo(() => aggregateRatios(chartAssets), [chartAssets]);
  const visibleTotal = ratios.reduce((s, i) => s + i.amount, 0);

  // 桑基图：日定投 → 品类 → 具体基金（与饼图同口径，随隐藏/排除联动）
  const getCategoryInfo = (id: string) => ({ name: getLabel(id), color: getColor(id) });
  const sankeyData = buildSankeyData(chartAssets, getCategoryInfo);

  // 历史记录
  const latestSnapshot = snapshots[0] ?? null;
  const latestSnapshotDaily = latestSnapshot
    ? calcDailyDCATotal(latestSnapshot.snapshotData.dcaPortfolio?.assets ?? [])
    : 0;
  const latestSnapshotMonthly = latestSnapshotDaily * 22;
  const dailyChange = dailyTotal - latestSnapshotDaily;

  const firstCategoryId = categories[0]?.id ?? '';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssetFormData>(emptyForm);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showPortfolios, setShowPortfolios] = useState(false);

  const openAdd = () => setPickerOpen(true);

  const openEdit = (asset: (typeof assets)[0]) => {
    setEditingId(asset.id);
    setForm({
      category: asset.category,
      name: asset.name,
      amount: String(asset.amount),
      code: asset.code ?? '',
      watchlistId: asset.watchlistId ?? '',
    });
    setFormModalOpen(true);
  };

  const handleQuickAdd = (item: WatchlistItem, amount: number) => {
    addDCAAsset(item.categoryId, item.name, amount, { watchlistId: item.id, code: item.code });
  };

  const handleManualInput = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category: firstCategoryId });
    setFormModalOpen(true);
  };

  // 选中自选条目 → 回填品类/名称/代码；选"不关联" → 仅清除链接
  const handleWatchlistSelect = (watchlistId: string) => {
    if (!watchlistId) {
      setForm((f) => ({ ...f, watchlistId: '' }));
      return;
    }
    const item = watchlist.find((w) => w.id === watchlistId);
    if (item) {
      setForm({
        ...form,
        watchlistId: item.id,
        category: item.categoryId,
        name: item.name,
        code: item.code,
      });
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.name.trim() || Number.isNaN(amount) || amount <= 0) return;

    const common = {
      category: form.category,
      name: form.name.trim(),
      code: form.code.trim(),
      watchlistId: form.watchlistId || undefined,
    };
    if (editingId) {
      updateDCAAsset(editingId, { ...common, amount });
    } else {
      addDCAAsset(common.category, common.name, amount, {
        watchlistId: common.watchlistId,
        code: common.code,
      });
    }
    setFormModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这条定投吗？')) {
      removeDCAAsset(id);
      setExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const toggleExclude = (assetId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const clearAllExclusions = () => {
    setExcludedIds(new Set());
    setHiddenCategories(new Set());
  };

  const hasAnyExclusion = excludedIds.size > 0 || hiddenCategories.size > 0;

  return (
    <div className="pb-20" id="dca-page">
      <PageHeader
        title="每日定投"
        subtitle={portfolio ? `${portfolio.name} · 日 ${formatMoney(dailyTotal)} · 月 ${formatMoney(monthlyTotal)}` : ''}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setReceiptOpen(true)}
              className="btn-ghost text-xs"
              title="保存今日记录"
              disabled={assets.length === 0}
            >
              <Camera size={16} />
            </button>
            <button onClick={() => setShowPortfolios(true)} className="btn-ghost text-xs">
              <FolderOpen size={16} />
            </button>
            <button onClick={openAdd} className="btn-primary text-sm">
              <Plus size={16} /> 添加
            </button>
          </div>
        }
      />

      <div className="card mb-4" id="dca-budget-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">定投预算</h3>
          {budgetExceeded && (
            <span className="badge-red flex items-center gap-1">
              <AlertTriangle size={12} /> 超出预算
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="mb-0.5 text-xs text-gray-400">日定投</div>
            <div className="text-lg font-bold text-gray-900">{formatMoney(dailyTotal)}</div>
          </div>
          <div>
            <div className="mb-0.5 text-xs text-gray-400">月定投 (x22)</div>
            <div className="text-lg font-bold text-gray-900">{formatMoney(monthlyTotal)}</div>
          </div>
          <div>
            <div className="mb-0.5 text-xs text-gray-400">月薪占比</div>
            <div className={`text-lg font-bold ${budgetExceeded ? 'text-red-600' : 'text-gray-900'}`}>
              {settings.monthlySalary > 0 ? formatPercent(salaryRatio) : '未设置'}
            </div>
          </div>
        </div>
        {settings.monthlySalary > 0 && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-gray-400">
              <span>0</span>
              <span>上限 {settings.dcaRatioLimit}%</span>
              <span>100%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${budgetExceeded ? 'bg-red-500' : 'bg-primary-500'}`}
                style={{ width: `${Math.min(salaryRatio, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 快照 / 历史记录 */}
      {latestSnapshot && (
        <div className="card mb-4" id="dca-latest-snapshot">
          <div className="text-sm font-medium text-gray-900">
            上次记录：{new Date(latestSnapshot.createdAt).toLocaleDateString('zh-CN')} · 日定投 {formatMoney(latestSnapshotDaily)} · 月定投 {formatMoney(latestSnapshotMonthly)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {dailyChange === 0 ? (
              '当前数据与上次记录一致'
            ) : (
              <span className={dailyChange > 0 ? 'text-green-600' : 'text-red-600'}>
                日定投较上次 {dailyChange > 0 ? '+' : ''}
                {formatMoney(dailyChange)}
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={createDailySnapshot} className="btn-primary flex-1 text-sm">
              保存今日
            </button>
            <button onClick={() => setHistoryOpen(true)} className="btn-secondary flex-1 text-sm">
              历史记录
            </button>
          </div>
        </div>
      )}

      {!latestSnapshot && assets.length > 0 && (
        <div className="card mb-4" id="dca-first-snapshot">
          <div className="text-sm font-medium text-gray-900">还没有历史记录</div>
          <div className="mt-1 text-xs text-gray-500">保存今日后，后续可以按日期回看并以历史记录为基准继续编辑。</div>
          <div className="mt-3">
            <button onClick={createDailySnapshot} className="btn-primary w-full text-sm">
              保存今日
            </button>
          </div>
        </div>
      )}

      {assets.length > 0 && (
        <div className="card mb-4" id="dca-chart-card">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700">资金流向</h3>
            <span className="ml-auto text-xs text-gray-400">
              统计日定投 {formatMoney(visibleTotal)}
              {hasAnyExclusion && (
                <span className="ml-1">
                  （已排除 {hiddenCategories.size} 品类 / {excludedIds.size} 单项）
                </span>
              )}
            </span>
          </div>
          <div className="w-full">
            <SankeyChart
              data={sankeyData}
              formatValue={formatMoney}
              rootLabel="日定投"
              height={240}
              emptyText="暂无定投数据"
            />
          </div>
          <div id="dca-legend" className="mt-3 w-full space-y-1.5">
              {ratiosAll.map((item) => {
                const isHidden = hiddenCategories.has(item.category);
                return (
                  <button
                    key={item.category}
                    id={`dca-legend-${item.category}`}
                    onClick={() => toggleInSet(item.category, hiddenCategories, setHiddenCategories)}
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
              {hasAnyExclusion && (
                <button
                  onClick={clearAllExclusions}
                  className="btn-ghost mt-1 flex w-full items-center justify-center gap-1 text-xs text-gray-500"
                >
                  <RotateCcw size={12} />
                  重置排除（恢复全部统计）
                </button>
              )}
            </div>
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="还没有定投计划"
          description="添加每日定投标的，系统会自动计算月定投额和工资占比"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus size={16} /> 添加定投
            </button>
          }
        />
      ) : (
        <>
          {/* 品类 Tab 筛选 */}
          <div id="dca-category-tabs" className="mb-3 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {categoryTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeCategory === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.id !== 'all' && (
                  <span
                    className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: tab.color }}
                  />
                )}
                {tab.label}
              </button>
            ))}
          </div>

          {/* 搜索 + 排除提示 */}
          <div id="dca-search-bar" className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8 pr-8 text-sm"
                placeholder="搜索定投名称..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {hasAnyExclusion && (
              <button onClick={clearAllExclusions} className="btn-ghost flex-shrink-0 text-xs">
                重置排除
              </button>
            )}
          </div>

          {searchedAssets.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {search ? '没有匹配的定投' : '该品类暂无定投'}
            </div>
          ) : (
            <div id="dca-asset-list" className="space-y-2">
              {searchedAssets.map((asset) => {
                const isExcluded = excludedIds.has(asset.id);
                const isCategoryHidden = hiddenCategories.has(asset.category);
                const isDimmed = isExcluded || isCategoryHidden;
                const catTotal = chartAssets.reduce((s, a) => s + a.amount, 0);
                const itemRatio = catTotal > 0 ? (asset.amount / catTotal) * 100 : 0;
                return (
                  <div
                    key={asset.id}
                    id={`dca-asset-${asset.id}`}
                    className={`card flex items-center gap-3 px-4 py-3 transition-opacity ${
                      isDimmed ? 'opacity-30' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleExclude(asset.id)}
                      className={`h-3 w-3 flex-shrink-0 rounded-full transition-colors ${
                        isExcluded ? 'border-2 border-gray-300 bg-transparent' : ''
                      }`}
                      style={isExcluded ? {} : { backgroundColor: getColor(asset.category) }}
                      title={isExcluded ? '重新计入统计' : '从统计中排除此项'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`flex items-center gap-1 text-sm font-medium text-gray-900 ${isCategoryHidden && !isExcluded ? 'line-through' : ''}`}>
                        {asset.watchlistId && <Link size={12} className="flex-shrink-0 text-gray-400" />}
                        <span className="truncate">{asset.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {asset.code && <span className="font-mono">{asset.code}</span>}
                        <span>{getLabel(asset.category)} · 月 {formatMoney(asset.amount * 22)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatMoney(asset.amount)}
                        <span className="text-xs font-normal text-gray-400">/日</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {isDimmed ? '已排除' : catTotal > 0 ? formatPercent(itemRatio) : '0%'}
                      </div>
                    </div>
                    <div className="ml-2 flex gap-1">
                      <button
                        onClick={() => openEdit(asset)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(asset.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <WatchlistPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onQuickAdd={handleQuickAdd}
        onManualInput={handleManualInput}
        closeOnOverlay={false}
      />

      <Modal open={formModalOpen} onClose={() => setFormModalOpen(false)} title={editingId ? '编辑定投' : '添加定投'}>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="label">关联自选（选填）</label>
            <select
              className="select"
              value={form.watchlistId}
              onChange={(e) => handleWatchlistSelect(e.target.value)}
            >
              <option value="">不关联</option>
              {watchlist.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.code ? ` (${w.code})` : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">关联后名称/品类/代码与自选条目双向同步</p>
          </div>
          <div className="mt-3">
            <label className="label">品类</label>
            <select
              className="select"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {categories.length === 0 && <option value="">请先添加品类</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3">
            <label className="label">名称</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：沪深300ETF 定投"
              required
            />
          </div>
          <div className="mt-3">
            <label className="label">代码（选填）</label>
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="如 510300, 000001"
            />
          </div>
          <div className="mt-3">
            <label className="label">每日定投金额 (元)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              required
            />
            <p className="mt-1 text-xs text-gray-400">月定投 = 日定投 x 22 个交易日</p>
          </div>
          <button type="submit" className="btn-primary w-full">
            {editingId ? '保存修改' : '添加'}
          </button>
        </form>
      </Modal>

      <Modal open={showPortfolios} onClose={() => setShowPortfolios(false)} title="定投方案">
        <div className="mb-4 space-y-2">
          {dcaPortfolios.map((item) => (
            <div
              key={item.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors ${
                item.id === activeDCAId
                  ? 'border border-primary-200 bg-primary-50'
                  : 'border border-gray-100 bg-gray-50 hover:bg-gray-100'
              }`}
              onClick={() => {
                setActivePortfolio(item.id, 'dca');
                setShowPortfolios(false);
              }}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                <div className="text-xs text-gray-400">
                  {item.assets.length} 个品种 · 日定投 {formatMoney(calcDailyDCATotal(item.assets))}
                </div>
              </div>
              {item.id === activeDCAId && <span className="badge-blue">当前</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const name = prompt('方案名称:');
              if (name?.trim()) createPortfolio(name.trim(), 'dca');
            }}
            className="btn-secondary flex-1"
          >
            <Plus size={16} /> 新建方案
          </button>
          {dcaPortfolios.length > 1 && (
            <button
              onClick={() => {
                if (window.confirm('确定要删除当前方案吗？')) {
                  deleteActivePortfolio('dca');
                  setShowPortfolios(false);
                }
              }}
              className="btn-danger"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </Modal>

      <ReceiptPreviewModal open={receiptOpen} onClose={() => setReceiptOpen(false)} />
      <SnapshotManageModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        snapshots={snapshots}
        removeSnapshot={removeStoredSnapshot}
        restoreSnapshot={restoreSnapshot}
      />
    </div>
  );
}
