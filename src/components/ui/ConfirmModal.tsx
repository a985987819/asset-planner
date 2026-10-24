// ============================================================
// 确认弹窗 — 基于 animal-island-ui Modal + Button
// ============================================================

import { Modal as AnimalModal, Button } from 'animal-island-ui';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = '确认',
  danger,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AnimalModal
      open={open}
      onClose={onCancel}
      title={title}
      width={420}
      footer={null}
      typewriter={false}
    >
      {description && <p className="mb-5 w-full text-sm text-gray-600">{description}</p>}
      <div className="flex w-full gap-3">
        <Button block onClick={onCancel}>
          取消
        </Button>
        <Button block type="primary" danger={danger} onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </AnimalModal>
  );
}
