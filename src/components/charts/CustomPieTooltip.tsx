// ============================================================
// 自定义 Recharts Pie Tooltip — 显示品类名称 + 占比 + 金额
// ============================================================

import type { TooltipProps } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

interface CustomPieTooltipProps extends TooltipProps<ValueType, NameType> {
  getLabel: (id: string) => string;
  formatPercent: (value: number) => string;
  formatMoney: (value: number) => string;
}

export function CustomPieTooltip({
  active,
  payload,
  getLabel,
  formatPercent,
  formatMoney,
}: CustomPieTooltipProps) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  const name = String(entry.name ?? '');
  const value = Number(entry.value ?? 0);
  const amount = Number((entry.payload as any)?.amount ?? 0);

  return (
    <div className="bg-white shadow-lg rounded-lg border border-gray-100 px-3 py-2 text-sm">
      <div className="font-medium text-gray-900">{getLabel(name)}</div>
      <div className="text-gray-500">占比 {formatPercent(value)}</div>
      {amount > 0 && (
        <div className="text-gray-500">金额 {formatMoney(amount)}</div>
      )}
    </div>
  );
}
