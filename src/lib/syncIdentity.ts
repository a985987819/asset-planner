// ============================================================
// 同步身份 — PIN → SHA-256 → user_id，本机记忆
// 不同 PIN 派生不同 user_id → 云端不同行 → 数据互相隔离
// ============================================================

const PIN_KEY = 'asset-planner-sync-pin';
const UID_KEY = 'asset-planner-sync-uid';

export function getPin(): string | null {
  return localStorage.getItem(PIN_KEY);
}

export function getSyncUserId(): string {
  return localStorage.getItem(UID_KEY) || '';
}

export function hasIdentity(): boolean {
  return Boolean(getSyncUserId());
}

// 本地数据按身份分命名空间：无 PIN → ':default'，有 PIN → ':<uid>'
// 身份切换时 Store 重载对应命名空间，避免无 PIN 泄漏个人数据
export function storageKey(base: string): string {
  const uid = getSyncUserId();
  return uid ? `${base}:${uid}` : `${base}:default`;
}

// PIN 的 SHA-256 十六进制哈希，作为云端 user_id
export async function deriveUserId(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 设置身份：派生 user_id 并持久化 PIN + uid
export async function setSyncIdentity(pin: string): Promise<string> {
  const uid = await deriveUserId(pin);
  localStorage.setItem(PIN_KEY, pin);
  localStorage.setItem(UID_KEY, uid);
  return uid;
}

export function clearSyncIdentity(): void {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(UID_KEY);
}
