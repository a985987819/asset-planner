// ============================================================
// 资产组合 Store — 底仓 + 定投 + 快照 + 数据同步
// ============================================================

import { create } from 'zustand';
import type { Asset, Portfolio, PortfolioType, Snapshot, SnapshotData, SyncStatus } from '@/types';
import { generateId } from '@/lib/calculations';
import {
  fetchPortfolios,
  upsertPortfolio,
  deletePortfolio,
  fetchSnapshots,
  saveSnapshot,
  deleteSnapshot,
  isSupabaseConfigured,
} from '@/lib/supabase';
import { useAuthStore } from './authStore';
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
  addBaseAsset: (category: string, name: string, amount: number) => void;
  updateBaseAsset: (assetId: string, updates: Partial<Pick<Asset, 'category' | 'name' | 'amount'>>) => void;
  removeBaseAsset: (assetId: string) => void;

  // 定投操作
  addDCAAsset: (category: string, name: string, amount: number) => void;
  updateDCAAsset: (assetId: string, updates: Partial<Pick<Asset, 'category' | 'name' | 'amount'>>) => void;
  removeDCAAsset: (assetId: string) => void;

  // 方案操作
  createPortfolio: (name: string, type: PortfolioType) => string;
  setActivePortfolio: (id: string, type: PortfolioType) => void;
  deleteActivePortfolio: (type: PortfolioType) => void;

  // 快照
  createSnapshot: (label: string) => void;
  createDailySnapshot: () => void;
  removeSnapshot: (id: string) => void;
  restoreSnapshot: (id: string) => void;

  // 同步
  syncFromCloud: () => Promise<void>;
  syncToCloud: () => Promise<void>;
  setSyncStatus: (status: SyncStatus) => void;

  // 导入导出
  exportAllData: () => string;
  importAllData: (json: string) => boolean;
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
    amount: number
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
    addBaseAsset: (category, name, amount) =>
      addAsset('base', category, name, amount),

    updateBaseAsset: (assetId, updates) => {
      updatePortfolio('base', (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === assetId ? { ...a, ...updates } : a
        ),
      }));
    },

    removeBaseAsset: (assetId) => {
      updatePortfolio('base', (p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
      }));
    },

    // ---- 定投资产 CRUD ----
    addDCAAsset: (category, name, amount) =>
      addAsset('dca', category, name, amount),

    updateDCAAsset: (assetId, updates) => {
      updatePortfolio('dca', (p) => ({
        ...p,
        assets: p.assets.map((a) =>
          a.id === assetId ? { ...a, ...updates } : a
        ),
      }));
    },

    removeDCAAsset: (assetId) => {
      updatePortfolio('dca', (p) => ({
        ...p,
        assets: p.assets.filter((a) => a.id !== assetId),
      }));
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

      const userId = useAuthStore.getState().user?.id ?? null;

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
        userId,
        label,
        snapshotData,
        createdAt: new Date().toISOString(),
      };

      set((s) => ({ snapshots: [snapshot, ...s.snapshots] }));
      persist();

      // 同步到 Supabase
      if (isSupabaseConfigured() && userId) {
        saveSnapshot(snapshot).catch(() => {});
      }
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
      if (isSupabaseConfigured()) {
        deleteSnapshot(id).catch(() => {});
      }
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
        useSettingsStore.getState(); // trigger re-render
      }
      if (settings.watchlist) {
        useSettingsStore.setState({ watchlist: settings.watchlist });
        useSettingsStore.getState();
      }

      persist();
    },

    // ---- 同步 ----
    syncFromCloud: async () => {
      const userId = useAuthStore.getState().user?.id;
      if (!userId || !isSupabaseConfigured()) return;

      set({ syncStatus: 'syncing' });
      try {
        const cloudPortfolios = await fetchPortfolios(userId);
        const cloudSnapshots = await fetchSnapshots(userId);

        if (cloudPortfolios.length > 0) {
          const base = cloudPortfolios.filter((p) => p.type === 'base');
          const dca = cloudPortfolios.filter((p) => p.type === 'dca');

          set({
            basePortfolios: base.length > 0 ? base : get().basePortfolios,
            dcaPortfolios: dca.length > 0 ? dca : get().dcaPortfolios,
            snapshots: cloudSnapshots.length > 0 ? cloudSnapshots : get().snapshots,
            syncStatus: 'synced',
          });
          persist();
        } else {
          // 云端无数据，把本地数据推到云端
          await get().syncToCloud();
          set({ syncStatus: 'synced' });
        }
      } catch (err) {
        console.error('Sync from cloud failed:', err);
        set({ syncStatus: 'error' });
      }
    },

    syncToCloud: async () => {
      const userId = useAuthStore.getState().user?.id;
      if (!userId || !isSupabaseConfigured()) return;

      set({ syncStatus: 'syncing' });
      try {
        const allPortfolios = [...get().basePortfolios, ...get().dcaPortfolios];
        for (const p of allPortfolios) {
          await upsertPortfolio({ ...p, userId });
        }

        for (const s of get().snapshots) {
          await saveSnapshot({ ...s, userId });
        }

        set({ syncStatus: 'synced' });
      } catch (err) {
        console.error('Sync to cloud failed:', err);
        set({ syncStatus: 'error' });
      }
    },

    setSyncStatus: (status) => set({ syncStatus: status }),

    // ---- 导入导出 ----
    exportAllData: () => {
      const settings = useSettingsStore.getState();
      const data = {
        version: 2,
        exportedAt: new Date().toISOString(),
        portfolios: [...get().basePortfolios, ...get().dcaPortfolios],
        snapshots: get().snapshots,
        settings: {
          monthlySalary: settings.monthlySalary,
          dcaRatioLimit: settings.dcaRatioLimit,
          currency: settings.currency,
          categories: settings.categories,
          watchlist: settings.watchlist,
        },
      };
      return JSON.stringify(data, null, 2);
    },

    importAllData: (json: string) => {
      try {
        const data = JSON.parse(json);
        if (!data.portfolios || !Array.isArray(data.portfolios)) {
          return false;
        }

        const base = data.portfolios.filter((p: Portfolio) => p.type === 'base');
        const dca = data.portfolios.filter((p: Portfolio) => p.type === 'dca');

        set({
          basePortfolios: base.length > 0 ? base : get().basePortfolios,
          dcaPortfolios: dca.length > 0 ? dca : get().dcaPortfolios,
          snapshots: data.snapshots || [],
          activeBaseId: base[0]?.id ?? get().activeBaseId,
          activeDCAId: dca[0]?.id ?? get().activeDCAId,
        });

        if (data.settings) {
          const s = useSettingsStore.getState();
          if (data.settings.monthlySalary !== undefined)
            s.setMonthlySalary(data.settings.monthlySalary);
          if (data.settings.dcaRatioLimit !== undefined)
            s.setDCARatioLimit(data.settings.dcaRatioLimit);
          // v2: 恢复 categories 和 watchlist
          if (data.version >= 2 || data.settings.categories) {
            useSettingsStore.setState({
              categories: data.settings.categories?.length
                ? data.settings.categories
                : useSettingsStore.getState().categories,
              watchlist: data.settings.watchlist ?? useSettingsStore.getState().watchlist,
            });
          }
        }

        persist();
        return true;
      } catch {
        return false;
      }
    },

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
