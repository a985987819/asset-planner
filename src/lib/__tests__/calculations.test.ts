import { describe, it, expect } from 'vitest';
import {
  calcBaseTotal,
  calcCategoryRatios,
  calcDailyDCATotal,
  calcMonthlyDCATotal,
  calcSalaryRatio,
  isDCABudgetExceeded,
  roundToCents,
  formatMoney,
  formatPercent,
} from '@/lib/calculations';
import { aggregateRatios, toggleInSet, formatInterval, buildCategoryMap } from '@/lib/snapshotUtils';
import { buildSankeyData } from '@/lib/sankey';
import { encryptPayload, decryptPayload } from '@/lib/cloudCrypto';
import type { Asset, UserSettings } from '@/types';

const asset = (category: string, amount: number): Asset =>
  ({ id: crypto.randomUUID(), category, name: `${category}-${amount}`, amount } as Asset);

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  monthlySalary: 10000,
  dcaRatioLimit: 30,
  monthlyTradingDays: 22,
  currency: '¥',
  categories: [],
  watchlist: [],
  ...over,
});

describe('金额计算', () => {
  it('calcBaseTotal 汇总资产金额', () => {
    expect(calcBaseTotal([asset('bond', 100), asset('gold', 250.5)])).toBe(350.5);
  });

  it('calcCategoryRatios 聚合并按占比降序', () => {
    const rows = calcCategoryRatios([asset('a', 300), asset('b', 100)]);
    expect(rows.map((r) => r.category)).toEqual(['a', 'b']);
    expect(rows[0].ratio).toBe(75);
  });

  it('calcCategoryRatios 空资产返回空数组', () => {
    expect(calcCategoryRatios([])).toEqual([]);
  });

  it('calcMonthlyDCATotal 默认 22 个交易日，可自定义', () => {
    const dca = [asset('etf', 10)];
    expect(calcMonthlyDCATotal(dca)).toBe(220);
    expect(calcMonthlyDCATotal(dca, 21)).toBe(210);
  });

  it('calcSalaryRatio 使用设置的交易日数', () => {
    const dca = [asset('etf', 100)];
    expect(calcSalaryRatio(dca, settings())).toBeCloseTo(22, 5); // 100×22 / 10000
    expect(calcSalaryRatio(dca, settings({ monthlyTradingDays: 10 }))).toBeCloseTo(10, 5);
  });

  it('isDCABudgetExceeded 按上限判定', () => {
    const dca = [asset('etf', 200)]; // 月 4400 = 44%
    expect(isDCABudgetExceeded(dca, settings())).toBe(true);
    expect(isDCABudgetExceeded(dca, settings({ dcaRatioLimit: 50 }))).toBe(false);
  });
});

describe('格式化与工具', () => {
  it('roundToCents 消除浮点尾差', () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3);
    expect(roundToCents(14.999999999)).toBe(15);
  });

  it('formatMoney 大额转万，小额保留两位', () => {
    expect(formatMoney(123456)).toBe('¥12.35万');
    expect(formatMoney(1234.5)).toBe('¥1,234.5');
  });

  it('formatPercent 保留指定小数位', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatPercent(12.345, 2)).toBe('12.35%');
  });
});

describe('snapshotUtils', () => {
  it('aggregateRatios 归一化并降序', () => {
    const rows = aggregateRatios([asset('a', 75), asset('b', 25)]);
    expect(rows[0]).toMatchObject({ category: 'a', amount: 75, ratio: 75 });
  });

  it('aggregateRatios 总额为 0 返回空', () => {
    expect(aggregateRatios([])).toEqual([]);
  });

  it('toggleInSet 切换成员', () => {
    const seen: Set<string>[] = [];
    const setter = (s: Set<string>) => seen.push(s);
    toggleInSet('x', new Set(), setter);
    toggleInSet('x', new Set(['x']), setter);
    expect([...seen[0]]).toEqual(['x']);
    expect(seen[1].has('x')).toBe(false);
  });

  it('formatInterval 按天数输出', () => {
    expect(formatInterval('2026-01-01', '2026-01-01')).toBe('同日');
    expect(formatInterval('2026-01-01', '2026-01-16')).toBe('15 天');
    expect(formatInterval('2026-01-01', '2026-03-02')).toContain('个月');
  });

  it('buildCategoryMap 先到先得收集品类', () => {
    const snap = (cats: Array<{ id: string; name: string; color: string }>) =>
      ({
        snapshotData: { settings: { categories: cats } },
      }) as never;
    const map = buildCategoryMap([
      snap([{ id: 'a', name: '旧A', color: '#111' }]),
      snap([{ id: 'a', name: '新A', color: '#222' }, { id: 'b', name: 'B', color: '#333' }]),
    ]);
    expect(map.get('a')?.name).toBe('旧A');
    expect(map.get('b')?.name).toBe('B');
  });
});

describe('桑基图数据', () => {
  it('buildSankeyData 按品类分组、组内按金额降序', () => {
    const data = buildSankeyData(
      [asset('gold', 50), asset('gold', 200), asset('bond', 120)],
      (id) => ({ name: id, color: '#000' })
    );
    expect(data.total).toBe(370);
    expect(data.categories[0].id).toBe('gold');
    expect(data.categories[0].amount).toBe(250);
    expect(data.categories[0].assets[0].amount).toBe(200);
  });
});

describe('云端加密', () => {
  it('加解密往返一致', async () => {
    const doc = { hello: '资产', nested: { list: [1, 2, 3] } };
    const enc = await encryptPayload(doc, '1234', 'uid-abc');
    expect(enc.startsWith('enc1:')).toBe(true);
    const dec = await decryptPayload(enc, '1234', 'uid-abc');
    expect(dec.kind).toBe('decrypted');
    if (dec.kind === 'decrypted') expect(dec.value).toEqual(doc);
  });

  it('错误 PIN 解密失败', async () => {
    const enc = await encryptPayload({ a: 1 }, '1234', 'uid-abc');
    expect((await decryptPayload(enc, '5678', 'uid-abc')).kind).toBe('failed');
  });

  it('旧明文数据返回 plaintext 标记', async () => {
    expect((await decryptPayload({ version: 2 }, '1234', 'uid-abc')).kind).toBe('plaintext');
    expect((await decryptPayload('普通字符串', '1234', 'uid-abc')).kind).toBe('plaintext');
  });
});
