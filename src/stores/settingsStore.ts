// ============================================================
// 用户设置 Store — localStorage 持久化 (v2)
// ============================================================

import { create } from 'zustand';
import type { CategoryDefinition, UserSettings, WatchlistItem } from '@/types';
import { DEFAULT_SETTINGS, DEFAULT_CATEGORIES } from '@/types';
import { generateId } from '@/lib/calculations';

const STORAGE_KEY = 'asset-planner-settings';

function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 兼容 v1 数据：无 categories/watchlist 时种子默认值
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        categories: parsed.categories?.length ? parsed.categories : [...DEFAULT_CATEGORIES],
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
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
      currency: s.currency,
      categories: s.categories,
      watchlist: s.watchlist,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

interface SettingsStore extends UserSettings {
  setMonthlySalary: (salary: number) => void;
  setDCARatioLimit: (limit: number) => void;

  // 品类管理
  addCategory: (name: string, color: string) => string;
  updateCategory: (id: string, updates: Partial<Pick<CategoryDefinition, 'name' | 'color'>>) => void;
  deleteCategory: (id: string) => { success: boolean; reason?: string };

  // 自选管理
  addWatchlistItem: (item: Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  addWatchlistItems: (items: Array<Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>>) => void;
  updateWatchlistItem: (id: string, updates: Partial<Pick<WatchlistItem, 'code' | 'name' | 'categoryId' | 'notes'>>) => void;
  deleteWatchlistItem: (id: string) => void;

  // 品类引用检查（被 portfolioStore 调用）
  isCategoryInUse: (id: string) => { inAssets: boolean; inWatchlist: boolean };

  reset: () => void;

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
      set((s) => ({
        watchlist: s.watchlist.map((w) =>
          w.id === id
            ? { ...w, ...updates, updatedAt: new Date().toISOString() }
            : w
        ),
      }));
      persist();
    },

    deleteWatchlistItem: (id) => {
      set((s) => ({
        watchlist: s.watchlist.filter((w) => w.id !== id),
      }));
      persist();
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
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    },

    persistLocal: persist,
  };
});
