import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCategories } from '@/hooks/useCategories';
import type { WatchlistItem } from '@/types';
import { Modal } from '@/components/ui/Modal';

interface WatchlistPickerModalProps {
  open: boolean;
  onClose: () => void;
  onQuickAdd: (item: WatchlistItem, amount: number) => void;
  onManualInput: () => void;
  title?: string;
}

export function WatchlistPickerModal({
  open,
  onClose,
  onQuickAdd,
  onManualInput,
  title = '选择自选',
}: WatchlistPickerModalProps) {
  const watchlist = useSettingsStore((state) => state.watchlist);
  const { categories, getLabel, getColor } = useCategories();

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');
  const [search, setSearch] = useState('');

  const categoryTabs = useMemo(() => {
    const usedCategoryIds = new Set(watchlist.map((item) => item.categoryId));

    return [
      { id: 'all', label: '全部', count: watchlist.length },
      ...categories
        .filter((category) => usedCategoryIds.has(category.id))
        .map((category) => ({
          id: category.id,
          label: category.name,
          count: watchlist.filter((item) => item.categoryId === category.id).length,
        })),
    ];
  }, [categories, watchlist]);

  const filteredWatchlist = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return watchlist.filter((item) => {
      const matchesCategory = activeCategory === 'all' || item.categoryId === activeCategory;
      const matchesKeyword =
        keyword.length === 0 ||
        item.name.toLowerCase().includes(keyword) ||
        item.code.toLowerCase().includes(keyword) ||
        item.notes.toLowerCase().includes(keyword);

      return matchesCategory && matchesKeyword;
    });
  }, [activeCategory, search, watchlist]);

  const handleQuickAdd = (item: WatchlistItem) => {
    const raw = amounts[item.id];
    const amount = parseFloat(raw);

    if (!raw || Number.isNaN(amount) || amount <= 0) {
      setValidating((prev) => ({ ...prev, [item.id]: true }));
      return;
    }

    onQuickAdd(item, amount);
    setAmounts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-lg">
      {watchlist.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-400">
          暂无自选条目，请先在「自选管理」页面添加。
        </div>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto">
            <div className="inline-flex min-w-max items-center gap-1 rounded-xl bg-gray-100 p-1">
              {categoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCategory(tab.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    activeCategory === tab.id
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                  <span className="ml-1 text-[10px] opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索代码、名称或备注..."
            />
          </div>

          {filteredWatchlist.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              没有匹配当前分类或关键词的自选条目。
            </div>
          ) : (
            <div className="-mx-1 max-h-[60vh] space-y-2 overflow-y-auto">
              {filteredWatchlist.map((item) => {
                const hasError =
                  validating[item.id] && (!amounts[item.id] || parseFloat(amounts[item.id]) <= 0);

                return (
                  <div
                    key={item.id}
                    className="rounded-lg bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: getColor(item.categoryId) }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-gray-900">{item.name}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          {item.code && <span className="font-mono text-xs text-gray-400">{item.code}</span>}
                          <span
                            className="rounded-full px-1.5 py-0.5 text-xs"
                            style={{
                              backgroundColor: `${getColor(item.categoryId)}20`,
                              color: getColor(item.categoryId),
                            }}
                          >
                            {getLabel(item.categoryId)}
                          </span>
                        </div>
                        {item.notes && <div className="mt-1 truncate text-xs text-gray-400">{item.notes}</div>}
                      </div>
                    </div>

                    <div className="mt-3 flex items-start gap-2">
                      <div className="flex-1">
                        <input
                          className={`input w-full text-right ${
                            hasError ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : ''
                          }`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={amounts[item.id] ?? ''}
                          onChange={(event) => {
                            setAmounts({ ...amounts, [item.id]: event.target.value });
                            setValidating({ ...validating, [item.id]: false });
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') handleQuickAdd(item);
                          }}
                          placeholder="输入金额"
                        />
                        {hasError && <div className="mt-1 text-xs text-red-500">请输入大于 0 的金额</div>}
                      </div>
                      <button onClick={() => handleQuickAdd(item)} className="btn-primary px-3 py-1.5 text-xs">
                        添加
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <button
        onClick={() => {
          onManualInput();
          onClose();
        }}
        className="mt-4 w-full border-t border-gray-100 py-2 pt-3 text-sm text-gray-400 hover:text-gray-600"
      >
        手动输入（含品类选择）
      </button>
    </Modal>
  );
}
