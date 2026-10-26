// ============================================================
// 快照留存策略 — 分层保留，控制快照无限累积
// 最近 30 天全部保留；30 天~6 个月每周保留最新一条；
// 6 个月以上每月保留最新一条。整体最新一条永不清理。
// ============================================================

import type { Snapshot } from '@/types';

export interface RetentionResult {
  keep: Snapshot[];
  redundant: Snapshot[];
}

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const RECENT_DAYS = 30;
const MID_DAYS = 180;

/** 某快照所属的留存桶：桶内只保留最新一条 */
function bucketKey(createdAt: string, now: number): string {
  const ts = new Date(createdAt).getTime();
  const ageDays = (now - ts) / DAY_MS;
  if (ageDays <= RECENT_DAYS) {
    // 近期：按天保留
    return `d:${Math.floor(ts / DAY_MS)}`;
  }
  if (ageDays <= MID_DAYS) {
    // 中期：按自然周保留（以纪元周计，跨年稳定）
    return `w:${Math.floor(ts / WEEK_MS)}`;
  }
  // 远期：按自然月保留
  const d = new Date(ts);
  return `m:${d.getFullYear()}-${d.getMonth()}`;
}

/** 分析冗余快照（不修改数据）：桶内较旧的即为冗余 */
export function analyzeRedundantSnapshots(snapshots: Snapshot[], now = Date.now()): RetentionResult {
  const sorted = [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const keep: Snapshot[] = [];
  const redundant: Snapshot[] = [];
  const seen = new Set<string>();
  for (const s of sorted) {
    const key = bucketKey(s.createdAt, now);
    if (seen.has(key)) {
      redundant.push(s);
    } else {
      seen.add(key);
      keep.push(s);
    }
  }
  return { keep, redundant };
}
