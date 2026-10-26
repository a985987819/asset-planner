import { useMemo, useState } from 'react';
import { Trash2, Eye, GitCompare, Copy, TrendingUp, Sparkles } from 'lucide-react';
import { Button, Checkbox } from 'animal-island-ui';
import type { Snapshot } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { formatMoney } from '@/lib/calculations';
import { analyzeRedundantSnapshots } from '@/lib/snapshotRetention';
import { showToast } from '@/stores/toastStore';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { SnapshotCompareModal } from './SnapshotCompareModal';

interface SnapshotManageModalProps {
  open: boolean;
  onClose: () => void;
  snapshots: Snapshot[];
  removeSnapshot: (id: string) => void;
  removeSnapshots: (ids: string[]) => void;
  restoreSnapshot: (id: string) => void;
}

function formatSnapshotDate(snapshot: Snapshot) {
  return new Date(snapshot.createdAt).toLocaleDateString('zh-CN');
}

export function SnapshotManageModal({
  open,
  onClose,
  snapshots,
  removeSnapshot,
  removeSnapshots,
  restoreSnapshot,
}: SnapshotManageModalProps) {
  const [receiptSnapshot, setReceiptSnapshot] = useState<Snapshot | null>(null);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [compareSnapshots, setCompareSnapshots] = useState<Snapshot[]>([]);
  const [restoreTarget, setRestoreTarget] = useState<Snapshot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Snapshot | null>(null);
  const [pruneOpen, setPruneOpen] = useState(false);

  // 分层留存策略分析出的冗余快照（同天/同周/同月内较早的记录）
  const redundant = useMemo(() => analyzeRedundantSnapshots(snapshots).redundant, [snapshots]);
  const redundantIds = useMemo(() => new Set(redundant.map((s) => s.id)), [redundant]);

  const groupedSnapshots = useMemo(() => {
    const map = new Map<string, Snapshot[]>();
    for (const snapshot of snapshots) {
      const key = formatSnapshotDate(snapshot);
      const group = map.get(key) ?? [];
      group.push(snapshot);
      map.set(key, group);
    }
    return Array.from(map.entries());
  }, [snapshots]);

  // 选中的快照按时间升序，供对比弹窗使用
  const sortedSelected = useMemo(
    () =>
      compareSelected
        .map((id) => snapshots.find((snapshot) => snapshot.id === id) ?? null)
        .filter((snapshot): snapshot is Snapshot => Boolean(snapshot))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [compareSelected, snapshots]
  );

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          onClose();
          setCompareSelected([]);
        }}
        title="历史记录"
        maxWidth="max-w-lg"
      >
        {snapshots.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400">
            暂无历史记录。保存今日后会显示在这里。
          </div>
        ) : (
          <>
            {sortedSelected.length >= 2 && (
              <div className="mb-3">
                <Button
                  type="primary"
                  size="small"
                  block
                  icon={<GitCompare size={16} />}
                  onClick={() => setCompareSnapshots(sortedSelected)}
                >
                  对比选中的 {sortedSelected.length} 条记录
                </Button>
              </div>
            )}
            {sortedSelected.length === 1 && (
              <div className="mb-2 text-center text-xs text-gray-400">
                已选择 1 条记录，再选 1 条即可对比。
              </div>
            )}

            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">共 {snapshots.length} 条记录</span>
              {redundant.length > 0 && (
                <Button type="text" size="small" icon={<Sparkles size={13} />} onClick={() => setPruneOpen(true)}>
                  智能清理 {redundant.length} 条冗余
                </Button>
              )}
            </div>

            <div className="max-h-96 space-y-4 overflow-y-auto">
              {groupedSnapshots.map(([date, items]) => (
                <div key={date}>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                    {date}
                  </div>
                  <div className="space-y-2">
                    {items.map((snapshot) => {
                      // snapshots 为最新在前，find 返回时间上一条
                      const prev = snapshots.find(
                        (s) => s.id !== snapshot.id && s.createdAt.localeCompare(snapshot.createdAt) < 0
                      );
                      const isSelected = compareSelected.includes(snapshot.id);
                      // 守卫：导入/旧版快照可能缺 basePortfolio，避免整页崩溃
                      const total = (snapshot.snapshotData.basePortfolio?.assets ?? []).reduce(
                        (sum, asset) => sum + asset.amount,
                        0
                      );
                      // 较上一期（时间上更早的记录）的变化，让留存列表本身可对比
                      const prevTotal = prev
                        ? (prev.snapshotData.basePortfolio?.assets ?? []).reduce(
                            (sum, asset) => sum + asset.amount,
                            0
                          )
                        : null;
                      const diff = prevTotal === null ? null : total - prevTotal;
                      const diffPct = prevTotal && prevTotal > 0 ? (diff! / prevTotal) * 100 : null;

                      return (
                        <div
                          key={snapshot.id}
                          className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? 'border-primary-200 bg-primary-50'
                              : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <Checkbox
                            size="small"
                            options={[{ label: '', value: snapshot.id }]}
                            value={isSelected ? [snapshot.id] : []}
                            onChange={() => {
                              setCompareSelected((prevIds) =>
                                prevIds.includes(snapshot.id)
                                  ? prevIds.filter((id) => id !== snapshot.id)
                                  : [...prevIds, snapshot.id]
                              );
                            }}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900">
                              {snapshot.label}
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(snapshot.createdAt).toLocaleString('zh-CN')}
                            </div>
                            <div className="mt-0.5 text-xs text-primary-600">
                              总资产 {formatMoney(total)}
                            </div>
                            <div
                              className={`text-xs ${
                                diff === null || diff === 0
                                  ? 'text-gray-400'
                                  : diff > 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {diff === null
                                ? '最早记录'
                                : diff === 0
                                ? '较上期持平'
                                : `较上期 ${diff > 0 ? '+' : ''}${formatMoney(diff)}${
                                    diffPct !== null
                                      ? `（${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%）`
                                      : ''
                                  }`}
                            </div>
                          </div>

                          <div className="ml-1 flex gap-1">
                            {prev && (
                              <Button
                                type="text"
                                size="small"
                                title="与上一期对比"
                                aria-label="与上一期对比"
                                icon={<TrendingUp size={14} />}
                                onClick={() => setCompareSnapshots([prev, snapshot])}
                              />
                            )}
                            <Button
                              type="text"
                              size="small"
                              title="查看小票"
                              aria-label="查看小票"
                              icon={<Eye size={14} />}
                              onClick={() => setReceiptSnapshot(snapshot)}
                            />
                            <Button
                              type="text"
                              size="small"
                              title="以此为基准编辑"
                              aria-label="以此为基准编辑"
                              icon={<Copy size={14} />}
                              onClick={() => setRestoreTarget(snapshot)}
                            />
                            <Button
                              type="text"
                              size="small"
                              title="删除"
                              aria-label="删除"
                              danger
                              icon={<Trash2 size={14} />}
                              onClick={() => setDeleteTarget(snapshot)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      <ReceiptPreviewModal
        open={Boolean(receiptSnapshot)}
        onClose={() => setReceiptSnapshot(null)}
        snapshot={receiptSnapshot}
      />

      <ConfirmModal
        open={restoreTarget !== null}
        title="以此为基准编辑"
        description={`确定要以「${restoreTarget?.label ?? '该记录'}」为基准编辑吗？当前底仓和定投数据将被覆盖。`}
        confirmText="覆盖并编辑"
        onConfirm={() => {
          if (restoreTarget) {
            restoreSnapshot(restoreTarget.id);
            onClose();
            setCompareSelected([]);
          }
          setRestoreTarget(null);
        }}
        onCancel={() => setRestoreTarget(null)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="删除历史记录"
        description="确定要删除这条历史记录吗？此操作不可恢复。"
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleteTarget) {
            removeSnapshot(deleteTarget.id);
            setCompareSelected((prevIds) => prevIds.filter((id) => id !== deleteTarget.id));
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmModal
        open={pruneOpen}
        title="智能清理冗余快照"
        description={`按分层策略保留：最近 30 天全部保留，30 天至 6 个月每周保留最新一条，更早的每月保留最新一条。共可清理 ${redundant.length} 条，保留 ${
          snapshots.length - redundant.length
        } 条。被清理的记录不可恢复。`}
        confirmText="清理"
        danger
        onConfirm={() => {
          removeSnapshots(redundant.map((s) => s.id));
          setCompareSelected((prevIds) => prevIds.filter((id) => !redundantIds.has(id)));
          setPruneOpen(false);
          showToast(`已清理 ${redundant.length} 条冗余记录`);
        }}
        onCancel={() => setPruneOpen(false)}
      />

      {compareSnapshots.length >= 2 && (
        <SnapshotCompareModal
          open={compareSnapshots.length >= 2}
          onClose={() => setCompareSnapshots([])}
          snapshots={compareSnapshots}
        />
      )}
    </>
  );
}
