// ============================================================
// 核心计算逻辑 — 底仓、定投
// ============================================================

import type {
  Asset,
  UserSettings,
} from '@/types';

// ---- 底仓计算 ----

/** 计算底仓总金额 */
export function calcBaseTotal(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + a.amount, 0);
}

/** 计算各品种占比 */
export function calcCategoryRatios(
  assets: Asset[]
): { category: string; amount: number; ratio: number }[] {
  const total = calcBaseTotal(assets);
  if (total === 0) return [];

  const byCategory = new Map<string, number>();
  for (const a of assets) {
    byCategory.set(a.category, (byCategory.get(a.category) || 0) + a.amount);
  }

  return Array.from(byCategory.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      ratio: (amount / total) * 100,
    }))
    .sort((a, b) => b.ratio - a.ratio);
}

// ---- 定投计算 ----

/** 计算日定投合计 */
export function calcDailyDCATotal(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + a.amount, 0);
}

/** 计算月定投合计（日 × 每月交易日数，默认 22，可由设置覆盖） */
export function calcMonthlyDCATotal(assets: Asset[], tradingDays = 22): number {
  return calcDailyDCATotal(assets) * tradingDays;
}

/** 月薪占比 */
export function calcSalaryRatio(assets: Asset[], settings: UserSettings): number {
  if (settings.monthlySalary === 0) return 0;
  return (calcMonthlyDCATotal(assets, settings.monthlyTradingDays) / settings.monthlySalary) * 100;
}

/** 工资约束告警：月定投是否超出比例上限 */
export function isDCABudgetExceeded(assets: Asset[], settings: UserSettings): boolean {
  return calcSalaryRatio(assets, settings) > settings.dcaRatioLimit;
}

// ---- 工具函数 ----

/** 金额取整到分（2 位小数），消除 JSON 反序列化/浮点运算引入的尾差（如 15 → 14.98…） */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 生成 UUID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** 格式化金额 */
export function formatMoney(amount: number, currency = '¥'): string {
  if (amount >= 10000) {
    return `${currency}${(amount / 10000).toFixed(2)}万`;
  }
  return `${currency}${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

/** 格式化百分比 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}
