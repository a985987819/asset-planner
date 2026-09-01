// ============================================================
// 资产组合 Store — 底仓 + 定投 + 快照 + 数据同步
// ============================================================

import { create } from 'zustand';
import type { Asset, Portfolio, PortfolioType, Snapshot, SnapshotData, SyncStatus } from '@/types';
import { generateId } from '@/lib/calculations';
import { useSettingsStore } from './settingsStore';

const STORAGE_KEY_PORTFOLIOS = 'asset-planner-portfolios';
const STORAGE_KEY_SNAPSHOTS = 'asset-planner-snapshots';

// ---- localStorage helpers ----
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

// 资产侧名称/品类/代码变化 → 同步到关联自选条目
// 用更新后的 watchlistId（支持改关联/新关联）；值未变或未关联则跳过
function syncAssetToWatchlist(
  prev: Asset | undefined,
  updates: Partial<Pick<Asset, 'category' | 'name' | 'amount' | 'code' | 'watchlistId'>>
) {
  if (updates.name === undefined && updates.category === undefined && updates.code === undefined) return;
  const newWatchlistId = updates.watchlistId !== undefined ? updates.watchlistId : prev?.watchlistId;
  if (!newWatchlistId) return;
  useSettingsStore.getState().propagateAssetChange(newWatchlistId, {
    name: updates.name,
    category: updates.category,
    code: updates.code,
  });
}

// ---- Store ----
interface PortfolioStore {
  // 数据
  basePortfolios: Portfolio[];
  dcaPortfolios: Portfolio[];
  snapshots: Snapshot[];
  syncStatus: SyncStatus;

  // 当前活跃方案（默认取第一个）
  activeBaseId: string | null;
  activeDCAId: string | null;

  // 计算属性 (getter-like)
  getActiveBase: () => Portfolio | null;
  getActiveDCA: () => Portfolio | null;

  // 底仓操作
  addBaseAsset: (category: string, name: string, amount: number, opts?: { watchlistId?: string; code?: string }) => void;
  updateBaseAsset: (assetId: string, updates: Partial<Pick<Asset, 'category' | 'name' | 'amount' | 'code' | 'watchlistId'>>) => void;
  removeBaseAsset: (assetId: string) => void;

  // 定投操作
  addDCAAsset: (category: string, name: string, amount: number, opts?: { watchlistId?: string; code?: string }) => void;
  updateDCAAsset: (assetId: string, updates: Partial<Pick<Asset, 'category' | 'name' | 'amount' | 'code' | 'watchlistId'>>) => void;
  removeDCAAsset: (assetId: string) => void;

  // 自选条目变更 → 同步到所有关联资产（由 settingsStore 调用）
  propagateWatchlistChange: (
    watchlistId: string,
    updates: { name?: string; category?: string; code?: string }
  ) => void;
  // 自选条目被删除 → 解除关联资产的链接
  unlinkWatchlist: (watchlistId: string) => void;
  // 恢复快照/导入后，解除指向不存在自选条目的悬空链接
  reconcileWatchlistLinks: (watchlistIds: string[]) => void;

  // 方案操作
  createPortfolio: (name: string, type: PortfolioType) => string;
  setActivePortfolio: (id: string, type: PortfolioType) => void;
  deleteActivePortfolio: (type: PortfolioType) => void;

  // 快照
  createSnapshot: (label: string) => void;
  createDailySnapshot: () => void;
  removeSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;

  // 同步状态
  setSyncStatus: (status: SyncStatus) => void;

  // 本地落盘（供外部应用数据后调用）
  persistLocal: () => void;

