// ============================================================
// 认证 Store — Supabase Auth
// ============================================================

import { create } from 'zustand';
import { supabase, isSupabaseConfigured, signInWithEmail, signOut as supabaseSignOut, getSession } from '@/lib/supabase';

interface AuthStore {
  user: { id: string; email: string } | null;
  session: any | null;
  loading: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string) => Promise<{ success: boolean; message: string }>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  initialize: async () => {
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return;
    }

    try {
      const session = await getSession();
      if (session?.user) {
        set({
          session,
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
          },
          loading: false,
        });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }

    // 监听认证状态变化
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        set({
          session,
          user: {
            id: session.user.id,
            email: session.user.email ?? '',
          },
        });
      } else if (event === 'SIGNED_OUT') {
        set({ session: null, user: null });
      }
    });
  },

  signIn: async (email: string) => {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: 'Supabase 未配置。请在项目根目录创建 .env 文件，设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY',
      };
    }

    try {
      await signInWithEmail(email);
      return {
        success: true,
        message: '验证链接已发送到您的邮箱，请点击链接完成登录。',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || '登录失败，请稍后重试。',
      };
    }
  },

  signOut: async () => {
    try {
      await supabaseSignOut();
    } catch {
      // ignore
    }
    set({ user: null, session: null });
  },
}));
