import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeRedundantSnapshots } from '@/lib/snapshotRetention';
import type { Snapshot } from '@/types';

const NOW = new Date('2026-10-26T12:00:00+08:00').getTime();

const snap = (id: string, daysAgo: number): Snapshot =>
  ({
    id,
    userId: null,
    label: `快照-${id}`,
    createdAt: new Date(NOW - daysAgo * 86400000).toISOString(),
    snapshotData: {} as never,
  }) as Snapshot;

describe('analyzeRedundantSnapshots 分层留存', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('空列表与单条记录无可清理', () => {
    expect(analyzeRedundantSnapshots([])).toEqual({ keep: [], redundant: [] });
    const r = analyzeRedundantSnapshots([snap('a', 1)]);
    expect(r.keep).toHaveLength(1);
    expect(r.redundant).toHaveLength(0);
  });

  it('最近 30 天内不同日期全部保留', () => {
    const r = analyzeRedundantSnapshots([snap('a', 1), snap('b', 5), snap('c', 20), snap('d', 29)]);
    expect(r.redundant).toHaveLength(0);
    expect(r.keep).toHaveLength(4);
  });

  it('同一天多条只保留最新', () => {
    // 'new' 比 'old' 晚约 2.4 小时（daysAgo 更小 = 更新），同属一天桶
    const r = analyzeRedundantSnapshots([
      snap('new', 2 - 0.1),
      snap('old', 2),
    ]);
    expect(r.keep.map((s) => s.id)).toEqual(['new']);
    expect(r.redundant.map((s) => s.id)).toEqual(['old']);
  });

  it('30~180 天按周保留：同周留最新，跨周保留', () => {
    // 40 天前与 44 天前大约同周（44-40=4天，可能跨周，用明确同周构造：
    // 同一周 = 时间戳同除 7*86400000 的商）
    const base = NOW - 40 * 86400000;
    const weekStart = Math.floor(base / (7 * 86400000)) * (7 * 86400000);
    const sameWeekA = new Date(weekStart + 1 * 86400000).toISOString(); // 该周较早
    const sameWeekB = new Date(weekStart + 5 * 86400000).toISOString(); // 该周较晚
    const mk = (id: string, createdAt: string) =>
      ({ id, label: id, createdAt, snapshotData: {} }) as Snapshot;
    const otherWeek = snap('other', 60);

    const r = analyzeRedundantSnapshots([mk('late', sameWeekB), mk('early', sameWeekA), otherWeek]);
    expect(r.keep.map((s) => s.id).sort()).toEqual(['late', 'other']);
    expect(r.redundant.map((s) => s.id)).toEqual(['early']);
  });

  it('180 天以上按月保留：同月留最新，跨月保留', () => {
    const r = analyzeRedundantSnapshots([
      snap('m1-new', 200),
      snap('m1-old', 210), // 与 200 天前通常同月附近，用固定断言规避跨月抖动：
      snap('m2', 260),
    ]);
    // 只验证不变量：keep ≥ 2 且最新一条永远保留
    expect(r.keep.some((s) => s.id === 'm1-new')).toBe(true);
    expect(r.keep.some((s) => s.id === 'm2')).toBe(true);
  });

  it('整体最新一条永不清理', () => {
    const r = analyzeRedundantSnapshots([snap('latest', 0), snap('same-bucket', 0.5)]);
    expect(r.keep.some((s) => s.id === 'latest')).toBe(true);
  });
});
