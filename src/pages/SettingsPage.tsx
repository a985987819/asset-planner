import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  Trash2,
  Cloud,
  CloudOff,
  RefreshCw,
  History,
  Check,
  Pencil,
  Star,
  Plus,
  KeyRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { pullNow, pushNow, activateSync, deactivateSync } from '@/lib/sync';
import { hasIdentity, getSyncUserId, setSyncIdentity, clearSyncIdentity } from '@/lib/syncIdentity';
import { buildDocument, importDocument } from '@/lib/dataDocument';
import { useCategories } from '@/hooks/useCategories';
import { PageHeader } from '@/components/ui/Common';
import { CategoryManageModal } from '@/components/ui/CategoryManageModal';
import { SnapshotManageModal } from '@/components/snapshot/SnapshotManageModal';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const navigate = useNavigate();
  const {
    syncStatus,
    clearAll,
    snapshots,
    removeSnapshot,
    restoreSnapshot,
  } = usePortfolioStore();

  const { categories } = useCategories();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exported, setExported] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [pin, setPin] = useState('');
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState('');

  const checkCategoryInAssets = (categoryId: string): boolean => {
    const { basePortfolios, dcaPortfolios } = usePortfolioStore.getState();
    const allAssets = [...basePortfolios.flatMap((portfolio) => portfolio.assets), ...dcaPortfolios.flatMap((portfolio) => portfolio.assets)];
    return allAssets.some((asset) => asset.category === categoryId);
  };

  const handleExport = () => {
    const json = JSON.stringify(buildDocument(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `asset-planner-backup-${new Date().toISOString().split('T')[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 2000);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const json = loadEvent.target?.result as string;
      const success = importDocument(json);
      alert(success ? '数据导入成功' : '导入失败：文件格式不正确');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleCategoryDelete = (categoryId: string) => {
    setDeleteError('');
    const inWatchlist = settings.watchlist.some((item) => item.categoryId === categoryId);
    const inAssets = checkCategoryInAssets(categoryId);

    if (inWatchlist || inAssets) {
      setDeleteError(
        '该品类正在被' +
          [inWatchlist && '自选列表', inAssets && '资产条目'].filter(Boolean).join('和') +
          '使用，无法删除'
      );
      return;
    }

    const result = settings.deleteCategory(categoryId);
    if (!result.success) {
      setDeleteError(result.reason || '删除失败');
    }
  };

  const handleSetIdentity = async () => {
    setIdentityError('');
    const value = pin.trim();
    if (value.length < 4) {
      setIdentityError('密码至少 4 位，建议用足够强的组合');
      return;
    }
    try {
      await setSyncIdentity(value);
      setPin('');
      setEditingIdentity(false);
      // 切换身份时先停掉旧身份的实时订阅，再激活新身份
      deactivateSync();
      activateSync();
    } catch {
      setIdentityError('设置失败，请重试');
    }
  };

  const handleClearIdentity = () => {
    if (window.confirm('确定清除身份吗？清除后本设备将不再同步云端数据。')) {
      clearSyncIdentity();
      setPin('');
      setEditingIdentity(false);
      deactivateSync();
    }
  };

  const syncStatusDisplay = () => {
    if (!hasIdentity()) {
      return (
        <span className="flex items-center gap-1 text-xs text-gray-400">
          <KeyRound size={12} /> 未设置身份
        </span>
      );
    }
    switch (syncStatus) {
      case 'syncing':
        return (
          <span className="flex items-center gap-1 text-xs text-yellow-600">
            <RefreshCw size={12} className="animate-spin" /> 同步中...
          </span>
        );
      case 'synced':
        return (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check size={12} /> 已同步
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 text-xs text-red-500">
            <CloudOff size={12} /> 同步失败
          </span>
        );
      case 'offline':
        return (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <CloudOff size={12} /> 离线
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Cloud size={12} /> 本地
          </span>
        );
    }
  };

  return (
    <div className="pb-20">
      <PageHeader title="设置" />

      <div className="card mb-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">工资约束</h3>
        <div className="space-y-3">
          <div>
            <label className="label">月薪 (元)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="100"
              value={settings.monthlySalary || ''}
              onChange={(event) => settings.setMonthlySalary(Math.max(0, parseInt(event.target.value) || 0))}
              placeholder="如：15000"
            />
          </div>
          <div>
            <label className="label">定投比例上限 (%)</label>
            <div className="flex items-center gap-3">
              <input
                className="input"
                type="number"
                min="1"
                max="100"
                value={settings.dcaRatioLimit}
                onChange={(event) =>
                  settings.setDCARatioLimit(Math.min(100, Math.max(1, parseInt(event.target.value) || 30)))
                }
              />
              <span className="text-sm text-gray-400">%</span>
            </div>
            <p className="mt-1 text-xs text-gray-400">月定投额超出月薪 x 此比例时触发告警</p>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700">品类管理</h3>
          <button
            onClick={() => {
              setEditingCategory(null);
              setCategoryModalOpen(true);
            }}
            className="btn-ghost text-xs"
          >
            <Plus size={14} />
            添加
          </button>
        </div>

        {deleteError && <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-500">{deleteError}</div>}

        <div className="space-y-1">
          {categories.map((category) => (
            <div key={category.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">
              <div className="h-3 w-3 flex-shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
              <span className="flex-1 text-sm text-gray-700">{category.name}</span>
              {category.isBuiltin && <span className="text-xs text-gray-400">内置</span>}
              <button
                onClick={() => {
                  setEditingCategory({
                    id: category.id,
                    name: category.name,
                    color: category.color,
                  });
                  setCategoryModalOpen(true);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-200"
                title="编辑"
              >
                <Pencil size={13} />
              </button>
              {!category.isBuiltin && (
                <button
                  onClick={() => handleCategoryDelete(category.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-100 hover:text-red-500"
                  title="删除"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={() => navigate('/watchlist')} className="btn-secondary mt-3 w-full justify-between">
          <span className="flex items-center gap-2">
            <Star size={16} />
            自选管理
          </span>
          <span className="text-xs text-gray-400">{settings.watchlist.length} 条</span>
        </button>
      </div>

      <div className="card mb-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">数据管理</h3>
        <div className="space-y-2">
          <button onClick={() => setSnapshotModalOpen(true)} className="btn-secondary w-full justify-between">
            <span className="flex items-center gap-2">
              <History size={16} />
              历史记录
            </span>
            <span className="text-xs text-gray-400">{snapshots.length} 条记录</span>
          </button>

          <button onClick={handleExport} className="btn-secondary w-full justify-between">
            <span className="flex items-center gap-2">
              {exported ? <Check size={16} className="text-green-500" /> : <Download size={16} />}
              {exported ? '已导出' : '导出 JSON'}
            </span>
            <span className="text-xs text-gray-400">备份到本地</span>
          </button>

          <button onClick={handleImport} className="btn-secondary w-full justify-between">
            <span className="flex items-center gap-2">
              <Upload size={16} />
              导入 JSON
            </span>
            <span className="text-xs text-gray-400">恢复备份</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />

          <button
            onClick={() => {
              if (window.confirm('确定要清空所有数据吗？此操作不可恢复。')) {
                clearAll();
              }
            }}
            className="btn-secondary w-full justify-between !text-red-500 hover:!bg-red-50"
          >
            <span className="flex items-center gap-2">
              <Trash2 size={16} />
              清空所有数据
            </span>
            <span className="text-xs">不可恢复</span>
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <KeyRound size={15} />
          身份校验
        </h3>

        {!hasIdentity() || editingIdentity ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">
              输入一个只有你知道的密码作为数据钥匙。不同密码对应不同的云端数据，互相隔离。请用足够强的密码，别告诉别人。
            </p>
            <input
              type="password"
              className="input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="输入密码（至少 4 位）"
            />
            {identityError && <div className="text-xs text-red-500">{identityError}</div>}
            <button onClick={handleSetIdentity} className="btn-primary w-full text-sm">
              {hasIdentity() ? '切换身份' : '启用同步'}
            </button>
            {hasIdentity() && (
              <button
                onClick={() => {
                  setEditingIdentity(false);
                  setPin('');
                  setIdentityError('');
                }}
                className="btn-ghost w-full text-xs"
              >
                取消
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-gray-700">身份已设置</div>
                <div className="text-xs text-gray-400 font-mono">指纹 {getSyncUserId().slice(0, 8)}</div>
              </div>
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check size={12} /> 已启用
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditingIdentity(true)} className="btn-secondary flex-1 text-sm">
                <Pencil size={14} /> 修改身份
              </button>
              <button onClick={handleClearIdentity} className="btn-secondary flex-1 text-sm !text-red-500 hover:!bg-red-50">
                <Trash2 size={14} /> 清除身份
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card mb-4">
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          云同步 {syncStatusDisplay()}
        </h3>

        {!isSupabaseConfigured() && (
          <div className="mb-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
            未配置云同步。在 <code className="text-primary-600">.env</code> 或 GitHub Secrets 配置
            <code className="text-primary-600"> VITE_SUPABASE_URL</code>、
            <code className="text-primary-600"> VITE_SUPABASE_ANON_KEY</code> 后自动启用，无需登录。
          </div>
        )}

        <div className="space-y-3">
          <p className="text-xs text-gray-400">
            数据自动同步：任何修改自动上传，打开或切回页面时自动拉取，多台设备实时同步。
          </p>
          <div className="flex gap-2">
            <button onClick={() => pullNow()} disabled={syncStatus === 'syncing'} className="btn-primary flex-1 text-sm">
              <RefreshCw size={16} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              {syncStatus === 'syncing' ? '同步中...' : '立即同步'}
            </button>
            <button onClick={() => pushNow()} disabled={syncStatus === 'syncing'} className="btn-secondary text-sm">
              <Cloud size={16} /> 上传
            </button>
          </div>
        </div>
      </div>

      <SnapshotManageModal
        open={snapshotModalOpen}
        onClose={() => setSnapshotModalOpen(false)}
        snapshots={snapshots}
        removeSnapshot={removeSnapshot}
        restoreSnapshot={restoreSnapshot}
      />

      <CategoryManageModal
        open={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
          setDeleteError('');
        }}
        editingId={editingCategory?.id}
        initialName={editingCategory?.name}
        initialColor={editingCategory?.color}
      />
    </div>
  );
}
