// ============================================================
// 品类管理弹窗
// ============================================================

import { useEffect, useState } from 'react';
import { Button, Input } from 'animal-island-ui';
import { useSettingsStore } from '@/stores/settingsStore';
import { CATEGORY_PRESET_COLORS } from '@/types';
import { Modal } from '@/components/ui/Modal';

interface CategoryManageModalProps {
  open: boolean;
  onClose: () => void;
  editingId?: string;          // 编辑已有品类
  initialName?: string;
  initialColor?: string;
}

export function CategoryManageModal({
  open,
  onClose,
  editingId,
  initialName = '',
  initialColor = CATEGORY_PRESET_COLORS[0],
}: CategoryManageModalProps) {
  const { addCategory, updateCategory, categories } = useSettingsStore();

  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [error, setError] = useState('');

  // 组件在设置页常驻挂载：每次打开时同步 props 到表单（修复编辑第二个品类时显示旧值的问题）
  useEffect(() => {
    if (open) {
      setName(initialName);
      setColor(initialColor);
      setError('');
    }
  }, [open, initialName, initialColor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('品类名称不能为空');
      return;
    }

    // 检查重名（排除自身）
    const duplicate = categories.find(
      (c) => c.name === trimmed && c.id !== editingId
    );
    if (duplicate) {
      setError('已存在同名品类');
      return;
    }

    if (editingId) {
      updateCategory(editingId, { name: trimmed, color });
    } else {
      addCategory(trimmed, color);
    }

    setName('');
    setColor(CATEGORY_PRESET_COLORS[0]);
    setError('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setError('');
        onClose();
      }}
      title={editingId ? '编辑品类' : '添加品类'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">名称</label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="如 股票、加密货币"
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </div>

        <div>
          <label className="label">颜色</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {CATEGORY_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? '#1e293b' : 'transparent',
                  boxShadow: color === c ? '0 0 0 2px white, 0 0 0 4px ' + c : 'none',
                }}
                title={c}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <label className="text-xs text-gray-500">自定义:</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
            />
            <Input
              className="w-28"
              size="small"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#000000"
            />
          </div>
        </div>

        <Button htmlType="submit" type="primary" block>
          {editingId ? '保存' : '添加'}
        </Button>
      </form>
    </Modal>
  );
}
