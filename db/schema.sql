-- ============================================================
-- 资产工具云同步 — 初始化脚本
-- 在 Supabase 控制台 → SQL Editor 中粘贴并运行
-- 完全免登录模式：单文档表 + RLS 全放行（靠页面地址保密）
-- ============================================================

create table if not exists public.user_data (
  user_id    text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;
create policy "solo_select" on public.user_data for select using (true);
create policy "solo_insert" on public.user_data for insert with check (true);
create policy "solo_update" on public.user_data for update using (true) with check (true);

-- 实时同步：把 user_data 加入 realtime 发布（幂等，重复运行不会报错）
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'user_data'
  ) then
    execute 'alter publication supabase_realtime add table public.user_data';
  end if;
end $$;
