// ============================================================
// 桑基图数据转换 — 单期构成图（总资产/日定投 → 品类 → 具体基金）
// ============================================================

import type { Asset } from '@/types';

export interface SankeyAsset {
  id: string;
  name: string;
  amount: number;
}

export interface SankeyCategory {
  id: string;
  name: string;
  color: string;
  amount: number;
  assets: SankeyAsset[];
}

export interface SankeyData {
  total: number;
  categories: SankeyCategory[];
}

export function buildSankeyData(
  assets: Asset[],
  getCategoryInfo: (id: string) => { name: string; color: string }
): SankeyData {
  const byCat = new Map<string, SankeyAsset[]>();
  for (const a of assets) {
    const list = byCat.get(a.category) ?? [];
    list.push({ id: a.id, name: a.name, amount: a.amount });
    byCat.set(a.category, list);
  }

  const categories: SankeyCategory[] = Array.from(byCat.entries()).map(([id, list]) => {
    const info = getCategoryInfo(id);
    const sorted = [...list].sort((a, b) => b.amount - a.amount);
    return {
      id,
      name: info.name,
      color: info.color,
      amount: sorted.reduce((s, a) => s + a.amount, 0),
      assets: sorted,
    };
  });

  categories.sort((a, b) => b.amount - a.amount);

  return {
    total: categories.reduce((s, c) => s + c.amount, 0),
    categories,
  };
}
