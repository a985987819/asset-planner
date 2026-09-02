// ============================================================
// 一次性数据迁移 — 旧全局 localStorage → 当前身份命名空间
// 无 PIN 状态保持干净默认；个人数据只在输入对应 PIN 后出现
// ============================================================

import { fetchCloudDocument } from '@/lib/supabase';
import { isPristine, type CloudDocument } from '@/lib/dataDocument';
import { hasIdentity, storageKey } from '@/lib/syncIdentity';
import { DEFAULT_SETTINGS } from '@/types';
import { mergeDuplicateCategories } from '@/lib/categoryMerge';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';

const BASE_PORTFOLIOS = 'asset-planner-portfolios';
const BASE_SNAPSHOTS = 'asset-planner-snapshots';
const BASE_SETTINGS = 'asset-planner-settings';
const BACKUP_PORTFOLIOS = `${BASE_PORTFOLIOS}:backup`;
const BACKUP_SNAPSHOTS = `${BASE_SNAPSHOTS}:backup`;
const BACKUP_SETTINGS = `${BASE_SETTINGS}:backup`;
// 一次性消费标记：迁移后置位，避免第二个身份误领本属于第一个身份的旧数据
const MIGRATION_MARKER = 'asset-planner-migration-v1';

interface LegacyRaw {
  portfolios: string | null;
  snapshots: string | null;
  settings: string | null;
}

function readLegacyRaw(): LegacyRaw {
  return {
    portfolios: localStorage.getItem(BASE_PORTFOLIOS),
    snapshots: localStorage.getItem(BASE_SNAPSHOTS),
    settings: localStorage.getItem(BASE_SETTINGS),
  };
}

// 旧数据是否有真实内容（空/默认视为无，无需迁移）
function legacyHasRealData(raw: LegacyRaw): boolean {
  let portfolios: unknown = [];
  let snapshots: unknown = [];
  let settings: unknown = {};
  try {
    portfolios = JSON.parse(raw.portfolios ?? '[]');
  } catch {
    portfolios = [];
  }
  try {
    snapshots = JSON.parse(raw.snapshots ?? '[]');
  } catch {
    snapshots = [];
  }
  try {
    settings = JSON.parse(raw.settings ?? '{}');
  } catch {
    settings = {};
  }
  if (!Array.isArray(portfolios) || !Array.isArray(snapshots)) return false;

  const doc: CloudDocument = {
    version: 1,
    exportedAt: '',
    portfolios: portfolios as CloudDocument['portfolios'],
    snapshots: snapshots as CloudDocument['snapshots'],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(settings as object),
    },
  };
  return !isPristine(doc);
}

// 原文备份到全局 :backup key（消费一次后不再读取），再移除旧全局 key
function writeBackupAndRemove(raw: LegacyRaw): void {
  try { if (raw.portfolios !== null) localStorage.setItem(BACKUP_PORTFOLIOS, raw.portfolios); } catch {}
  try { if (raw.snapshots !== null) localStorage.setItem(BACKUP_SNAPSHOTS, raw.snapshots); } catch {}
  try { if (raw.settings !== null) localStorage.setItem(BACKUP_SETTINGS, raw.settings); } catch {}
  localStorage.removeItem(BASE_PORTFOLIOS);
  localStorage.removeItem(BASE_SNAPSHOTS);
  localStorage.removeItem(BASE_SETTINGS);
}

// 把旧全局数据（如果有真实内容）安全迁入当前身份的命名空间
// 调用时机：App 启动（有身份时）与设置 PIN 后
export async function migrateLegacyData(): Promise<void> {
  if (!hasIdentity()) return;

  const raw = readLegacyRaw();
  if (raw.portfolios === null && raw.snapshots === null && raw.settings === null) return;
  if (!legacyHasRealData(raw)) return;

  // 迁移过一次 → 不再处理（旧数据已被第一个身份领走）
  if (localStorage.getItem(MIGRATION_MARKER)) return;

  // 当前身份已有本地缓存 → 不覆盖
  if (localStorage.getItem(storageKey(BASE_PORTFOLIOS))) return;

  // 云端守卫：云端对当前 uid 有真实数据 → 视旧数据为过期重复，备份后清理（云端为准）；
  // 网络/离线错误 → 中止本轮，不动任何数据，下次启动重试
  let remote: Awaited<ReturnType<typeof fetchCloudDocument>> = null;
  try {
    remote = await fetchCloudDocument();
  } catch {
    return;
  }
  if (remote && !isPristine(remote.data)) {
    writeBackupAndRemove(raw);
    try { localStorage.setItem(MIGRATION_MARKER, '1'); } catch {}
    return;
  }

  // 迁移：原文复制到当前 uid 命名空间，备份后移除旧 key
  if (raw.portfolios !== null) {
    try { localStorage.setItem(storageKey(BASE_PORTFOLIOS), raw.portfolios); } catch {}
  }
  if (raw.snapshots !== null) {
    try { localStorage.setItem(storageKey(BASE_SNAPSHOTS), raw.snapshots); } catch {}
  }
  if (raw.settings !== null) {
    try { localStorage.setItem(storageKey(BASE_SETTINGS), raw.settings); } catch {}
  }
  writeBackupAndRemove(raw);
  try { localStorage.setItem(MIGRATION_MARKER, '1'); } catch {}

  // 让当前命名空间的数据立即显示，并归并迁移数据里的品类脏数据
  useSettingsStore.getState().reloadFromStorage();
  usePortfolioStore.getState().reloadFromStorage();
  mergeDuplicateCategories();
}
