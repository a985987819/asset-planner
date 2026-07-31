import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { Portfolio, Snapshot } from '@/types';
import { useCategories } from '@/hooks/useCategories';
import { calcBaseTotal, calcCategoryRatios, calcDailyDCATotal, formatMoney, formatPercent } from '@/lib/calculations';

interface ReceiptCardProps {
  snapshot?: Snapshot;
  basePortfolio?: Portfolio;
  dcaPortfolio?: Portfolio;
  title?: string;
}

export const ReceiptCard = React.forwardRef<HTMLDivElement, ReceiptCardProps>(
  ({ snapshot, basePortfolio, dcaPortfolio, title }, ref) => {
    const { categories: currentCategories, getColor } = useCategories();

    const base = snapshot?.snapshotData.basePortfolio ?? basePortfolio;
    const dca = snapshot?.snapshotData.dcaPortfolio ?? dcaPortfolio;
    const snapshotCategories = snapshot?.snapshotData.settings?.categories ?? [];
    const label = title ?? snapshot?.label ?? '资产快照';

    const baseAssets = base?.assets ?? [];
    const dcaAssets = dca?.assets ?? [];
    const baseTotal = calcBaseTotal(baseAssets);
    const dcaTotal = calcDailyDCATotal(dcaAssets);
    const displayTotal = baseTotal + dcaTotal;

    const mergedCategories = useMemo(() => {
      const map = new Map<string, { name: string; color: string }>();
      for (const category of [...snapshotCategories, ...currentCategories]) {
        if (!map.has(category.id)) {
          map.set(category.id, { name: category.name, color: category.color });
        }
      }
      return map;
    }, [currentCategories, snapshotCategories]);

    const categoryEntries = useMemo(() => {
      return calcCategoryRatios(baseAssets).map((item) => {
        const category = mergedCategories.get(item.category);
        return {
          id: item.category,
          name: category?.name ?? item.category,
          color: category?.color ?? getColor(item.category),
          amount: item.amount,
          ratio: item.ratio,
        };
      });
    }, [baseAssets, getColor, mergedCategories]);

    const createdAt = snapshot?.createdAt ? new Date(snapshot.createdAt) : new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const shortDate = `${createdAt.getFullYear()}/${pad(createdAt.getMonth() + 1)}/${pad(createdAt.getDate())}`;
    const timeText = `${pad(createdAt.getHours())}:${pad(createdAt.getMinutes())}`;
    const fullDate = createdAt.toLocaleString('zh-CN');

    return (
      <div className="relative select-none" style={{ minWidth: 280, maxWidth: 340 }}>

        {/* 小票纸张本体（ref 指向这里，html2canvas 导出的就是它） */}
        <div
          ref={ref}
          data-receipt-root
          className="relative bg-[#fbf7ec] text-stone-800"
          style={{
            fontFamily: '"Courier New", "JetBrains Mono", "Noto Serif SC", monospace',
            boxShadow:
              '0 12px 28px -10px rgba(0,0,0,0.18), 0 4px 10px -4px rgba(0,0,0,0.1)',
          }}
        >
          {/* 纸张纹理：淡淡的横线，模仿收银纸 */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0 1px, transparent 1px 4px)',
            }}
          />
          {/* 顶部一道极淡的灰边，模拟纸张厚度 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-stone-300/60" />

          <div className="relative px-6 pb-4 pt-5">
            {/* 头部：左侧粗体小票名 + 右侧日期（对照示例 Cash Receipt | Date:） */}
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[15px] font-bold tracking-wide text-stone-900">资产小票</div>
              <div className="text-[11px] tabular-nums text-stone-500">Date: {shortDate}</div>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-stone-500">
              <span className="min-w-0 truncate">{label}</span>
              <span className="tabular-nums">{timeText}</span>
            </div>

            {/* 虚线分隔 */}
            <div className="my-3 border-t border-dashed border-stone-400/80" />

            {/* 合计总额（粗体大字，居中） */}
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-[0.32em] text-stone-400">Total Assets</div>
              <div className="mt-1 text-[26px] font-bold leading-tight text-stone-900 tabular-nums">
                {formatMoney(displayTotal || baseTotal)}
              </div>
              <div className="mt-1.5 text-[11px] text-stone-500 tabular-nums">
                底仓 {formatMoney(baseTotal)} · 定投 {formatMoney(dcaTotal)}
              </div>
            </div>

            {/* 小饼图（仅当有数据时展示） */}
            {categoryEntries.length > 0 && (
              <div className="my-3 flex justify-center">
                <div className="h-20 w-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryEntries}
                        dataKey="ratio"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={24}
                        outerRadius={38}
                        stroke="none"
                      >
                        {categoryEntries.map((entry) => (
                          <Cell key={entry.id} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* 虚线分隔 */}
            <div className="my-2 border-t border-dashed border-stone-400/80" />

            {/* 品类明细：左名称 + 右占比小字 + 右金额（对齐示例的 name ........ price） */}
            <div className="space-y-[2px]">
              {categoryEntries.map((entry) => (
                <div key={entry.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="flex-1 truncate text-stone-700">{entry.name}</span>
                  <span className="text-[11px] text-stone-400 tabular-nums">
                    {formatPercent(entry.ratio)}
                  </span>
                  <span className="w-20 text-right font-semibold text-stone-900 tabular-nums">
                    {formatMoney(entry.amount)}
                  </span>
                </div>
              ))}
              {categoryEntries.length === 0 && (
                <div className="py-1 text-center text-[12px] text-stone-400">暂无底仓数据</div>
              )}
            </div>

            {/* 虚线分隔 */}
            <div className="my-2 border-t border-dashed border-stone-400/80" />

            {/* Summary（对照示例 Total / Cash / Change） */}
            <div className="space-y-[2px]">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-stone-700">底仓合计</span>
                <span className="font-semibold text-stone-900 tabular-nums">{formatMoney(baseTotal)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-stone-700">今日定投</span>
                <span className="font-semibold text-stone-900 tabular-nums">{formatMoney(dcaTotal)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 pt-1 text-[15px]">
                <span className="font-bold text-stone-900">资产合计</span>
                <span className="font-bold text-stone-900 tabular-nums">
                  {formatMoney(displayTotal || baseTotal)}
                </span>
              </div>
            </div>

            {/* 虚线分隔 */}
            <div className="my-3 border-t border-dashed border-stone-400/80" />

            {/* 页脚 */}
            <div className="text-center text-[10px] leading-relaxed text-stone-400">
              <div className="tracking-[0.25em]">- - - -  CUT HERE - - - - </div>
              <div className="mt-1 text-stone-500 tabular-nums">{fullDate}</div>
              <div className="mt-0.5">仅供个人记录与复盘</div>
            </div>
          </div>

          {/* 底部撕裂锯齿边 */}
          <div
            className="relative h-3 -mb-px"
            aria-hidden
            style={{
              backgroundColor: '#fbf7ec',
              clipPath:
                'polygon(0 0, 0 60%, 1.5% 0, 3% 60%, 4.5% 0, 6% 60%, 7.5% 0, 9% 60%, 10.5% 0, 12% 60%, 13.5% 0, 15% 60%, 16.5% 0, 18% 60%, 19.5% 0, 21% 60%, 22.5% 0, 24% 60%, 25.5% 0, 27% 60%, 28.5% 0, 30% 60%, 31.5% 0, 33% 60%, 34.5% 0, 36% 60%, 37.5% 0, 39% 60%, 40.5% 0, 42% 60%, 43.5% 0, 45% 60%, 46.5% 0, 48% 60%, 49.5% 0, 51% 60%, 52.5% 0, 54% 60%, 55.5% 0, 57% 60%, 58.5% 0, 60% 60%, 61.5% 0, 63% 60%, 64.5% 0, 66% 60%, 67.5% 0, 69% 60%, 70.5% 0, 72% 60%, 73.5% 0, 75% 60%, 76.5% 0, 78% 60%, 79.5% 0, 81% 60%, 82.5% 0, 84% 60%, 85.5% 0, 87% 60%, 88.5% 0, 90% 60%, 91.5% 0, 93% 60%, 94.5% 0, 96% 60%, 97.5% 0, 100% 60%, 100% 0)',
            }}
          />
        </div>
      </div>
    );
  }
);

ReceiptCard.displayName = 'ReceiptCard';
