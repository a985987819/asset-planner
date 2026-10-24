// ============================================================
// 通用 UI 组件
// ============================================================

import { Card, Title } from 'animal-island-ui';
import type { CardColor } from 'animal-island-ui';
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
    <div className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <Title size="small" variant="ribbon">
          {title}
        </Title>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {subtitle && (
        <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>
      )}
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

const COLOR_MAP: Record<NonNullable<StatCardProps['color']>, CardColor> = {
  default: 'default',
  red: 'app-red',
  green: 'app-green',
  yellow: 'app-yellow',
};

export function StatCard({ label, value, sub, alert, color = 'default' }: StatCardProps) {
  // 库的彩色 Card 为实色底白字，default 为羊皮纸底棕字
  const isTinted = color !== 'default';

  return (
    <Card color={COLOR_MAP[color]}>
      <div className={`text-xs mb-1 ${isTinted ? 'text-white/80' : 'text-gray-500'}`}>
        {label}
      </div>
      <div className={`text-lg font-bold ${isTinted ? 'text-white' : alert ? 'text-danger-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs mt-1 ${isTinted ? 'text-white/70' : 'text-gray-400'}`}>
          {sub}
        </div>
      )}
    </Card>
  );
}
