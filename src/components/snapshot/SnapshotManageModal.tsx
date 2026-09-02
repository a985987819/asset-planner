import { useMemo, useState } from 'react';
import { Trash2, Eye, GitCompare, Copy, TrendingUp } from 'lucide-react';
import type { Snapshot } from '@/types';
import { Modal } from '@/components/ui/Modal';
import { formatMoney } from '@/lib/calculations';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { SnapshotCompareModal } from './SnapshotCompareModal';

interface SnapshotManageModalProps {
  open: boolean;
  onClose: () => void;
  snapshots: Snapshot[];
  removeSnapshot: (id: string) => void;
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
  restoreSnapshot,
}: SnapshotManageModalProps) {
  const [receiptSnapshot, setReceiptSnapshot] = useState<Snapshot | null>(null);
  const [compareSelected, setCompareSelected] = useState<string[]>([]);
  const [compareSnapshots, setCompareSnapshots] = useState<Snapshot[]>([]);

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
                <button
                  onClick={() => setCompareSnapshots(sortedSelected)}
                  className="btn-primary w-full text-sm"
                >
                  <GitCompare size={16} />
                  对比选中的 {sortedSelected.length} 条记录
                </button>
              </div>
            )}
            {sortedSelected.length === 1 && (
              <div className="mb-2 text-center text-xs text-gray-400">
                已选择 1 条记录，再选 1 条即可对比。
              </div>
            )}

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
                      const total = snapshot.snapshotData.basePortfolio.assets.reduce(
                        (sum, asset) => sum + asset.amount,
                        0
                      );

                      return (
                        <div
                          key={snapshot.id}
                          className={`flex items-center gap-2 rounded-lg border p-3 transition-colors ${
                            isSelected
                              ? 'border-primary-200 bg-primary-50'
                              : 'border-gray-100 bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setCompareSelected((prevIds) =>
                                prevIds.includes(snapshot.id)
                                  ? prevIds.filter((id) => id !== snapshot.id)
                                  : [...prevIds, snapshot.id]
                              );
                            }}
                            className="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
                          </div>

                          <div className="ml-1 flex gap-1">
                            {prev && (
                              <button
                                onClick={() => setCompareSnapshots([prev, snapshot])}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-primary-100 hover:text-primary-600"
                                title="与上一期对比"
                              >
                                <TrendingUp size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setReceiptSnapshot(snapshot)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-primary-100 hover:text-primary-600"
                              title="查看小票"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('确定要以此为基准编辑吗？当前数据将被覆盖。')) {
                                  restoreSnapshot(snapshot.id);
                                  onClose();
                                  setCompareSelected([]);
                                }
                              }}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-primary-100 hover:text-primary-600"
                              title="以此为基准编辑"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('确定要删除这条历史记录吗？')) {
                                  removeSnapshot(snapshot.id);
                                  setCompareSelected((prevIds) => prevIds.filter((id) => id !== snapshot.id));
                                }
                              }}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-100 hover:text-red-500"
                              title="删除"
                            >
                              <Trash2 size={14} />
                            </button>
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
