// ============================================================
// 品类脏数据归并 — 自建品类与内置品类同名时，以内置为规范源
// 例如老数据里用户自建了 QDII，后来内置 QDII 加入，出现两个 QDII。
// 幂等：无重复时直接返回 0，可安全地在启动与 applyDocument 时重复调用。
// ============================================================

import type { Portfolio } from '@/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePortfolioStore } from '@/stores/portfolioStore';

export function mergeDuplicateCategories(): number {
  const settings = useSettingsStore.getState();

  const builtinByName = new Map<string, string>();
  for (const c of settings.categories) {
    if (c.isBuiltin) builtinByName.set(c.name.trim(), c.id);
  }

  const remap = new Map<string, string>();
  for (const c of settings.categories) {
    if (c.isBuiltin) continue;
    const builtinId = builtinByName.get(c.name.trim());
    if (builtinId && builtinId !== c.id) remap.set(c.id, builtinId);
  }
  if (remap.size === 0) return 0;

  // 自选条目重映射 + 删除被归并的自建品类
  useSettingsStore.setState({
    categories: settings.categories.filter((c) => !remap.has(c.id)),
    watchlist: settings.watchlist.map((w) =>
      remap.has(w.categoryId) ? { ...w, categoryId: remap.get(w.categoryId)! } : w
    ),
  });
  useSettingsStore.getState().persistLocal();

  // 所有方案里的资产重映射
  const pf = usePortfolioStore.getState();
  const mapAssets = (list: Portfolio[]) =>
    list.map((p) => ({
      ...p,
      assets: p.assets.map((a) =>
        remap.has(a.category) ? { ...a, category: remap.get(a.category)! } : a
      ),
    }));
  usePortfolioStore.setState({
    basePortfolios: mapAssets(pf.basePortfolios),
    dcaPortfolios: mapAssets(pf.dcaPortfolios),
  });
  usePortfolioStore.getState().persistLocal();

  return remap.size;
}
