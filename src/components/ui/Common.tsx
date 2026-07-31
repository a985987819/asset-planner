// ============================================================
// 通用 UI 组件
// ============================================================

import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="text-gray-300 mb-4">
        {icon || <PackageOpen size={48} />}
      </div>
      <h3 className="text-base font-medium text-gray-500 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-400 mb-4 max-w-xs">{description}</p>
      )}
      {action}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  color?: 'default' | 'red' | 'green' | 'yellow';
}

export function StatCard({ label, value, sub, alert, color = 'default' }: StatCardProps) {
  const colorClasses = {
    default: 'bg-white',
    red: 'bg-red-50 border-red-200',
    green: 'bg-green-50 border-green-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  const textColor = alert ? 'text-red-600' : 'text-gray-900';

  return (
    <div className={`card ${colorClasses[color]} ${alert ? 'border-red-200' : ''}`}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${textColor}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
