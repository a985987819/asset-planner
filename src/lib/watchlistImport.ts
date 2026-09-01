// ============================================================
// 自选列表 Excel (.xlsx) 导入
// 表头识别：代码、名称、品类、备注；无表头时按固定顺序 代码/名称/品类/备注
// ============================================================

import { useSettingsStore } from '@/stores/settingsStore';
import type { WatchlistItem } from '@/types';

interface ImportColumn {
  code: number;
  name: number;
  category: number;
  notes: number;
}

const HEADER_ALIASES: Record<string, keyof ImportColumn> = {
  code: 'code',
  代码: 'code',
  name: 'name',
  名称: 'name',
  category: 'category',
  品类: 'category',
  分类: 'category',
  notes: 'notes',
  备注: 'notes',
};

function detectColumns(header: string[]): ImportColumn | null {
  const col: ImportColumn = { code: -1, name: -1, category: -1, notes: -1 };
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[String(h).trim().toLowerCase()];
    if (key) col[key] = i;
  });
  return col.name >= 0 ? col : null;
}

export interface ImportResult {
  added: number;
  skipped: number;
  missingCategory: number;
}

export async function importWatchlistFromFile(file: File): Promise<ImportResult> {
  // 动态加载解析库，避免拖慢首屏
  // readSheet 直接返回首个 sheet 的行数据（默认导出在 9.x 返回 Sheet[]，需取 .data）
  const { readSheet } = await import('read-excel-file/browser');

  const rows = (await readSheet(file)) as unknown as unknown[][];
  if (!rows.length) return { added: 0, skipped: 0, missingCategory: 0 };

  let columns = detectColumns((rows[0] || []).map((c) => String(c)));
  let dataStart = 1;
  if (!columns) {
    columns = { code: 0, name: 1, category: 2, notes: 3 };
    dataStart = 0;
  }

  const state = useSettingsStore.getState();
  const cats = state.categories;
  const nameToId = new Map<string, string>();
  cats.forEach((c) => {
    nameToId.set(c.name.trim(), c.id);
    nameToId.set(c.id, c.id);
  });
  const firstCatId = cats[0]?.id ?? '';
  const seen = new Set<string>(state.watchlist.map((w) => `${w.code || ''}|${w.name}`));

  const toAdd: Array<Omit<WatchlistItem, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const result: ImportResult = { added: 0, skipped: 0, missingCategory: 0 };

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i] || [];
    const get = (idx: number): string => (idx < 0 ? '' : String(row[idx] ?? '').trim());

    const name = get(columns.name);
    if (!name) continue;

    const code = get(columns.code);
    const key = `${code}|${name}`;
    if (seen.has(key)) {
      result.skipped++;
      continue;
    }

    const catText = get(columns.category);
    let categoryId: string;
    if (catText && nameToId.has(catText)) {
      categoryId = nameToId.get(catText)!;
    } else {
      if (catText) result.missingCategory++;
      categoryId = firstCatId;
    }

    seen.add(key);
    toAdd.push({ code, name, categoryId, notes: get(columns.notes) });
  }

  if (toAdd.length > 0) {
    useSettingsStore.getState().addWatchlistItems(toAdd);
    result.added = toAdd.length;
  }
  return result;
}
