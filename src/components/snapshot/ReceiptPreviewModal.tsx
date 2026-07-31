import { useEffect, useRef, useState } from 'react';
import { Download, Save } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Modal } from '@/components/ui/Modal';
import { ReceiptCard } from './ReceiptCard';
import { usePortfolioStore } from '@/stores/portfolioStore';
import type { Snapshot } from '@/types';

interface ReceiptPreviewModalProps {
  open: boolean;
  onClose: () => void;
  snapshot?: Snapshot | null;
}

export function ReceiptPreviewModal({ open, onClose, snapshot }: ReceiptPreviewModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [saved, setSaved] = useState(false);

  const getActiveBase = usePortfolioStore((s) => s.getActiveBase);
  const getActiveDCA = usePortfolioStore((s) => s.getActiveDCA);
  const createDailySnapshot = usePortfolioStore((s) => s.createDailySnapshot);

  const basePortfolio = getActiveBase();
  const dcaPortfolio = getActiveDCA();
  const isReadonly = Boolean(snapshot);
  const todayLabel = `资产记录 ${new Date().toLocaleDateString('zh-CN')}`;

  useEffect(() => {
    if (!open) {
      setSaved(false);
      setCapturing(false);
    }
  }, [open]);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setCapturing(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#fefefe',
        scale: 2,
        onclone(clonedDoc) {
          const root = clonedDoc.querySelector('[data-receipt-root]');
          if (root instanceof HTMLElement) {
            // 确保导出时没有任何 overflow: hidden 裁剪文字
            root.style.overflow = 'visible';
            root.querySelectorAll('*').forEach((el) => {
              if (el instanceof HTMLElement) {
                const s = getComputedStyle(el);
                if (s.overflow === 'hidden' || s.overflowY === 'hidden') {
                  el.style.overflow = 'visible';
                }
                // 强制给所有文字元素留足行高，防止 canvas 字高差异导致底部截断
                if (s.lineHeight === '1' || s.lineHeight === 'normal') {
                  el.style.lineHeight = '1.4';
                }
              }
            });
          }
        },
      });
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `asset-receipt-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Screenshot failed:', err);
      alert('导出图片失败，请重试');
    } finally {
      setCapturing(false);
    }
  };

  const handleSaveSnapshot = () => {
    createDailySnapshot();
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  if (!snapshot && !basePortfolio) return null;

  return (
    <Modal open={open} onClose={onClose} title={isReadonly ? '历史记录小票' : '保存今日记录'} maxWidth="max-w-lg">
      <div className="flex flex-col items-center">
        <div className="mb-4 overflow-hidden rounded-2xl">
          <ReceiptCard
            ref={cardRef}
            snapshot={snapshot ?? undefined}
            basePortfolio={snapshot ? undefined : basePortfolio ?? undefined}
            dcaPortfolio={snapshot ? undefined : dcaPortfolio ?? undefined}
            title={snapshot ? undefined : todayLabel}
          />
        </div>

        <div className="flex w-full gap-3">
          <button onClick={handleDownload} disabled={capturing} className="btn-primary flex-1">
            <Download size={16} />
            {capturing ? '生成中...' : '保存图片'}
          </button>
          {!isReadonly && (
            <button
              onClick={handleSaveSnapshot}
              disabled={capturing || saved}
              className={`btn-secondary flex-1 ${saved ? '!bg-green-50 !text-green-600' : ''}`}
            >
              <Save size={16} />
              {saved ? '已保存' : '保存今日'}
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">
          {isReadonly ? '可导出这条历史记录的小票图片。' : '保存今日会覆盖今天已有记录，只保留最新一条。'}
        </p>
      </div>
    </Modal>
  );
}
