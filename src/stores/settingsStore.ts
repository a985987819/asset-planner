// ============================================================
// 用户设置 Store — localStorage 持久化 (v2)
// ============================================================

import { create } from 'zustand';
import type { CategoryDefinition, UserSettings, WatchlistItem } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from '@/types';
import { generateId } from '@/lib/calculations';
import { storageKey } from '@/lib/syncIdentity';
// 注意：循环引用（portfolioStore 也 import 本模块）。只在 action 函数内延迟使用，
// 绝不在模块顶层/初始化时调用，避免 TDZ。
import { usePortfolioStore } from './portfolioStore';

const STORAGE_KEY = 'asset-planner-settings';

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(storageKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      const loadedCats: CategoryDefinition[] = parsed.categories?.length ? parsed.categories : [...DEFAULT_CATEGORIES];
      // 迁移：补齐缺失的内置品类（新增 QDII/股票/低波基金），老数据自动获得
      const builtinIds = new Set(loadedCats.filter((c) => c.isBuiltin).map((c) => c.id));
      const missingBuiltins = DEFAULT_CATEGORIES.filter(
        (c) => c.isBuiltin && !builtinIds.has(c.id)
      );
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        categories: [...loadedCats, ...missingBuiltins],
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
        // 老数据无该字段时回退默认 22
        monthlyTradingDays:
          typeof parsed.monthlyTradingDays === 'number' && parsed.monthlyTradingDays > 0
            ? parsed.monthlyTradingDays
            : DEFAULT_SETTINGS.monthlyTradingDays,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: SettingsStore) {
  try {
    // 只序列化数据字段，不包含 action 函数
    const data: UserSettings = {
      monthlySalary: s.monthlySalary,
      dcaRatioLimit: s.dcaRatioLimit,
      monthlyTradingDays: s.monthlyTradingDays,
      currency: s.currency,
      categories: s.categories,
      watchlist: s.watchlist,
    };
    localStorage.setItem(storageKey(STORAGE_KEY), JSON.stringify(data));
  } catch {
    // ignore
  }
}

interface SettingsStore extends UserSettings {
  setMonthlySalary: (salary: number) => void;
  setDCARatioLimit: (limit: number) => void;
  setMonthlyTradingDays: (days: number) => void;

  // 品类管理
  addCategory: (name: string, color: string) => string;
  updateCategory: (id: string, updates: Partial<Pick<CategoryDefinition, 'name' | 'color'>>) => void;
  deleteCategory: (id: string) => { success: boolean; reason?: string };

