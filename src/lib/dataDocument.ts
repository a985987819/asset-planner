// ============================================================
// 数据文档 — 导出/导入/云同步共用的统一格式
// ============================================================

import type { Portfolio, Snapshot, UserSettings } from '@/types';
import { DEFAULT_SETTINGS } from '@/types';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { mergeDuplicateCategories } from '@/lib/categoryMerge';

export interface CloudDocument {
  version: number;
  exportedAt: string;
  portfolios: Portfolio[];
  snapshots: Snapshot[];
  settings: UserSettings;
}

// 全新设备 / 全新用户的判空（云端播种/迁移守卫共用）
export function isPristine(doc: CloudDocument | null | undefined): boolean {
  if (!doc) return true;
  const s = doc.settings || ({} as CloudDocument['settings']);
  return (
    doc.portfolios.every((p) => p.assets.length === 0) &&
    doc.snapshots.length === 0 &&
    (s.watchlist || []).length === 0 &&
    (s.categories || []).every((c) => c.isBuiltin) &&
    !s.monthlySalary &&
    s.dcaRatioLimit === DEFAULT_SETTINGS.dcaRatioLimit &&
    (s.monthlyTradingDays ?? DEFAULT_SETTINGS.monthlyTradingDays) ===
      DEFAULT_SETTINGS.monthlyTradingDays &&
    s.currency === DEFAULT_SETTINGS.currency
  );
}

// 汇总当前全部状态为一个文档
export function buildDocument(): CloudDocument {
  const p = usePortfolioStore.getState();
  const s = useSettingsStore.getState();

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    portfolios: [...p.basePortfolios, ...p.dcaPortfolios],
    snapshots: p.snapshots,
    settings: {
      monthlySalary: s.monthlySalary,
      dcaRatioLimit: s.dcaRatioLimit,
      monthlyTradingDays: s.monthlyTradingDays,
      currency: s.currency,
      categories: s.categories,
      watchlist: s.watchlist,
    },
  };
}

// 文档内容指纹（不含 exportedAt，仅比较语义数据）
export function documentFingerprint(doc: CloudDocument): string {
  return JSON.stringify({
    portfolios: doc.portfolios,
    snapshots: doc.snapshots,
    settings: doc.settings,
  });
}

// 把一篇文档应用到当前状态并落盘
export function applyDocument(doc: CloudDocument): boolean {
  if (!doc || !Array.isArray(doc.portfolios)) return false;

  const portfolioStore = usePortfolioStore.getState();
  const settingsStore = useSettingsStore.getState();

  const base = doc.portfolios.filter((p) => p.type === 'base');
  const dca = doc.portfolios.filter((p) => p.type === 'dca');

  usePortfolioStore.setState({
    basePortfolios: base.length > 0 ? base : portfolioStore.basePortfolios,
    dcaPortfolios: dca.length > 0 ? dca : portfolioStore.dcaPortfolios,
    snapshots: Array.isArray(doc.snapshots) ? doc.snapshots : portfolioStore.snapshots,
    activeBaseId: base[0]?.id ?? portfolioStore.activeBaseId,
    activeDCAId: dca[0]?.id ?? portfolioStore.activeDCAId,
  });

  if (doc.settings) {
    const s = doc.settings;
    useSettingsStore.setState({
      monthlySalary: s.monthlySalary ?? settingsStore.monthlySalary,
      dcaRatioLimit: s.dcaRatioLimit ?? settingsStore.dcaRatioLimit,
      monthlyTradingDays: s.monthlyTradingDays ?? settingsStore.monthlyTradingDays,
      currency: s.currency ?? settingsStore.currency,
      categories: Array.isArray(s.categories) && s.categories.length > 0
        ? s.categories
        : settingsStore.categories,
      watchlist: Array.isArray(s.watchlist) ? s.watchlist : settingsStore.watchlist,
    });
    // 解除指向不存在自选条目的悬空链接
    usePortfolioStore.getState().reconcileWatchlistLinks(
      Array.isArray(s.watchlist) ? s.watchlist.map((w) => w.id) : []
    );
  }

  usePortfolioStore.getState().persistLocal();
  useSettingsStore.getState().persistLocal();

  // 归并自建品类与内置品类同名的脏数据（幂等）
  mergeDuplicateCategories();

  return true;
}

// 从 JSON 字符串导入（与导出/云端同一格式）
export function importDocument(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (!data.portfolios || !Array.isArray(data.portfolios)) return false;
    return applyDocument(data as CloudDocument);
  } catch {
    return false;
  }
}

/** 解析并校验导入 JSON（不应用到状态），供导入预览使用；格式不合法返回 null */
export function parseDocument(json: string): CloudDocument | null {
  try {
    const data = JSON.parse(json);
    if (!data || !Array.isArray(data.portfolios)) return null;
    if (!Array.isArray(data.snapshots)) data.snapshots = [];
    return data as CloudDocument;
  } catch {
    return null;
  }
}
