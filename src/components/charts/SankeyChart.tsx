// ============================================================
// 桑基图组件 — 单期构成图（总资产/日定投 → 品类 → 具体基金）
// 纯 SVG 渲染，无第三方依赖
// ============================================================

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SankeyData } from '@/lib/sankey';

interface SankeyChartProps {
  data: SankeyData;
  formatValue: (v: number) => string;
  rootLabel: string;
  height?: number;
  emptyText?: string;
}

const MIN_NODE = 2;
const NODE_W = 12;
const COL1_X = 8;

interface LayoutNode {
  id: string;
  name: string;
  color: string;
  amount: number;
  x: number;
  y: number;
  height: number;
  percent: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  amount: number;
  color: string;
  path: string;
  percent: number;
}

interface Layout {
  rootNode: LayoutNode;
  catNodes: LayoutNode[];
  assetNodes: LayoutNode[];
  links: LayoutLink[];
  col2X: number;
  col3X: number;
}

function linkPath(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const dx = Math.max(8, (x2 - x1) * 0.3);
  return [
    `M ${x1} ${y1}`,
    `C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
    `L ${x2} ${y2 + w}`,
    `C ${x2 - dx} ${y2 + w}, ${x1 + dx} ${y1 + w}, ${x1} ${y1 + w}`,
    'Z',
  ].join(' ');
}

function computeLayout(data: SankeyData, width: number, height: number, rootLabel: string): Layout {
  const { total, categories } = data;
  const scale = total > 0 ? height / total : 0;
  const col2X = Math.round(width * 0.34);
  const col3X = Math.round(width * 0.7);

  const catNodes: LayoutNode[] = [];
  const assetNodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];

  let catY = 0;
  for (const cat of categories) {
    const catH = Math.max(
      cat.assets.reduce((s, a) => s + Math.max(a.amount * scale, MIN_NODE), 0),
      MIN_NODE
    );
    const catNode: LayoutNode = {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      amount: cat.amount,
      x: col2X,
      y: catY,
      height: catH,
      percent: total > 0 ? (cat.amount / total) * 100 : 0,
    };
    catNodes.push(catNode);

    let assetY = catY;
    for (const a of cat.assets) {
      const aH = Math.max(a.amount * scale, MIN_NODE);
      const assetNode: LayoutNode = {
        id: a.id,
        name: a.name,
        color: cat.color,
        amount: a.amount,
        x: col3X,
        y: assetY,
        height: aH,
        percent: total > 0 ? (a.amount / total) * 100 : 0,
      };
      assetNodes.push(assetNode);
      links.push({
        source: catNode,
        target: assetNode,
        amount: a.amount,
        color: cat.color,
        path: linkPath(col2X + NODE_W, assetY, col3X, assetY, aH),
        percent: assetNode.percent,
      });
      assetY += aH;
    }
    catY += catH;
  }

  const rootNode: LayoutNode = {
    id: '__root__',
    name: rootLabel,
    color: '#111827',
    amount: total,
    x: COL1_X,
    y: 0,
    height: catY,
    percent: 100,
  };

  for (const catNode of catNodes) {
    links.push({
      source: rootNode,
      target: catNode,
      amount: catNode.amount,
      color: catNode.color,
      path: linkPath(COL1_X + NODE_W, catNode.y, col2X, catNode.y, catNode.height),
      percent: catNode.percent,
    });
  }

  return { rootNode, catNodes, assetNodes, links, col2X, col3X };
}

interface TooltipState {
  x: number;
  y: number;
  title: string;
  amount: number;
  percent: number;
}

export function SankeyChart({ data, formatValue, rootLabel, height = 280, emptyText }: SankeyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => (width > 0 ? computeLayout(data, width, height, rootLabel) : null),
    [data, width, height, rootLabel]
  );

  const showTooltip = (e: React.MouseEvent, title: string, amount: number, percent: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(e.clientX - rect.left + 12, 0), width - 150);
    const y = Math.min(Math.max(e.clientY - rect.top + 12, 0), height - 50);
    setTooltip({ x, y, title, amount, percent });
  };

  const hideTooltip = () => setTooltip(null);

  if (data.total <= 0 || data.categories.length === 0) {
    return (
      <div>
        <div className="mb-2 text-xs text-gray-500">
          {rootLabel} {formatValue(data.total)}
        </div>
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          {emptyText ?? '该日期无资产数据'}
        </div>
      </div>
    );
  }

  const assetLabelBand = layout ? width - (layout.col3X + NODE_W + 4) - 4 : 0;
  const maxNameChars = Math.max(2, Math.floor((assetLabelBand - 36) / 10));
  const maxCatChars = layout ? Math.max(2, Math.floor((layout.col2X - 4 - COL1_X - NODE_W) / 10)) : 2;
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-2 text-xs text-gray-500">
        {rootLabel} {formatValue(data.total)}
      </div>
      {layout && (
        <svg width={width} height={height} className="block">
          {/* 连线 */}
          {layout.links.map((link, i) => (
            <path
              key={`link-${i}`}
              d={link.path}
              fill={link.color}
              opacity={0.45}
              onMouseEnter={(e) =>
                showTooltip(e, `${link.source.name} → ${link.target.name}`, link.amount, link.percent)
              }
              onMouseMove={(e) =>
                showTooltip(e, `${link.source.name} → ${link.target.name}`, link.amount, link.percent)
              }
              onMouseLeave={hideTooltip}
            />
          ))}
          {/* 节点 */}
          {[layout.rootNode, ...layout.catNodes, ...layout.assetNodes].map((node, i) => (
            <rect
              key={`node-${i}`}
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={Math.max(node.height, MIN_NODE)}
              rx={2}
              fill={node.color}
              onMouseEnter={(e) => showTooltip(e, node.name, node.amount, node.percent)}
              onMouseMove={(e) => showTooltip(e, node.name, node.amount, node.percent)}
              onMouseLeave={hideTooltip}
            />
          ))}
          {/* 品类标签（节点左侧） */}
          {layout.catNodes.map((node) => (
            <text
              key={`cat-label-${node.id}`}
              x={layout.col2X - 4}
              y={node.y + node.height / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {truncate(node.name, maxCatChars)} {node.percent.toFixed(1)}%
            </text>
          ))}
          {/* 资产标签（节点右侧） */}
          {layout.assetNodes.map((node) => (
            <text
              key={`asset-label-${node.id}`}
              x={layout.col3X + NODE_W + 4}
              y={node.y + node.height / 2}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={10}
              fill="#6b7280"
            >
              {truncate(node.name, maxNameChars)} {node.percent.toFixed(1)}%
            </text>
          ))}
        </svg>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-medium text-gray-900">{tooltip.title}</div>
          <div className="text-gray-500">
            {formatValue(tooltip.amount)} · {tooltip.percent.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  );
}
