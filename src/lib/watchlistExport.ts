// ============================================================
// 自选列表 Excel (.xlsx) 导出
// 列与导入表头一致：代码、名称、品类、备注；品类写名称，导入端按名称映射回 id
// ============================================================

import { useSettingsStore } from '@/stores/settingsStore';

export async function exportWatchlistToFile(): Promise<number> {
  const { watchlist, categories } = useSettingsStore.getState();
  if (watchlist.length === 0) return 0;

  const idToName = new Map(categories.map((c) => [c.id, c.name]));

  const rows: string[][] = [
    ['代码', '名称', '品类', '备注'],
    ...watchlist.map((w) => [
      w.code,
      w.name,
      idToName.get(w.categoryId) ?? '',
      w.notes,
    ]),
  ];

  // 动态加载写库，避免拖慢首屏
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const date = new Date().toISOString().split('T')[0];
  await writeExcelFile(rows).toFile(`自选列表-${date}.xlsx`);
  return watchlist.length;
}
