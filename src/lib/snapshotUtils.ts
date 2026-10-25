// ============================================================
// 快照 / 资产对比共用工具 — 供趋势页、对比弹窗、底仓/定投页复用
// ============================================================

import type { Asset, Snapshot } from '@/types';

/** 两个 ISO 时间之间的间隔描述 */
export function formatInterval(a: string, b: string): string {
  const days = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
  if (days < 1) return '同日';
  if (days < 30) return `${days} 天`;
  return `${days} 天（约 ${Math.round(days / 30)} 个月）`;
}

/** Set 内元素的增删切换（图例隐藏 / 明细排除共用） */
export function toggleInSet<T>(value: T, set: Set<T>, setter: (next: Set<T>) => void): void {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  setter(next);
}

/** 资产列表按品类聚合金额与占比（归一化 100%，按占比降序） */
export function aggregateRatios(assets: Array<Pick<Asset, 'category' | 'amount'>>) {
  const total = assets.reduce((s, a) => s + a.amount, 0);
  if (total === 0) return [];
  const byCategory = new Map<string, number>();
  for (const a of assets) byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({ category, amount, ratio: (amount / total) * 100 }))
    .sort((a, b) => b.ratio - a.ratio);
}

/** 从快照列表收集品类定义（先到先得），历史数据的品类名/颜色回退用 */
export function buildCategoryMap(
  snapshots: Snapshot[]
): Map<string, { name: string; color: string }> {
  const map = new Map<string, { name: string; color: string }>();
  for (const s of snapshots) {
    for (const c of s.snapshotData.settings?.categories ?? []) {
      if (!map.has(c.id)) map.set(c.id, { name: c.name, color: c.color });
    }
  }
  return map;
}
