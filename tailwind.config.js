/** @type {import('tailwindcss').Config} */
// 色板整体对齐 animal-island-ui 的 --animal-* 设计 token（薄荷青主色 / 大地棕文字 / 暖羊皮纸中性色），
// 使页面既有的 text-gray-*、bg-primary-* 等类自动落在同一套色板内。
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f9f6',
          100: '#c9f1ea',
          200: '#9fe5da',
          300: '#6dd8c9',
          400: '#3dd4c6',
          500: '#19c8b9',
          600: '#15ab9e',
          700: '#128f85',
          800: '#0f736b',
          900: '#0b574f',
          950: '#08403a',
        },
        danger: {
          50: '#fdecec',
          100: '#fad6d6',
          500: '#e05a5a',
          600: '#c94444',
        },
        success: {
          50: '#f2f8e6',
          100: '#e2f0cb',
          500: '#6fba2c',
          600: '#5a9e1e',
        },
        warning: {
          50: '#fdf6df',
          100: '#fbeab2',
          500: '#f5c31c',
          600: '#dba90e',
        },
        // 常用语义色（red/green/yellow）同样对齐 animal-island-ui 的状态色，
        // 覆盖后未列出的色阶不可再用（Tailwind extend 对整组替换）
        red: {
          50: '#fdecec',
          100: '#fad6d6',
          200: '#f5bcbc',
          300: '#ef9d9d',
          400: '#e87f7f',
          500: '#e05a5a',
          600: '#c94444',
          700: '#a83838',
        },
        green: {
          50: '#f2f8e6',
          100: '#e2f0cb',
          200: '#c9e4a2',
          300: '#aed679',
          400: '#93ca50',
          500: '#6fba2c',
          600: '#5a9e1e',
          700: '#4a8519',
        },
        yellow: {
          50: '#fdf6df',
          100: '#fbeab2',
          200: '#f8dd85',
          300: '#f6cf58',
          400: '#f5c92f',
          500: '#f5c31c',
          600: '#dba90e',
          700: '#b8890b',
        },
        gray: {
          50: '#fbf9f2',
          100: '#f1ecdf',
          200: '#e8e2d6',
          300: '#dcd8d1',
          400: '#b3a68f',
          500: '#9f927d',
          600: '#82715a',
          700: '#6f5f45',
          800: '#794f27',
          900: '#5d4326',
        },
      },
      fontFamily: {
        sans: [
          'Nunito',
          '"Noto Sans SC"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
