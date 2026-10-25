// ============================================================
// 云同步调度 — 自动推送 / 拉取 / 实时订阅（完全免登录）
// ============================================================

import { isSyncEnabled, fetchCloudDocument, saveCloudDocument, subscribeToCloudChanges } from '@/lib/supabase';
import { buildDocument, applyDocument, documentFingerprint, isPristine, type CloudDocument } from '@/lib/dataDocument';
import { getSyncUserId } from '@/lib/syncIdentity';
import { storageKey } from '@/lib/syncIdentity';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import type { SyncStatus } from '@/types';

// 记录本设备最后一次推送到云端的状态，用于回声识别与增量比较
let lastPushedAt: string | null = null;
let lastPushedFingerprint = '';

// 防重入标志
let pushing = false;
let repushPending = false;
let pulling = false;
let repullPending = false;

function setStatus(status: SyncStatus) {
  const s = usePortfolioStore.getState();
  if (s.syncStatus !== status) s.setSyncStatus(status);
}

function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped: T & { cancel: () => void } = ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T & { cancel: () => void };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

// ---- per-uid 同步基线：切回旧身份时恢复 lastPushedAt/fingerprint，
//      让 pullNow 走 echo/采纳云端路径，而不是"首次连接本地优先"覆盖更新的云端 ----
const SYNC_STATE_BASE = 'asset-planner-sync-state';

function loadSyncState(): { at: string | null; fp: string } | null {
  const uid = getSyncUserId();
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${SYNC_STATE_BASE}:${uid}`);
    return raw ? (JSON.parse(raw) as { at: string | null; fp: string }) : null;
  } catch {
    return null;
  }
}

function saveSyncState(at: string, fp: string): void {
  const uid = getSyncUserId();
  if (!uid) return;
  try {
    localStorage.setItem(`${SYNC_STATE_BASE}:${uid}`, JSON.stringify({ at, fp }));
  } catch {
    // storage full or unavailable
  }
}

// ---- 冲突备份：本地覆盖云端前，把云端版本存入本地，保证不丢数据 ----
export interface ConflictBackup {
  savedAt: string;        // 备份产生时间
  cloudUpdatedAt: string; // 云端版本的最后更新时间
  doc: CloudDocument;
}

const CONFLICT_BACKUP_BASE = 'asset-planner-conflict-backup';

function backupKey(): string {
  return storageKey(CONFLICT_BACKUP_BASE);
}

function stashConflictBackup(doc: CloudDocument, cloudUpdatedAt: string): void {
  try {
    const backup: ConflictBackup = { savedAt: new Date().toISOString(), cloudUpdatedAt, doc };
    localStorage.setItem(backupKey(), JSON.stringify(backup));
  } catch {
    // storage 满 — 尽力而为，不阻塞同步
  }
}

/** 读取被本设备覆盖的云端版本备份（设置页展示/恢复用） */
export function getConflictBackup(): ConflictBackup | null {
  try {
    const raw = localStorage.getItem(backupKey());
    return raw ? (JSON.parse(raw) as ConflictBackup) : null;
  } catch {
    return null;
  }
}

/** 清除冲突备份（用户已处理或放弃恢复） */
export function clearConflictBackup(): void {
  localStorage.removeItem(backupKey());
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
        saveSyncState(updatedAt, lastPushedFingerprint);
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
            saveSyncState(lastPushedAt, lastPushedFingerprint);
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

        // 本地还有未推送的修改 → 本地优先。
        // 若云端也更新过（另一设备的修改），是真实冲突：覆盖前备份云端版本并提示，
        // 避免静默丢失另一端的数据。
        if (documentFingerprint(local) !== lastPushedFingerprint) {
          if (remote.updatedAt > lastPushedAt) {
            stashConflictBackup(remote.data, remote.updatedAt);
            showToast(
              '检测到其他设备也有新修改，已按本设备数据为准；被覆盖的云端版本已自动备份，可在「设置 → 数据管理」恢复',
              'info'
            );
          }
          await pushNow();
          return true;
        }

        if (remote.updatedAt > lastPushedAt) {
          // 云端更新 → 应用
          applyDocument(remote.data);
          lastPushedAt = remote.updatedAt;
          lastPushedFingerprint = documentFingerprint(remote.data);
          saveSyncState(lastPushedAt, lastPushedFingerprint);
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
// 以 syncStarted 为门（而非 isSyncEnabled），身份切换间隙的 store 写不会提前推送
export function schedulePush() {
  if (!syncStarted) return;
  if (documentFingerprint(buildDocument()) === lastPushedFingerprint) return;
  debouncedPush();
}

// 需要拉取时调用
export function schedulePull() {
  if (!syncStarted) return;
  debouncedPull();
}

let syncStarted = false;
let cleanupSync: (() => void) | null = null;

// 激活实时同步：Realtime 订阅 + 生命周期监听 + 首次拉取
function startSync(): void {
  if (syncStarted) return;
  if (!isSyncEnabled()) return;
  syncStarted = true;

  // 恢复该 uid 上次同步基线（切回旧身份时避免本地优先覆盖更新的云端）
  const state = loadSyncState();
  lastPushedAt = state?.at ?? null;
  lastPushedFingerprint = state?.fp ?? '';

  const unsubs: Array<() => void> = [];
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

  cleanupSync = () => {
    window.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    unsubs.forEach((u) => u());
    syncStarted = false;
    cleanupSync = null;
  };
}

// 应用启动时初始化：订阅数据变更 + 激活同步
export function initSync(): () => void {
  const unsubs: Array<() => void> = [];
  unsubs.push(usePortfolioStore.subscribe(() => schedulePush()));
  unsubs.push(useSettingsStore.subscribe(() => schedulePush()));
  startSync();
  return () => {
    unsubs.forEach((u) => u());
    cleanupSync?.();
  };
}

// 设置身份后调用：激活实时同步
export function activateSync(): void {
  startSync();
}

// 清除身份后调用：停止同步并重置状态
export function deactivateSync(): void {
  cleanupSync?.();
  // 取消 pending 的 debounce 推送/拉取，防止旧身份状态被推进新身份的云端行
  debouncedPush.cancel();
  debouncedPull.cancel();
  lastPushedAt = null;
  lastPushedFingerprint = '';
  setStatus('idle');
}
