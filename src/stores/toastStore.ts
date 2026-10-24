// ============================================================
// 全局提示 — 基于 animal-island-ui 的命令式 Notification
// （组件自挂载 portal，无需在应用中渲染容器）
// ============================================================

import { Notification } from 'animal-island-ui';

export type ToastType = 'success' | 'error' | 'info';

export function showToast(message: string, type: ToastType = 'success') {
  const config = { message, duration: 3 };
  if (type === 'error') {
    Notification.error(config);
  } else if (type === 'info') {
    Notification.info(config);
  } else {
    Notification.success(config);
  }
}
