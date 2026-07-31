// ============================================================
// App 入口 — 路由 + 布局
// ============================================================

import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import TabBar from '@/components/layout/TabBar';
import DashboardPage from '@/pages/DashboardPage';
import BasePage from '@/pages/BasePage';
import DCAPage from '@/pages/DCAPage';
import SettingsPage from '@/pages/SettingsPage';
import WatchlistPage from '@/pages/WatchlistPage';

function AppContent() {
  const authLoading = useAuthStore((s) => s.loading);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      <div className="px-4 pt-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/base" element={<BasePage />} />
          <Route path="/dca" element={<DCAPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
        </Routes>
      </div>
      <TabBar />
    </div>
  );
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
}
