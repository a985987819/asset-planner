// ============================================================
// Supabase 客户端配置 — 单文档云同步（完全免登录）
// ============================================================

import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { CloudDocument } from '@/lib/dataDocument';

// trim 防止 GitHub Secret 粘贴时带入的尾部换行/空格导致认证失败
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// 完全免登录模式下所有设备共用的固定用户 ID
export const SYNC_USER_ID = (import.meta.env.VITE_SYNC_USER_ID || '').trim();

// 检查是否配置了 Supabase
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// 云同步是否可启用：需 URL + anon key + 同步用户 ID 三者齐全
export const isSyncEnabled = (): boolean => {
  return isSupabaseConfigured() && Boolean(SYNC_USER_ID);
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
  data: CloudDocument;
  updated_at: string;
}

// 拉取整份云端文档，无记录返回 null
export async function fetchCloudDocument(): Promise<{
  data: CloudDocument;
  updatedAt: string;
} | null> {
  if (!isSyncEnabled()) return null;

  const { data, error } = await supabase
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', SYNC_USER_ID)
    .maybeSingle<CloudRow>();

  if (error) throw error;
  if (!data) return null;

  return { data: data.data, updatedAt: data.updated_at };
}

// 整份写入（upsert），返回服务端 updated_at
export async function saveCloudDocument(doc: CloudDocument): Promise<string> {
  if (!isSyncEnabled()) return '';

  const { data, error } = await supabase
    .from('user_data')
    .upsert(
      {
        user_id: SYNC_USER_ID,
        data: doc,
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
        filter: `user_id=eq.${SYNC_USER_ID}`,
      },
      () => onRemoteChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
