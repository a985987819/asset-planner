// ============================================================
// 自选基金列表页
// ============================================================

import { useRef, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Star, Upload } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCategories } from '@/hooks/useCategories';
import { importWatchlistFromFile } from '@/lib/watchlistImport';
import type { WatchlistItem } from '@/types';
import { PageHeader, EmptyState } from '@/components/ui/Common';
import { Modal } from '@/components/ui/Modal';

interface WatchlistForm {
  code: string;
  name: string;
  categoryId: string;
  notes: string;
}

const emptyForm: WatchlistForm = {
  code: '',
  name: '',
  categoryId: '',
  notes: '',
};

export default function WatchlistPage() {
  const { watchlist, addWatchlistItem, updateWatchlistItem, deleteWatchlistItem } =
    useSettingsStore();
  const { categories, getLabel, getColor } = useCategories();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WatchlistForm>(emptyForm);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setImporting(true);
    try {
      const r = await importWatchlistFromFile(file);
      alert(
        `导入完成：新增 ${r.added} 条` +
          (r.skipped > 0 ? `，跳过重复 ${r.skipped} 条` : '') +
          (r.missingCategory > 0 ? `，${r.missingCategory} 条品类未识别已归入默认品类` : '')
      );
    } catch {
      alert('导入失败：请使用 .xlsx 文件（表头：代码、名称、品类、备注）');
    } finally {
      setImporting(false);
    }
  };

  // 筛选
  const filtered = search.trim()
    ? watchlist.filter(
        (w) =>
          w.name.toLowerCase().includes(search.toLowerCase()) ||
          w.code.toLowerCase().includes(search.toLowerCase())
      )
    : watchlist;

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? '' });
    setModalOpen(true);
  };

  const openEdit = (item: WatchlistItem) => {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      categoryId: item.categoryId,
      notes: item.notes,
    });
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    if (editingId) {
      updateWatchlistItem(editingId, {
        code: form.code.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        notes: form.notes.trim(),
      });
    } else {
      addWatchlistItem({
        code: form.code.trim(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        notes: form.notes.trim(),
      });
    }
    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('确定要移除该自选条目吗？')) {
      deleteWatchlistItem(id);
    }
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="自选管理"
        subtitle="预先维护关注的基金/股票，添加资产时可直接选择"
        action={
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary text-sm">
              <Upload size={16} />
              导入
            </button>
            <button onClick={openAdd} className="btn-primary text-sm">
              <Plus size={16} />
              添加
            </button>
          </div>
        }
      />

      {/* 搜索 */}
      {watchlist.length > 0 && (
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索代码或名称..."
          />
        </div>
      )}

      {/* 列表 */}
      {watchlist.length === 0 ? (
        <EmptyState
          icon={<Star size={48} />}
          title="还没有自选条目"
          description="添加关注的基金/股票，之后在底仓和定投页面可以直接选择"
          action={
            <button onClick={openAdd} className="btn-primary">
              <Plus size={16} />
              添加自选
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-8">
          没有匹配 "{search}" 的自选条目
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.id} className="card flex items-center gap-3 py-3 px-4">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: getColor(item.categoryId) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {item.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {item.code && (
                    <span className="text-xs text-gray-400 font-mono">
                      {item.code}
                    </span>
                  )}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: getColor(item.categoryId) + '20',
                      color: getColor(item.categoryId),
                    }}
                  >
                    {getLabel(item.categoryId)}
                  </span>
                </div>
                {item.notes && (
                  <div className="text-xs text-gray-400 mt-1 truncate">
                    {item.notes}
                  </div>
                )}
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  onClick={() => openEdit(item)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑弹窗 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '编辑自选' : '添加自选'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">代码（选填）</label>
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="如 510300, 000001"
            />
          </div>
          <div>
            <label className="label">名称 *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如 沪深300ETF"
              required
            />
          </div>
          <div>
            <label className="label">品类</label>
            <select
              className="select"
              value={form.categoryId}
              onChange={(e) =>
                setForm({ ...form, categoryId: e.target.value })
              }
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">备注（选填）</label>
            <input
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="如 跟踪沪深300指数"
            />
          </div>
          <button type="submit" className="btn-primary w-full">
            {editingId ? '保存修改' : '添加'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
