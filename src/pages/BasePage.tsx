import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Plus, Pencil, Trash2, FolderOpen, Camera, Search, X, RotateCcw } from 'lucide-react';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { calcBaseTotal, formatMoney, formatPercent } from '@/lib/calculations';
import { useCategories } from '@/hooks/useCategories';
import type { WatchlistItem, Snapshot } from '@/types';
import { PageHeader, EmptyState } from '@/components/ui/Common';
import { Modal } from '@/components/ui/Modal';
import { CustomPieTooltip } from '@/components/charts/CustomPieTooltip';
import { WatchlistPickerModal } from '@/components/watchlist/WatchlistPickerModal';
import { ReceiptPreviewModal } from '@/components/snapshot/ReceiptPreviewModal';
import { SnapshotManageModal } from '@/components/snapshot/SnapshotManageModal';

interface AssetFormData {
  category: string;
  name: string;
  amount: string;
}

const emptyForm: AssetFormData = { category: '', name: '', amount: '' };

function getSnapshotBaseTotal(snapshot: Snapshot) {
  return calcBaseTotal(snapshot.snapshotData.basePortfolio.assets ?? []);
}

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

export default function BasePage() {
  const {
    getActiveBase,
    addBaseAsset,
    updateBaseAsset,
    removeBaseAsset,
    basePortfolios,
    activeBaseId,
    createPortfolio,
    setActivePortfolio,
    deleteActivePortfolio,
    snapshots,
    createDailySnapshot,
    removeSnapshot: removeStoredSnapshot,
    restoreSnapshot,
  } = usePortfolioStore();

  const { categories, getLabel, getColor } = useCategories();

  const portfolio = getActiveBase();
  const assets = portfolio?.assets ?? [];
  const total = useMemo(() => calcBaseTotal(assets), [assets]);

  // 品类 Tab 状态
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // 搜索状态
  const [search, setSearch] = useState('');
  // 通过右侧图例隐藏的品类（点击图例切换；隐藏后该品类不参与统计）
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(new Set());
  // 通过明细列表排除的单项（点击明细切换；排除后仍留在列表中，可再点击恢复）
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // 计算品类 Tab 列表（只包含实际使用到的品类）
  const categoryTabs = useMemo(() => {
    const usedIds = new Set(assets.map((a) => a.category));
    return [
      { id: 'all', label: '全部', color: '' },
      ...categories
        .filter((c) => usedIds.has(c.id))
        .map((c) => ({ id: c.id, label: c.name, color: c.color })),
    ];
  }, [assets, categories]);

  // 当前选中 tab 下的资产（品类过滤 + 搜索过滤）
  const categoryAssets = useMemo(
    () => (activeCategory === 'all' ? assets : assets.filter((a) => a.category === activeCategory)),
    [assets, activeCategory]
  );

  const searchedAssets = useMemo(
    () =>
      search.trim()
        ? categoryAssets.filter((a) => a.name.toLowerCase().includes(search.toLowerCase().trim()))
        : categoryAssets,
    [categoryAssets, search]
  );

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

  const latestSnapshot = snapshots[0] ?? null;
  const latestSnapshotTotal = latestSnapshot ? getSnapshotBaseTotal(latestSnapshot) : 0;
  const totalChange = total - latestSnapshotTotal;

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
    setForm({ category: asset.category, name: asset.name, amount: String(asset.amount) });
    setFormModalOpen(true);
  };

  const handleQuickAdd = (item: WatchlistItem, amount: number) => {
    addBaseAsset(item.categoryId, item.name, amount);
    setPickerOpen(false);
  };

  const handleManualInput = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category: firstCategoryId });
    setFormModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.name.trim() || Number.isNaN(amount) || amount <= 0) return;

    if (editingId) {
      updateBaseAsset(editingId, { category: form.category, name: form.name.trim(), amount });
    } else {
      addBaseAsset(form.category, form.name.trim(), amount);
    }
    setFormModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要删除这条资产吗？')) {
      removeBaseAsset(id);
      // 如果被排除列表中包含这条，也清理掉
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
    <div className="pb-20" id="base-page">
      <PageHeader
        title="底仓管理"
        subtitle={portfolio ? `${portfolio.name} · ${formatMoney(total)}` : ''}
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
            <button
              onClick={() => setShowPortfolios(true)}
              className="btn-ghost text-xs"
              title="切换方案"
            >
              <FolderOpen size={16} />
            </button>
            <button onClick={openAdd} className="btn-primary text-sm">
              <Plus size={16} /> 添加
            </button>
          </div>
        }
      />

      {latestSnapshot && (
        <div className="card mb-4" id="base-latest-snapshot">
          <div className="text-sm font-medium text-gray-900">
            上次记录：{new Date(latestSnapshot.createdAt).toLocaleDateString('zh-CN')} · 总资产 {formatMoney(latestSnapshotTotal)}
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {totalChange === 0 ? (
              '当前数据与上次记录一致'
            ) : (
              <span className={totalChange > 0 ? 'text-green-600' : 'text-red-600'}>
                较上次 {totalChange > 0 ? '+' : ''}
                {formatMoney(totalChange)}
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
        <div className="card mb-4" id="base-first-snapshot">
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
        <div className="card mb-4" id="base-chart-card">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-700">品种占比</h3>
            <span className="ml-auto text-xs text-gray-400">
              统计总额 {formatMoney(visibleTotal)}
              {hasAnyExclusion && (
                <span className="ml-1">
                  （已排除 {hiddenCategories.size} 品类 / {excludedIds.size} 单项）
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div id="base-pie" className="h-44 w-44 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ratios}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="ratio"
                    nameKey="category"
                  >
                    {ratios.map((entry) => (
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
            <div id="base-legend" className="w-full flex-1 space-y-2">
              {ratiosAll.map((item) => {
                const isHidden = hiddenCategories.has(item.category);
                return (
                  <button
                    key={item.category}
                    id={`base-legend-${item.category}`}
                    onClick={() => toggleInSet(item.category, hiddenCategories, setHiddenCategories)}
                    className={`flex w-full items-center gap-2 text-sm transition-opacity ${
                      isHidden ? 'opacity-30 line-through' : 'hover:bg-gray-50'
                    }`}
                    title={isHidden ? '点击恢复该项统计' : '点击取消该项统计'}
                  >
                    <div
                      className="h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: getColor(item.category) }}
                    />
                    <span className="text-gray-600">{getLabel(item.category)}</span>
                    <span className="ml-auto font-medium text-gray-900">{formatPercent(item.ratio)}</span>
                    <span className="text-xs text-gray-400">{formatMoney(item.amount)}</span>
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
        </div>
      )}

      {assets.length === 0 ? (
        <EmptyState
          title="还没有底仓资产"
          description="添加债券、黄金、股票宽基、主题基金、货币等品种"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus size={16} /> 添加底仓
            </button>
          }
        />
      ) : (
        <>
          {/* 品类 Tab 筛选 */}
          <div id="base-category-tabs" className="mb-3 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
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
          <div id="base-search-bar" className="mb-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8 pr-8 text-sm"
                placeholder="搜索资产名称..."
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
              {search ? '没有匹配的资产' : '该品类暂无资产'}
            </div>
          ) : (
            <div id="base-asset-list" className="space-y-2">
              {searchedAssets.map((asset) => {
                const isExcluded = excludedIds.has(asset.id);
                const isCategoryHidden = hiddenCategories.has(asset.category);
                const isDimmed = isExcluded || isCategoryHidden;
                // 该项占当前可见资产合计的比例（用于右侧百分比展示）
                const catTotal = chartAssets.reduce((s, a) => s + a.amount, 0);
                const itemRatio = catTotal > 0 ? (asset.amount / catTotal) * 100 : 0;
                return (
                  <div
                    key={asset.id}
                    id={`base-asset-${asset.id}`}
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
                      <div className={`truncate text-sm font-medium text-gray-900 ${isCategoryHidden && !isExcluded ? 'line-through' : ''}`}>
                        {asset.name}
                      </div>
                      <div className="text-xs text-gray-400">{getLabel(asset.category)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">{formatMoney(asset.amount)}</div>
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
      />

      <Modal open={formModalOpen} onClose={() => setFormModalOpen(false)} title={editingId ? '编辑资产' : '添加资产'}>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
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
              placeholder="如：沪深300ETF、黄金ETF"
              required
            />
          </div>
          <div className="mt-3">
            <label className="label">金额 (元)</label>
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
          </div>
          <button type="submit" className="btn-primary w-full">
            {editingId ? '保存修改' : '添加'}
          </button>
        </form>
      </Modal>

      <Modal open={showPortfolios} onClose={() => setShowPortfolios(false)} title="底仓方案">
        <div className="mb-4 space-y-2">
          {basePortfolios.map((item) => (
            <div
              key={item.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors ${
                item.id === activeBaseId
                  ? 'border border-primary-200 bg-primary-50'
                  : 'border border-gray-100 bg-gray-50 hover:bg-gray-100'
              }`}
              onClick={() => {
                setActivePortfolio(item.id, 'base');
                setShowPortfolios(false);
              }}
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                <div className="text-xs text-gray-400">
                  {item.assets.length} 个品种 · {formatMoney(calcBaseTotal(item.assets))}
                </div>
              </div>
              {item.id === activeBaseId && <span className="badge-blue">当前</span>}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const name = prompt('方案名称:');
              if (name?.trim()) createPortfolio(name.trim(), 'base');
            }}
            className="btn-secondary flex-1"
          >
            <Plus size={16} /> 新建方案
          </button>
          {basePortfolios.length > 1 && (
            <button
              onClick={() => {
                if (window.confirm('确定要删除当前方案吗？')) {
                  deleteActivePortfolio('base');
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
