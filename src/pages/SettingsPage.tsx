import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  Trash2,
  Cloud,
  CloudOff,
  RefreshCw,
  LogIn,
  LogOut,
  History,
  Check,
  Pencil,
  Star,
  Plus,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useCategories } from '@/hooks/useCategories';
import { PageHeader } from '@/components/ui/Common';
import { CategoryManageModal } from '@/components/ui/CategoryManageModal';
import { SnapshotManageModal } from '@/components/snapshot/SnapshotManageModal';

export default function SettingsPage() {
  const settings = useSettingsStore();
  const auth = useAuthStore();
  const navigate = useNavigate();
  const {
    syncStatus,
    syncFromCloud,
    syncToCloud,
    exportAllData,
    importAllData,
    clearAll,
    snapshots,
    removeSnapshot,
    restoreSnapshot,
    setSyncStatus,
  } = usePortfolioStore();

  const { categories } = useCategories();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [exported, setExported] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{
    id: string;
    name: string;
    color: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const checkCategoryInAssets = (categoryId: string): boolean => {
    const { basePortfolios, dcaPortfolios } = usePortfolioStore.getState();
    const allAssets = [...basePortfolios.flatMap((portfolio) => portfolio.assets), ...dcaPortfolios.flatMap((portfolio) => portfolio.assets)];
    return allAssets.some((asset) => asset.category === categoryId);
  };

  useEffect(() => {
    const handleOnline = () => {
      setSyncStatus('idle');
      if (auth.user) syncToCloud();
    };
    const handleOffline = () => setSyncStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) setSyncStatus('offline');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [auth.user, setSyncStatus, syncToCloud]);

  const handleExport = () => {
    const json = exportAllData();
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
      const success = importAllData(json);
      alert(success ? '数据导入成功' : '导入失败：文件格式不正确');
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoginLoading(true);
    const result = await auth.signIn(email.trim());
    setLoginMessage(result.message);
    setLoginLoading(false);
    if (result.success) setEmail('');
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

  const syncStatusDisplay = () => {
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
        <h3 className="mb-3 text-sm font-medium text-gray-700">
          云同步 {syncStatusDisplay()}
        </h3>

        {!isSupabaseConfigured() && (
          <div className="mb-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-500">
            未配置 Supabase。创建 <code className="text-primary-600">.env</code> 文件设置环境变量后即可启用云同步。
          </div>
        )}

        {auth.user ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-green-50 p-3">
              <div>
                <div className="text-sm font-medium text-green-700">已登录</div>
                <div className="text-xs text-green-600">{auth.user.email}</div>
              </div>
              <button onClick={() => auth.signOut()} className="btn-ghost text-xs text-red-500">
                <LogOut size={14} /> 登出
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => syncFromCloud()} disabled={syncStatus === 'syncing'} className="btn-primary flex-1 text-sm">
                <RefreshCw size={16} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                {syncStatus === 'syncing' ? '同步中...' : '同步数据'}
              </button>
              <button onClick={() => syncToCloud()} disabled={syncStatus === 'syncing'} className="btn-secondary text-sm">
                <Cloud size={16} /> 上传
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="输入邮箱地址"
                required
              />
            </div>
            {loginMessage && (
              <div
                className={`rounded-lg p-2 text-xs ${
                  loginMessage.includes('失败') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                }`}
              >
                {loginMessage}
              </div>
            )}
            <button type="submit" disabled={loginLoading || !isSupabaseConfigured()} className="btn-primary w-full">
              <LogIn size={16} />
              {loginLoading ? '发送中...' : '发送登录链接'}
            </button>
            <p className="text-center text-xs text-gray-400">使用 Magic Link 免密码登录，验证链接将发送到你的邮箱。</p>
          </form>
        )}
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
