import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // PWA:离线可用的应用外壳 + 可安装到手机主屏
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon.svg'],
      manifest: {
        name: '资产配置规划',
        short_name: '资产规划',
        description: '底仓管理、每日定投统计、趋势回溯与快照对比',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'zh-CN',
        background_color: '#f8f8f0',
        theme_color: '#f7f3df',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 排除超大 CJK 字体分片(约 3.4MB):离线时回退系统中文字体,控制安装体积
        globIgnores: ['**/noto-sans-sc-chinese*'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  base: '/asset-planner/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