  // 自选管理
  addWatchlistItem: (item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  addWatchlistItems: (items: Array<Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  updateWatchlistItem: (id: string, updates: Partial<Pick<WatchlistItem, 'code' | 'name' | 'categoryId' | 'notes'>>) => void;
  deleteWatchlistItem: (id: string) => void;

  // 资产侧改动 → 同步到自选条目（由 portfolioStore 调用）
  propagateAssetChange: (
    watchlistId: string,
    updates: { name?: string; category?: string; code?: string }
  ) => void;

  // 品类引用检查（被 portfolioStore 调用）
  isCategoryInUse: (id: string) => { inAssets: boolean; inWatchlist: boolean };

  reset: () => void;

  // 按当前命名空间重载（身份切换/迁移后用）
  reloadFromStorage: () => void;

  // 本地落盘（供外部应用数据后调用）
  persistLocal: () => void;
}

export const useSettingsStore = create<SettingsStore>((set, get) => {
  const loaded = loadSettings();

  const persist = () => saveSettings(get());

  return {
    ...loaded,

    setMonthlySalary: (salary: number) => {
      set({ monthlySalary: salary });
      persist();
    },

    setDCARatioLimit: (limit: number) => {
      set({ dcaRatioLimit: limit });
      persist();
    },

    setMonthlyTradingDays: (days: number) => {
      set({ monthlyTradingDays: Math.min(31, Math.max(1, Math.round(days) || 22)) });
      persist();
    },

    // ---- 品类管理 ----
    addCategory: (name: string, color: string): string => {
      const existing = get().categories.find(
        (c) => c.name === name.trim()
      );
      if (existing) {
        // 已存在同名品类，返回已有 ID
        return existing.id;
      }

      const newCat: CategoryDefinition = {
        id: generateId(),
        name: name.trim(),
        color,
        isBuiltin: false,
        sortOrder: get().categories.length,
      };

      set((s) => ({ categories: [...s.categories, newCat] }));
      persist();
      return newCat.id;
    },

    updateCategory: (id, updates) => {
      set((s) => ({
        categories: s.categories.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));
      persist();
    },

    deleteCategory: (id) => {
      const cat = get().categories.find((c) => c.id === id);
      if (!cat) return { success: false, reason: '品类不存在' };
      if (cat.isBuiltin) return { success: false, reason: '内置品类不可删除' };

      // 调用引用检查 — 这里只检查 watchlist，assets 由 portfolioStore 提供
      const inUse = get().isCategoryInUse(id);
      if (inUse.inWatchlist) {
        return { success: false, reason: '该品类正在被自选列表使用，请先移除相关自选条目' };
      }
      if (inUse.inAssets) {
        return { success: false, reason: '该品类正在被资产条目使用，无法删除' };
      }

      set((s) => ({
        categories: s.categories.filter((c) => c.id !== id),
      }));
      persist();
      return { success: true };
    },

    // ---- 自选管理 ----
    addWatchlistItem: (item) => {
      const now = new Date().toISOString();
      const newItem: WatchlistItem = {
        id: generateId(),
        ...item,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ watchlist: [newItem, ...s.watchlist] }));
      persist();
      return newItem.id;
    },

    // 批量导入（保持 Excel 顺序，一次落盘 + 同步）
    addWatchlistItems: (items) => {
      if (items.length === 0) return;
      const now = new Date().toISOString();
      const newItems: WatchlistItem[] = items.map((it) => ({
        id: generateId(),
        ...it,
        createdAt: now,
        updatedAt: now,
      }));
      set((s) => ({ watchlist: [...s.watchlist, ...newItems] }));
      persist();
    },

    updateWatchlistItem: (id, updates) => {
      const prev = get().watchlist.find((w) => w.id === id);
      set((s) => ({
        watchlist: s.watchlist.map((w) =>
          w.id === id
            ? { ...w, ...updates, updatedAt: new Date().toISOString() }
            : w
        ),
      }));
      persist();

      // 名称/品类/代码变化 → 同步到所有关联资产
      if (prev) {
        const changed: { name?: string; category?: string; code?: string } = {};
        if (updates.name !== undefined && updates.name !== prev.name) changed.name = updates.name;
        if (updates.categoryId !== undefined && updates.categoryId !== prev.categoryId) changed.category = updates.categoryId;
        if (updates.code !== undefined && (updates.code ?? '') !== (prev.code ?? '')) changed.code = updates.code;
        if (Object.keys(changed).length > 0) {
          usePortfolioStore.getState().propagateWatchlistChange(id, changed);
        }
      }
    },

    deleteWatchlistItem: (id) => {
      set((s) => ({
        watchlist: s.watchlist.filter((w) => w.id !== id),
      }));
      persist();
      // 解除关联资产的链接（保留其名称/品类/代码）
      usePortfolioStore.getState().unlinkWatchlist(id);
    },

    // 资产侧改动 → 更新自选条目，并让所有关联资产收敛到自选最新值
    propagateAssetChange: (watchlistId, updates) => {
      const item = get().watchlist.find((w) => w.id === watchlistId);
      if (!item) return;

      const next: Partial<WatchlistItem> = {};
      if (updates.name !== undefined && updates.name !== item.name) next.name = updates.name;
      if (updates.category !== undefined && updates.category !== item.categoryId) next.categoryId = updates.category;
      if (updates.code !== undefined && (updates.code ?? '') !== (item.code ?? '')) next.code = updates.code;

      if (Object.keys(next).length > 0) {
        set((s) => ({
          watchlist: s.watchlist.map((w) =>
            w.id === watchlistId
              ? { ...w, ...next, updatedAt: new Date().toISOString() }
              : w
          ),
        }));
        persist();
      }

      // 以自选条目为规范源，收敛所有关联资产（含触发改动的那个，值已一致则跳过）
      const canonical = { ...item, ...next };
      usePortfolioStore.getState().propagateWatchlistChange(watchlistId, {
        name: canonical.name,
        category: canonical.categoryId,
        code: canonical.code,
      });
    },

    // ---- 引用检查 ----
    isCategoryInUse: (id: string) => {
      const state = get();
      return {
        inWatchlist: state.watchlist.some((w) => w.categoryId === id),
        // inAssets 需要在 portfolioStore 中检查 — 这里返回 false
        // portfolioStore 调用时会自己检查
        inAssets: false,
      };
    },

    reset: () => {
      set({ ...DEFAULT_SETTINGS });
      try { localStorage.removeItem(storageKey(STORAGE_KEY)); } catch {}
    },

    reloadFromStorage: () => {
      set({ ...loadSettings() });
    },

    persistLocal: persist,
  };
});
