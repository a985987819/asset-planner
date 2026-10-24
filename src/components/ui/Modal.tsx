// ============================================================
// 通用弹窗 — 封装 animal-island-ui 的 Modal（blob 异形外观）
// 保持项目原有调用 API：open / onClose / title / children / maxWidth
// ============================================================

import { Modal as AnimalModal, Button } from 'animal-island-ui';
import { CloseIcon } from 'naive-icons';

/** 沿用旧版 Tailwind max-w-* 入参，映射为库需要的像素宽度 */
const WIDTH_MAP: Record<string, number> = {
  'max-w-sm': 384,
  'max-w-md': 448,
  'max-w-lg': 512,
  'max-w-xl': 576,
  'max-w-2xl': 672,
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** 兼容旧入参：滚动与视口高度限制已由库内 Modal 处理 */
  maxHeight?: string;
  /** 点击遮罩是否关闭，默认 true */
  closeOnOverlay?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  closeOnOverlay = true,
}: ModalProps) {
  return (
    <AnimalModal
      open={open}
      onClose={onClose}
      width={WIDTH_MAP[maxWidth] ?? 448}
      maskClosable={closeOnOverlay}
      footer={null}
      title={
        <div className="flex w-full items-center justify-between gap-2">
          <span>{title}</span>
          <Button
            type="text"
            size="small"
            aria-label="关闭"
            onClick={onClose}
            icon={<CloseIcon size={16} />}
          />
        </div>
      }
    >
      {/* 库内 body 是 flex + align-start 且字号偏大，用 w-full 容器恢复常规文档流排版 */}
      <div className="w-full text-sm font-normal leading-relaxed">{children}</div>
    </AnimalModal>
  );
}
