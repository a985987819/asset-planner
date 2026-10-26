// ============================================================
// App 入口 — 路由 + 布局 + 云同步初始化
// 页面组件按路由懒加载，recharts 等重组件随页面分包，首屏只加载总览
// ============================================================

import { Component, lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Button } from 'animal-island-ui';
import { initSync } from '@/lib/sync';
import { mergeDuplicateCategories } from '@/lib/categoryMerge';
import { migrateLegacyData } from '@/lib/dataMigration';
import TabBar from '@/components/layout/TabBar';
import DashboardPage from '@/pages/DashboardPage';

const BasePage = lazy(() => import('@/pages/BasePage'));
const DCAPage = lazy(() => import('@/pages/DCAPage'));
const TrendPage = lazy(() => import('@/pages/TrendPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage'));

/**
 * 路由错误边界。懒加载 chunk 拉取失败（典型场景：线上发新版后，
 * 已打开的旧页面导航时请求旧 hash 的 chunk 已 404；或 PWA 清理旧缓存后）
 * 若不兜底，React 会卸载整棵树导致白屏。
 */
class RouteErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      const isChunkLoadError = /dynamically imported module|Importing a module script failed|Loading chunk|error loading dynamically/i.test(
        String(error.message ?? error)
      );
      return (
        <div className="py-24 px-6 text-center">
          <div className="text-sm text-gray-600 mb-4">
            {isChunkLoadError
              ? '应用已发布新版本，刷新后即可继续使用。'
              : '页面出了点问题，刷新后可恢复。'}
          </div>
          <Button type="primary" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-w-md mx-auto overflow-x-auto text-left text-[10px] text-gray-400 whitespace-pre-wrap">
              {String(error.message ?? error)}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

function PageFallback() {
  return (
    <div className="py-24 text-center text-sm text-gray-400 animate-pulse">加载中...</div>
  );
}

function AppContent() {
  const location = useLocation();

  return (
    <div className="max-w-lg mx-auto min-h-screen bg-gray-50">
      {/* key=路径：切换页面时重挂载并播放入场动画 */}
      <main key={location.pathname} className="px-4 pt-6 page-enter">
        <RouteErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/base" element={<BasePage />} />
              <Route path="/dca" element={<DCAPage />} />
              <Route path="/trend" element={<TrendPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </main>
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