  clearAll: () => void;
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => {
  // 初始化
  const portfolios = loadFromStorage<Portfolio[]>(STORAGE_KEY_PORTFOLIOS, []);
  const basePortfolios = portfolios.filter((p) => p.type === 'base');
  const dcaPortfolios = portfolios.filter((p) => p.type === 'dca');

  // 确保至少有一个默认方案
  if (basePortfolios.length === 0) {
    const defaultBase: Portfolio = {
      id: generateId(),
      userId: null,
      name: '默认底仓',
      type: 'base',
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    basePortfolios.push(defaultBase);
  }

  if (dcaPortfolios.length === 0) {
    const defaultDCA: Portfolio = {
      id: generateId(),
      userId: null,
      name: '默认定投',
      type: 'dca',
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    dcaPortfolios.push(defaultDCA);
  }

  const snapshots = loadFromStorage<Snapshot[]>(STORAGE_KEY_SNAPSHOTS, []);

  // persist helper
  const persist = () => {
    const { basePortfolios: bp, dcaPortfolios: dp, snapshots: ss } = get();
    saveToStorage(STORAGE_KEY_PORTFOLIOS, [...bp, ...dp]);
    saveToStorage(STORAGE_KEY_SNAPSHOTS, ss);
  };

  // update portfolio helper
  const updatePortfolio = (
    type: PortfolioType,
    updater: (p: Portfolio) => Portfolio
  ) => {
    set((state) => {
      const key = type === 'base' ? 'basePortfolios' : 'dcaPortfolios';
      const list = state[key];
      const activeId = type === 'base' ? state.activeBaseId : state.activeDCAId;
      const idx = list.findIndex((p) => p.id === activeId);
      if (idx === -1) return state;

      const updated = [...list];
      updated[idx] = {
        ...updater(list[idx]),
        updatedAt: new Date().toISOString(),
      };

      return { [key]: updated } as any;
    });
    persist();
  };

  // add asset helper
  const addAsset = (
    type: PortfolioType,
    category: string,
    name: string,
    amount: number,
    opts?: { watchlistId?: string; code?: string }
  ) => {
    updatePortfolio(type, (p) => ({
      ...p,
      assets: [
        ...p.assets,
        {
          id: generateId(),
          category,
          name: name.trim() || category,
          amount,
          sortOrder: p.assets.length,
          code: opts?.code,
          watchlistId: opts?.watchlistId,
        },
      ],
    }));
  };

  return {
    basePortfolios,
    dcaPortfolios,
    snapshots,
    syncStatus: 'idle',
    activeBaseId: basePortfolios[0]?.id ?? null,
    activeDCAId: dcaPortfolios[0]?.id ?? null,

    getActiveBase: () => {
      const { basePortfolios: bp, activeBaseId } = get();
      return bp.find((p) => p.id === activeBaseId) ?? null;
    },

    getActiveDCA: () => {
      const { dcaPortfolios: dp, activeDCAId } = get();
      return dp.find((p) => p.id === activeDCAId) ?? null;
    },

    // ---- 底仓资产 CRUD ----
    addBaseAsset: (category, name, amount, opts) =>
      addAsset('base', category, name, amount, opts),

    updateBaseAsset: (assetId, updates) => {
      const prev = get().getActiveBase()?.assets.find((a) => a.id === assetId);
      updatePortfolio('base', (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === assetId ? { ...a, ...updates } : a
        ),
      }));
      syncAssetToWatchlist(prev, updates);
    },

    removeBaseAsset: (assetId) => {
      updatePortfolio('base', (p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
      }));
    },

    // ---- 定投资产 CRUD ----
    addDCAAsset: (category, name, amount, opts) =>
      addAsset('dca', category, name, amount, opts),

    updateDCAAsset: (assetId, updates) => {
      const prev = get().getActiveDCA()?.assets.find((a) => a.id === assetId);
      updatePortfolio('dca', (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === assetId ? { ...a, ...updates } : a
        ),
      }));
      syncAssetToWatchlist(prev, updates);
    },

    removeDCAAsset: (assetId) => {
      updatePortfolio('dca', (p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
      }));
    },

    // ---- 自选-资产联动 ----
    propagateWatchlistChange: (watchlistId, updates) => {
      const mapAssets = (list: Portfolio[]) =>
        list.map((p) => ({
          ...p,
          assets: p.assets.map((a) => {
            if (a.watchlistId !== watchlistId) return a;
            const next = { ...a };
            if (updates.name !== undefined && updates.name !== a.name) next.name = updates.name;
            if (updates.category !== undefined && updates.category !== a.category) next.category = updates.category;
            if (updates.code !== undefined && (updates.code ?? '') !== (a.code ?? '')) next.code = updates.code;
            return next;
          }),
        }));

      set((state) => ({
        basePortfolios: mapAssets(state.basePortfolios),
        dcaPortfolios: mapAssets(state.dcaPortfolios),
      }));
      persist();
    },

    unlinkWatchlist: (watchlistId) => {
      const mapAssets = (list: Portfolio[]) =>
        list.map((p) => ({
          ...p,
          assets: p.assets.map((a) =>
            a.watchlistId === watchlistId ? { ...a, watchlistId: undefined } : a
          ),
        }));

      set((state) => ({
        basePortfolios: mapAssets(state.basePortfolios),
        dcaPortfolios: mapAssets(state.dcaPortfolios),
      }));
      persist();
    },

    reconcileWatchlistLinks: (watchlistIds) => {
      const valid = new Set(watchlistIds);
      const mapAssets = (list: Portfolio[]) =>
        list.map((p) => ({
          ...p,
          assets: p.assets.map((a) =>
            a.watchlistId && !valid.has(a.watchlistId)
              ? { ...a, watchlistId: undefined }
              : a
          ),
        }));

      set((state) => ({
        basePortfolios: mapAssets(state.basePortfolios),
        dcaPortfolios: mapAssets(state.dcaPortfolios),
      }));
      persist();
    },

    // ---- 方案操作 ----
    createPortfolio: (name, type) => {
      const newPortfolio: Portfolio = {
        id: generateId(),
        userId: null,
        name,
        type,
        assets: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set((state) => {
        const key = type === 'base' ? 'basePortfolios' : 'dcaPortfolios';
        return {
          [key]: [...state[key], newPortfolio],
          [type === 'base' ? 'activeBaseId' : 'activeDCAId']: newPortfolio.id,
        } as any;
      });
      persist();
      return newPortfolio.id;
    },

    setActivePortfolio: (id, type) => {
      set(
        type === 'base' ? { activeBaseId: id } : { activeDCAId: id }
      );
    },

    deleteActivePortfolio: (type) => {
      set((state) => {
        const key = type === 'base' ? 'basePortfolios' : 'dcaPortfolios';
        const activeKey =
          type === 'base' ? 'activeBaseId' : 'activeDCAId';
        const list = state[key];
        const activeId = state[activeKey];

        // 至少保留一个
        if (list.length <= 1) return state;

        const filtered = list.filter((p) => p.id !== activeId);

        return {
          [key]: filtered,
          [activeKey]: filtered[0]?.id ?? null,
        } as any;
      });
      persist();
    },

    // ---- 快照 ----
    createSnapshot: (label) => {
      const basePortfolio = get().getActiveBase();
      const dcaPortfolio = get().getActiveDCA();
      const settings = useSettingsStore.getState();

      if (!basePortfolio) return;

      const snapshotData: SnapshotData = {
        basePortfolio,
        dcaPortfolio: dcaPortfolio!,
        settings: {
          monthlySalary: settings.monthlySalary,
          dcaRatioLimit: settings.dcaRatioLimit,
          currency: settings.currency,
          categories: settings.categories,
          watchlist: settings.watchlist,
        },
      };

      const snapshot: Snapshot = {
        id: generateId(),
        userId: null,
        label,
        snapshotData,
        createdAt: new Date().toISOString(),
      };

      set((s) => ({ snapshots: [snapshot, ...s.snapshots] }));
      persist();
    },

    createDailySnapshot: () => {
      const today = new Date().toLocaleDateString('zh-CN');
      const label = `资产记录 ${today}`;
      const existing = get().snapshots.find((snapshot) => snapshot.label === label);

      if (existing) {
        get().removeSnapshot(existing.id);
      }

      get().createSnapshot(label);
    },

    removeSnapshot: (id) => {
      set((s) => ({ snapshots: s.snapshots.filter((sn) => sn.id !== id) }));
      persist();
    },

    restoreSnapshot: (id) => {
      const snapshot = get().snapshots.find((s) => s.id === id);
      if (!snapshot) return;

      const { basePortfolio, dcaPortfolio, settings } = snapshot.snapshotData;

      // 恢复底仓
      set((state) => {
        const newBase = state.basePortfolios.map((p) =>
          p.id === state.activeBaseId
            ? { ...basePortfolio, updatedAt: new Date().toISOString() }
            : p
        );

        const newDCA = state.dcaPortfolios.map((p) =>
          p.id === state.activeDCAId
            ? { ...dcaPortfolio, updatedAt: new Date().toISOString() }
            : p
        );

        return { basePortfolios: newBase, dcaPortfolios: newDCA } as any;
      });

      // 恢复设置
      useSettingsStore.getState().setMonthlySalary(settings.monthlySalary);
      useSettingsStore.getState().setDCARatioLimit(settings.dcaRatioLimit);
      // 恢复品类和自选
      if (settings.categories) {
        useSettingsStore.setState({ categories: settings.categories });
      }
      if (settings.watchlist) {
        useSettingsStore.setState({ watchlist: settings.watchlist });
      }
      // 恢复的自选要落盘（修复既有 bug），并解除指向不存在自选条目的悬空链接
      useSettingsStore.getState().persistLocal();
      get().reconcileWatchlistLinks(settings.watchlist?.map((w) => w.id) ?? []);

      persist();
    },

    setSyncStatus: (status) => set({ syncStatus: status }),

    persistLocal: persist,

    clearAll: () => {
      const defaultBase: Portfolio = {
        id: generateId(),
        userId: null,
        name: '默认底仓',
        type: 'base',
        assets: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const defaultDCA: Portfolio = {
        id: generateId(),
        userId: null,
        name: '默认定投',
        type: 'dca',
        assets: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set({
        basePortfolios: [defaultBase],
        dcaPortfolios: [defaultDCA],
        snapshots: [],
        activeBaseId: defaultBase.id,
        activeDCAId: defaultDCA.id,
      });

      localStorage.removeItem(STORAGE_KEY_PORTFOLIOS);
      localStorage.removeItem(STORAGE_KEY_SNAPSHOTS);
    },
  };
});
