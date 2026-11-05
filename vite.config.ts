/// <reference types="vitest" />
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 开发代理目标：仅服务端使用。勿把本地后端写进 VITE_API_BASE_URL，否则浏览器跨端口直连会 CORS。
  const proxyTarget =
    env.DEV_API_PROXY_TARGET?.replace(/\/$/, '') ||
    env.VITE_API_BASE_URL?.replace(/\/$/, '') ||
    'http://127.0.0.1:8765'

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
      // 固定 IPv4 环回；npm scripts 另传 --host 127.0.0.1，双保险避免落到 localhost/::1
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      hmr: {
        host: '127.0.0.1',
        port: 5173,
      },
      proxy: {
        '/v1': proxyTarget,
        '/healthz': proxyTarget,
        '/readyz': proxyTarget,
      },
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
    },
  }
})
