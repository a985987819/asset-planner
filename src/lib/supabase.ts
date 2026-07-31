// ============================================================
// Supabase 客户端配置
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 检查是否配置了 Supabase
export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseAnonKey);
};

// 创建 Supabase 客户端（即使未配置也创建，调用时检查）
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: {
      schema: 'public',
    },
  }
);

// ---- 认证 ----

export async function signInWithEmail(email: string) {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase 未配置，请先设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  }
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ---- 数据操作 ----

import type { Portfolio, Snapshot, SnapshotData } from '@/types';

// Portfolio CRUD
export async function fetchPortfolios(userId: string): Promise<Portfolio[]> {
  if (!isSupabaseConfigured()) return [];

  const { data: portfolios, error: pError } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (pError) throw pError;
  if (!portfolios?.length) return [];

  // 获取每个 portfolio 的 assets
  const result: Portfolio[] = [];
  for (const p of portfolios) {
    const { data: assets, error: aError } = await supabase
      .from('assets')
      .select('*')
      .eq('portfolio_id', p.id)
      .order('sort_order', { ascending: true });

    if (aError) throw aError;

    result.push({
      id: p.id,
      userId: p.user_id,
      name: p.name,
      type: p.type,
      assets: (assets || []).map((a: any) => ({
        id: a.id,
        category: a.category,
        name: a.name,
        amount: Number(a.amount),
        sortOrder: a.sort_order,
      })),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    });
  }

  return result;
}

export async function upsertPortfolio(portfolio: Portfolio): Promise<void> {
  if (!isSupabaseConfigured()) return;

  // 检查是否存在
  const { data: existing } = await supabase
    .from('portfolios')
    .select('id')
    .eq('id', portfolio.id)
    .single();

  if (existing) {
    // 更新
    await supabase
      .from('portfolios')
      .update({
        name: portfolio.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolio.id);
  } else {
    // 插入
    await supabase
      .from('portfolios')
      .insert({
        id: portfolio.id,
        user_id: portfolio.userId,
        name: portfolio.name,
        type: portfolio.type,
        created_at: portfolio.createdAt,
        updated_at: portfolio.updatedAt,
      });
  }

  // 同步 assets：先删后插
  await supabase.from('assets').delete().eq('portfolio_id', portfolio.id);

  if (portfolio.assets.length > 0) {
    const assetRows = portfolio.assets.map((a, i) => ({
      id: a.id,
      portfolio_id: portfolio.id,
      category: a.category,
      name: a.name,
      amount: a.amount,
      sort_order: i,
    }));

    await supabase.from('assets').insert(assetRows);
  }
}

export async function deletePortfolio(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('portfolios').delete().eq('id', id);
}

// Snapshot CRUD
export async function fetchSnapshots(userId: string): Promise<Snapshot[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((s: any) => ({
    id: s.id,
    userId: s.user_id,
    label: s.label,
    snapshotData: s.snapshot_data as SnapshotData,
    createdAt: s.created_at,
  }));
}

export async function saveSnapshot(snapshot: Snapshot): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await supabase.from('snapshots').insert({
    id: snapshot.id,
    user_id: snapshot.userId,
    label: snapshot.label,
    snapshot_data: snapshot.snapshotData,
    created_at: snapshot.createdAt,
  });
}

export async function deleteSnapshot(id: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  await supabase.from('snapshots').delete().eq('id', id);
}
