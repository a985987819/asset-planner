# Asset Planner · 资产配置 & 定投规划工具

一个面向移动端的个人资产配置与定投规划工具。支持底仓管理、每日定投计划、品类占比可视化、历史快照对比、自选品种库与云同步。所有数据默认保存在浏览器本地，配置 Supabase 后可开启跨设备云同步。

---

## 功能总览

底部导航共 5 个页面：**总览 / 底仓 / 定投 / 自选 / 设置**。

### 1. 总览（Dashboard）
- 汇总底仓总额、日定投额、月定投额（日 × 22 个交易日）、月薪占比。
- 月薪占比超出设定上限时高亮告警。
- 「底仓占比」与「定投占比」环形饼图，配右侧品类图例。
- **图表交互（v2 优化）**：
  - 点击右侧图例中的任意品类，可**取消该项的统计**（被取消的品类不参与占比计算，剩余项重新归一化到 100%）。
  - 再次点击该图例即可恢复统计；图例变为删除线 + 半透明表示已排除。
  - 出现排除项时，图例底部显示「重置排除（恢复全部统计）」按钮，一键恢复。
  - 饼图标题右侧实时显示「统计总额」与已排除项数量，确保口径清晰。
- 「保存今日记录」生成当日快照，「查看历史对比」打开历史记录管理弹窗。

### 2. 底仓管理（Base）
- 维护底仓资产（债券、黄金、股市宽基、主题基金、货币等动态品类）。
- 支持多方案：新建 / 切换 / 删除底仓方案。
- 资产增删改、按品类 Tab 筛选、名称搜索。
- **图表交互（v2 优化）**：
  - 右侧品类图例可点击，**切换整品类在饼图中的显示**（隐藏后该品类不参与统计）。
  - 下方明细列表中的每一项可通过左侧小圆点**切换该项在饼图中的显示/隐藏**。
  - 排除的明细项**仍保留在列表中**（呈半透明 + 删除线），可再次点击恢复，告别「排除后难以找回」。
  - 顶部统计总额随排除项实时重算，并显示已排除品类数 / 单项数。
- 历史快照：保存今日、查看历史记录、以历史为基准继续编辑。

### 3. 每日定投（DCA）
- 维护每日定投计划，自动计算月定投额与月薪占比。
- 月定投超出月薪上限时在预算卡上标红告警，并附带进度条可视化。
- 多方案管理、品类 Tab 筛选、搜索。
- **图表交互与底仓页一致**：右侧图例点击切换品类，明细项点击切换显隐且可恢复。

### 4. 自选管理（Watchlist）
- 预先维护关注的基金 / 股票（代码、名称、品类、备注）。
- 在底仓 / 定投页「添加」时可直接从自选列表快速选择，免去重复输入。
- 支持按代码或名称搜索、编辑、删除。

### 5. 设置（Settings）
- **工资约束**：月薪、定投比例上限（%）。
- **品类管理**：新增 / 编辑 / 删除自定义品类（含颜色），内置品类不可删除。被资产或自选引用的品类禁止删除。
- **数据管理**：
  - 历史记录入口；
  - 导出 JSON 备份；
  - 导入 JSON 恢复；
  - 清空所有数据（不可恢复）。
- **云同步**（可选）：基于 Supabase + Magic Link 免密码登录，支持从云端同步、上传本地数据到云端。未配置时纯本地存储。

---

## 关于「再平衡」模块

旧版本包含独立的「再平衡模拟」页面（设定涨幅后给出调仓建议）。本次迭代已将其移除——**该能力由「历史快照」自然承载**：

- 在底仓 / 定投 / 总览页随时「保存今日记录」生成快照；
- 在历史记录中选中两条快照可「对比」，查看各品类 / 明细的金额与比例变化趋势；
- 可「以此为基准编辑」将某条历史快照恢复到当前继续调整。

这样用真实的历史数据做对比，比假设涨幅的模拟更贴近实际，也减少了冗余功能。

---

## 图表交互说明（重点）

