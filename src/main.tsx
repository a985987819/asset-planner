// ============================================================
// 应用入口
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// animal-island-ui 样式必须在任何组件渲染前引入（仅此一处）
import 'animal-island-ui/style';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
