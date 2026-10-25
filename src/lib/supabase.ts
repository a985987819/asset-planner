// ============================================================
// Supabase 客户端配置 — 单文档云同步（完全免登录）
// ============================================================

import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { CloudDocument } from '@/lib/dataDocument';
import { encryptPayload, decryptPayload } from '@/lib/cloudCrypto';
import { getPin, getSyncUserId, hasIdentity } from '@/lib/syncIdentity';

// trim 防止 GitHub Secret 粘贴时带入的尾部换行/空格导致认证失败
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// 检查是否配置了 Supabase
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// 云同步是否可启用：需 URL + anon key + 已设置 PIN 身份
export const isSyncEnabled = (): boolean => {
  return isSupabaseConfigured() && hasIdentity();
};

// 创建 Supabase 客户端（即使未配置也创建，调用时检查）
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: 'public',
    },
  }
);

interface CloudRow {
  // v2 起云端存密文字符串；旧数据为明文 CloudDocument
  data: CloudDocument | string;
  updated_at: string;
}

// 拉取整份云端文档，无记录返回 null。云端为密文时解密；旧明文数据原样返回（下次推送升级为密文）
export async function fetchCloudDocument(): Promise<{
  data: CloudDocument;
  updatedAt: string;
} | null> {
  if (!isSyncEnabled()) return null;

  const { data, error } = await supabase
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', getSyncUserId())
    .maybeSingle<CloudRow>();

  if (error) throw error;
  if (!data) return null;

  const pin = getPin();
  const uid = getSyncUserId();
  if (!pin) throw new Error('缺少 PIN，无法解密云端数据');

  const result = await decryptPayload(data.data, pin, uid);
  if (result.kind === 'failed') {
    throw new Error('云端数据解密失败');
  }
  if (result.kind === 'decrypted') {
    return { data: result.value as CloudDocument, updatedAt: data.updated_at };
  }
  return { data: data.data as CloudDocument, updatedAt: data.updated_at };
}

// 整份写入（upsert），内容先经 PIN 派生密钥加密，返回服务端 updated_at
export async function saveCloudDocument(doc: CloudDocument): Promise<string> {
  if (!isSyncEnabled()) return '';

  const pin = getPin();
  const uid = getSyncUserId();
  if (!pin) throw new Error('缺少 PIN，无法加密云端数据');

  const { data, error } = await supabase
    .from('user_data')
    .upsert(
      {
        user_id: uid,
        data: await encryptPayload(doc, pin, uid),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('updated_at')
    .single<{ updated_at: string }>();

  if (error) throw error;
  return data.updated_at;
}

// 订阅本用户数据行的任何变更，返回退订函数
export function subscribeToCloudChanges(onRemoteChange: () => void): () => void {
  if (!isSyncEnabled()) return () => {};

  const channel: RealtimeChannel = supabase
    .channel('asset-planner-sync')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_data',
        filter: `user_id=eq.${getSyncUserId()}`,
      },
      () => onRemoteChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