本项目使用 [Recharts](https://recharts.org/) 渲染环形饼图，所有饼图均支持两层粒度的显隐切换：

| 操作位置 | 控制粒度 | 行为 |
| --- | --- | --- |
| 饼图右侧「品类图例」 | 品类 | 点击切换该品类的统计；隐藏后不参与占比计算，剩余品类重新归一化到 100% |
| 下方「明细列表」每行左侧小圆点 | 单项 | 点击切换该单项的统计；排除后仍保留在列表中（半透明），可再次点击恢复 |

- 任何排除操作都会让饼图与「统计总额」实时重算。
- 出现任意排除项时，图例底部与搜索栏右侧都会出现「重置排除」入口，一键恢复全部统计。
- 排除状态仅影响图表统计展示，不会删除或修改底仓 / 定投的真实数据。

---

## 技术栈

- **框架**：React 18 + TypeScript + Vite 6
- **路由**：react-router-dom v6（HashRouter，适配 GitHub Pages 静态部署）
- **状态管理**：Zustand
- **图表**：Recharts
- **样式**：Tailwind CSS
- **图标**：lucide-react
- **云服务**：Supabase（可选：数据同步 + Magic Link 登录）
- **截图**：html2canvas（生成资产小票图片）
- **包管理 / 运行时**：推荐 [Bun](https://bun.sh/)，也兼容 npm

---

## 快速开始

### 环境要求
- Node.js ≥ 20（推荐 22）或 Bun ≥ 1.1

### 安装依赖
```bash
bun install
# 或
npm install
```

### 本地开发
```bash
bun run dev
# 或
npm run dev
```
默认启动在 `http://localhost:5173/asset-planner/`（若端口被占用会自动递增）。

### 生产构建
```bash
bun run build
# 或
npm run build
```
构建产物输出到 `dist/`，类型检查 + Vite 打包一步完成。

### 预览构建产物
```bash
bun run preview
```

### （可选）开启云同步
复制 `.env.example` 为 `.env`，填入 Supabase 项目 URL 与 anon key：
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```
不配置时所有数据保存在浏览器 localStorage，完全可用。

---

## 部署到 GitHub Pages

仓库已自带 `.github/workflows/deploy.yml`：当推送到 `main` / `master` 分支时会自动构建并部署到 GitHub Pages。

部署步骤：
1. 在 GitHub 仓库 **Settings → Pages → Build and deployment → Source** 选择 `GitHub Actions`。
2. （可选）在 **Settings → Secrets and variables → Actions** 添加 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY` 以启用云同步。
3. 推送代码到 `main` 分支，Action 完成后即可通过 `https://<你的用户名>.github.io/asset-planner/` 访问。

> 注意：`vite.config.ts` 中 `base: '/asset-planner/'` 已与仓库名对齐，部署到其它仓库名时需同步修改。

---

## 项目结构

```
src/
├── App.tsx                      # 路由 + 布局入口
├── main.tsx                     # React 挂载
├── index.css                    # Tailwind 全局样式
├── pages/                       # 5 个页面
│   ├── DashboardPage.tsx        # 总览
│   ├── BasePage.tsx             # 底仓管理
│   ├── DCAPage.tsx              # 每日定投
│   ├── WatchlistPage.tsx        # 自选管理
│   └── SettingsPage.tsx         # 设置
├── components/
│   ├── charts/CustomPieTooltip.tsx
│   ├── layout/TabBar.tsx        # 底部导航
│   ├── snapshot/                # 快照相关组件
│   │   ├── ReceiptCard.tsx
│   │   ├── ReceiptPreviewModal.tsx
│   │   ├── SnapshotManageModal.tsx
│   │   └── SnapshotCompareModal.tsx
│   ├── ui/                      # 通用 UI（Modal、Common、品类管理）
│   └── watchlist/WatchlistPickerModal.tsx
├── stores/                      # Zustand stores
│   ├── portfolioStore.ts        # 底仓 / 定投 / 快照 / 同步
│   ├── settingsStore.ts         # 工资约束 / 品类 / 自选
│   └── authStore.ts             # Supabase 认证
├── hooks/useCategories.ts       # 品类 label / color 查询 hook
├── lib/
│   ├── calculations.ts          # 金额 / 占比 / 工资约束计算
│   └── supabase.ts              # Supabase 客户端封装
└── types/index.ts               # TypeScript 类型定义
```

### 语义化 DOM ID
为便于定位与自动化测试，关键 DOM 节点均带语义化 ID，命名规则为「页面-区块」或「页面-区块-标识」，例如：
- `dashboard-page`、`dashboard-base-chart`、`dashboard-base-legend`、`dashboard-base-legend-{categoryId}`
- `base-page`、`base-chart-card`、`base-pie`、`base-legend`、`base-legend-{categoryId}`、`base-asset-list`、`base-asset-{assetId}`
- `dca-page`、`dca-chart-card`、`dca-pie`、`dca-legend`、`dca-asset-{assetId}`

---

## 数据与隐私

- 默认纯本地存储（localStorage），无需注册即可使用。
- 配置 Supabase 后，数据可上传到你的私有 Supabase 项目，仅你自己登录后可见。
- 提供 JSON 导出 / 导入，便于本地备份与迁移。

---

## 许可

本项目仅供个人学习与使用。
