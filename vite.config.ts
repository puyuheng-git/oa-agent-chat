/// <reference types="vitest" />
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:8000'

  return {
    plugins: [vue()],
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
    server: {
      // 固定 127.0.0.1，避免 Vite 默认打印/绑定 localhost（部分环境 IPv6 ::1 解析异常）
      host: '127.0.0.1',
      proxy: {
        '/v1': apiBase,
        '/healthz': apiBase,
        '/readyz': apiBase,
      },
    },
    preview: {
      host: '127.0.0.1',
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  }
})
