// ============================================================
// 资产配置 & 定投规划工具 — TypeScript 类型定义 (v2)
// ============================================================

// ---- 品类定义（动态，替代硬编码 union type） ----
export interface CategoryDefinition {
  id: string;           // 内置用 "bond"/"gold" 等，自定义用 UUID
  name: string;         // "债券"、"股票" 等
  color: string;        // "#3b82f6"
  isBuiltin: boolean;
  sortOrder: number;
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { id: 'bond',   name: '债券',     color: '#3b82f6', isBuiltin: true, sortOrder: 0 },
  { id: 'gold',   name: '黄金',     color: '#f59e0b', isBuiltin: true, sortOrder: 1 },
  { id: 'broad',  name: '股市宽基', color: '#22c55e', isBuiltin: true, sortOrder: 2 },
  { id: 'theme',  name: '主题基金', color: '#8b5cf6', isBuiltin: true, sortOrder: 3 },
  { id: 'money',  name: '货币',     color: '#6b7280', isBuiltin: true, sortOrder: 4 },
  { id: 'qdii',   name: 'QDII',     color: '#06b6d4', isBuiltin: true, sortOrder: 5 },
  { id: 'stock',  name: '股票',     color: '#ef4444', isBuiltin: true, sortOrder: 6 },
  { id: 'lowvol', name: '低波基金', color: '#84cc16', isBuiltin: true, sortOrder: 7 },
];

export const CATEGORY_PRESET_COLORS = [
  '#3b82f6', '#f59e0b', '#22c55e', '#8b5cf6', '#6b7280',
  '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316',
];

// 向后兼容：保留旧常量（Deprecated，新代码不要用）
// @deprecated 使用 useCategories() hook
export type AssetCategory = 'bond' | 'gold' | 'broad' | 'theme' | 'money';
// @deprecated 使用 useCategories().labels
export const CATEGORY_LABELS: Record<string, string> = {
  bond: '债券', gold: '黄金', broad: '股市宽基', theme: '主题基金', money: '货币',
  qdii: 'QDII', stock: '股票', lowvol: '低波基金',
};
// @deprecated 使用 useCategories().colors
export const CATEGORY_COLORS: Record<string, string> = {
  bond: '#3b82f6', gold: '#f59e0b', broad: '#22c55e', theme: '#8b5cf6', money: '#6b7280',
  qdii: '#06b6d4', stock: '#ef4444', lowvol: '#84cc16',
};

// ---- 自选条目 ----
export interface WatchlistItem {
  id: string;
  code: string;         // 基金代码/股票代码
  name: string;
  categoryId: string;   // 关联 CategoryDefinition.id
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ---- 资产条目 ----
export interface Asset {
  id: string;
  category: string;     // 现在存 category ID（如 "bond" 或 UUID）
  name: string;
  amount: number;       // 底仓=总金额, 定投=日定投额
  sortOrder: number;
  code?: string;        // 关联自选的代码（可选）
  watchlistId?: string; // 关联的自选条目 ID（可选，双向同步）
}

// ---- 资产组合 ----
export type PortfolioType = 'base' | 'dca';

export interface Portfolio {
  id: string;
  userId: string | null;
  name: string;
  type: PortfolioType;
  assets: Asset[];
  createdAt: string;
  updatedAt: string;
}

// ---- 快照 ----
export interface Snapshot {
  id: string;
  userId: string | null;
  label: string;
  snapshotData: SnapshotData;
  createdAt: string;
}

export interface SnapshotData {
  basePortfolio: Portfolio;
  dcaPortfolio: Portfolio;
  settings: UserSettings;
  receiptImage?: string;  // base64 PNG，小票图片（v3 新增）
}

// 快照对比项（多快照版：amounts/ratios 与传入 snapshots 数组顺序一一对应）
export interface SnapshotCompareRow {
  categoryId: string;
  categoryName: string;
  amounts: number[];
  ratios: number[];
  changeAmount: number; // 末项 - 首项
  changeRatio: number;  // 末项 - 首项（比例变化百分点）
  trend: 'up' | 'down' | 'flat';
}

// ---- 用户设置 ----
export interface UserSettings {
  monthlySalary: number;
  dcaRatioLimit: number;
  currency: string;
  categories: CategoryDefinition[];
  watchlist: WatchlistItem[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  monthlySalary: 0,
  dcaRatioLimit: 30,
  currency: '¥',
  categories: [...DEFAULT_CATEGORIES],
  watchlist: [],
};

// ---- 同步状态 ----
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
