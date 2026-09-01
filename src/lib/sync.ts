// ============================================================
// 云同步调度 — 自动推送 / 拉取 / 实时订阅（完全免登录）
// ============================================================

import { isSyncEnabled, fetchCloudDocument, saveCloudDocument, subscribeToCloudChanges } from '@/lib/supabase';
import { buildDocument, applyDocument, documentFingerprint, type CloudDocument } from '@/lib/dataDocument';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { DEFAULT_SETTINGS } from '@/types';

// 记录本设备最后一次推送到云端的状态，用于回声识别与增量比较
let lastPushedAt: string | null = null;
let lastPushedFingerprint = '';

// 防重入标志
let pushing = false;
let repushPending = false;
let pulling = false;
let repullPending = false;

function setStatus(status: 'syncing' | 'synced' | 'error' | 'offline') {
  const s = usePortfolioStore.getState();
  if (s.syncStatus !== status) s.setSyncStatus(status);
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  return wrapped as (...args: Parameters<T>) => void;
}

// 全新设备 / 全新用户的判空
function isPristine(doc: CloudDocument): boolean {
  const s = doc.settings || ({} as CloudDocument['settings']);
  return (
    doc.portfolios.every((p) => p.assets.length === 0) &&
    doc.snapshots.length === 0 &&
    (s.watchlist || []).length === 0 &&
    ((s.categories || []).every((c) => c.isBuiltin)) &&
    !s.monthlySalary &&
    s.dcaRatioLimit === DEFAULT_SETTINGS.dcaRatioLimit &&
    s.currency === DEFAULT_SETTINGS.currency
  );
}

// 把当前本地状态整份推送到云端
export async function pushNow(): Promise<boolean> {
  if (!isSyncEnabled()) return false;
  if (pushing) {
    repushPending = true;
    return false;
  }
  pushing = true;
  try {
    do {
      repushPending = false;
      setStatus('syncing');
      if (!navigator.onLine) {
        setStatus('offline');
        return false;
      }
      try {
        const doc = buildDocument();
        const updatedAt = await saveCloudDocument(doc);
        lastPushedAt = updatedAt;
        lastPushedFingerprint = documentFingerprint(doc);
      } catch {
        setStatus(navigator.onLine ? 'error' : 'offline');
        return false;
      }
    } while (repushPending);
    setStatus('synced');
    return true;
  } finally {
    pushing = false;
  }
}

// 从云端拉取并合并（last-write-wins）
export async function pullNow(): Promise<boolean> {
  if (!isSyncEnabled()) return false;
  if (pulling) {
    repullPending = true;
    return false;
  }
  pulling = true;
  try {
    do {
      repullPending = false;
      setStatus('syncing');
      try {
        const remote = await fetchCloudDocument();
        const local = buildDocument();

        if (!remote) {
          // 云端空 → 本地播种
          await pushNow();
          return true;
        }

        if (lastPushedAt === null) {
          // 首次连接：全新设备优先采纳云端，否则本地播种
          if (isPristine(local) && !isPristine(remote.data)) {
            applyDocument(remote.data);
            lastPushedAt = remote.updatedAt;
            lastPushedFingerprint = documentFingerprint(remote.data);
            setStatus('synced');
          } else {
            await pushNow();
          }
          return true;
        }

        // 自身回声（刚推过这条记录）
        if (remote.updatedAt === lastPushedAt) {
          setStatus('synced');
          return true;
        }

        // 本地还有未推送的修改 → 本地优先
        if (documentFingerprint(local) !== lastPushedFingerprint) {
          await pushNow();
          return true;
        }

        if (remote.updatedAt > lastPushedAt) {
          // 云端更新 → 应用
          applyDocument(remote.data);
          lastPushedAt = remote.updatedAt;
          lastPushedFingerprint = documentFingerprint(remote.data);
          setStatus('synced');
        } else {
          await pushNow();
        }
        return true;
      } catch {
        setStatus(navigator.onLine ? 'error' : 'offline');
      }
    } while (repullPending);
    return true;
  } finally {
    pulling = false;
  }
}

const debouncedPush = debounce(() => pushNow(), 800);
const debouncedPull = debounce(() => pullNow(), 300);

// 数据变更后调用：内容未变化则跳过
export function schedulePush() {
  if (!isSyncEnabled()) return;
  if (documentFingerprint(buildDocument()) === lastPushedFingerprint) return;
  debouncedPush();
}

// 需要拉取时调用
export function schedulePull() {
  if (!isSyncEnabled()) return;
  debouncedPull();
}

// 应用启动时初始化：订阅数据变更 + 实时通道 + 生命周期监听
export function initSync(): () => void {
  const unsubs: Array<() => void> = [];
  unsubs.push(usePortfolioStore.subscribe(() => schedulePush()));
  unsubs.push(useSettingsStore.subscribe(() => schedulePush()));

  if (!isSyncEnabled()) {
    return () => unsubs.forEach((u) => u());
  }

  unsubs.push(subscribeToCloudChanges(() => schedulePull()));

  const onVisibility = () => {
    if (document.visibilityState === 'visible') schedulePull();
  };
  const onOnline = () => schedulePull();
  window.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);

  if (!navigator.onLine) setStatus('offline');

  // 首次拉取（云端空会自动播种）
  schedulePull();

  return () => {
    window.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    unsubs.forEach((u) => u());
  };
}
