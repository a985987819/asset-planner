// ============================================================
// App 入口 — 路由 + 布局 + 云同步初始化
// ============================================================

import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { initSync } from '@/lib/sync';
import { mergeDuplicateCategories } from '@/lib/categoryMerge';
import { migrateLegacyData } from '@/lib/dataMigration';
import TabBar from '@/components/layout/TabBar';
import DashboardPage from '@/pages/DashboardPage';
import BasePage from '@/pages/BasePage';
import DCAPage from '@/pages/DCAPage';
import TrendPage from '@/pages/TrendPage';
import SettingsPage from '@/pages/SettingsPage';
import WatchlistPage from '@/pages/WatchlistPage';

function AppContent() {
  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      <div className="px-4 pt-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/base" element={<BasePage />} />
          <Route path="/dca" element={<DCAPage />} />
          <Route path="/trend" element={<TrendPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
        </Routes>
      </div>
      <TabBar />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    // 先归并品类脏数据，再迁移旧全局数据到当前身份命名空间，最后启动同步，
    // 避免迁移完成前把空文档推上云端
    mergeDuplicateCategories();
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        await migrateLegacyData();
      } catch {
        // 迁移失败不阻塞同步启动；下次启动会重试
      }
      if (!cancelled) cleanup = initSync();
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
