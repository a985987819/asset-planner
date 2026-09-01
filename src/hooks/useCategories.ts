// ============================================================
// 动态品类 Hook — 替代硬编码 CATEGORY_LABELS / CATEGORY_COLORS
// ============================================================

import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { CategoryDefinition } from '@/types';

export function useCategories() {
  const cats = useSettingsStore((s) => s.categories);

  const sorted = useMemo(() => {
    return [...cats].sort((a, b) => a.sortOrder - b.sortOrder);
  }, [cats]);

  const labels = useMemo(() => {
    const m: Record<string, string> = {};
    cats.forEach((c) => { m[c.id] = c.name; });
    return m;
  }, [cats]);

  const colors = useMemo(() => {
    const m: Record<string, string> = {};
    cats.forEach((c) => { m[c.id] = c.color; });
    return m;
  }, [cats]);

  const getLabel = (id: string): string => labels[id] ?? '未分类';
  const getColor = (id: string): string => colors[id] ?? '#9ca3af';

  return {
    categories: sorted as CategoryDefinition[],
    labels,
    colors,
    getLabel,
    getColor,
  };
}
