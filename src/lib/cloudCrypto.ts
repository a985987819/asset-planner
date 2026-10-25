// ============================================================
// 云端加密 — PIN 派生密钥的客户端 AES-GCM
// 云端行内容以 "enc1:<iv>.<ciphertext>" 形式存储，云端只见密文。
// 旧数据（明文 JSON 对象）兼容读取，下次推送自动升级为密文。
// ============================================================

const ENC_PREFIX = 'enc1:';
const PBKDF2_ITERATIONS = 210_000;

// 派生密钥缓存：同一身份（uid+pin）一次会话只做一次 PBKDF2
let cachedUid = '';
let cachedPin = '';
let cachedKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// salt 取 uid（uid 本身由 PIN 哈希派生，跨设备一致且随 PIN 变化）
async function deriveKey(pin: string, uid: string): Promise<CryptoKey> {
  if (cachedUid === uid && cachedPin === pin && cachedKey) return cachedKey;
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(uid), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  cachedUid = uid;
  cachedPin = pin;
  cachedKey = key;
  return key;
}

/** 加密任意可 JSON 序列化的对象，返回密文字符串 */
export async function encryptPayload(value: unknown, pin: string, uid: string): Promise<string> {
  const key = await deriveKey(pin, uid);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return `${ENC_PREFIX}${toBase64(iv)}.${toBase64(cipher)}`;
}

export type DecryptResult =
  | { kind: 'decrypted'; value: unknown } // 密文且解密成功
  | { kind: 'plaintext' } // 不是密文格式 → 旧版明文数据
  | { kind: 'failed' }; // 是密文但解不开（内容损坏或密钥不符）

/** 解密云端字段；非加密格式返回 plaintext 标记 */
export async function decryptPayload(
  payload: unknown,
  pin: string,
  uid: string
): Promise<DecryptResult> {
  if (typeof payload !== 'string' || !payload.startsWith(ENC_PREFIX)) {
    return { kind: 'plaintext' };
  }
  try {
    const [ivB64, ctB64] = payload.slice(ENC_PREFIX.length).split('.');
    if (!ivB64 || !ctB64) return { kind: 'failed' };
    const key = await deriveKey(pin, uid);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(ctB64)
    );
    return { kind: 'decrypted', value: JSON.parse(new TextDecoder().decode(plain)) };
  } catch {
    return { kind: 'failed' };
  }
}
