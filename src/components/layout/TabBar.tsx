// ============================================================
// 底部 TabBar 导航 — 5 标签移动端友好
// ============================================================

import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  PiggyBank,
  TrendingUp,
  LineChart,
  Settings,
  Star,
} from 'lucide-react';

const tabs = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/base', label: '底仓', icon: PiggyBank },
  { path: '/dca', label: '定投', icon: TrendingUp },
  { path: '/trend', label: '趋势', icon: LineChart },
  { path: '/watchlist', label: '自选', icon: Star },
  { path: '/settings', label: '设置', icon: Settings },
];

export default function TabBar() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="tab-bar" style={{ overflowX: 'auto' }}>
      {tabs.map((tab) => {
        const active = isActive(tab.path);
        const Icon = tab.icon;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={active ? 'tab-item-active' : 'tab-item-inactive'}
            style={{ minWidth: '56px' }}
          >
            <Icon size={18} />
            <span className="text-[10px]">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
