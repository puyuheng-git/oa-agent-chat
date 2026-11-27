import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** 独立构建 OA 宿主页脚本 page-agent.js（IIFE，随静态站分发）。 */
export default defineConfig({
  // 产物写入 public，供 SPA build 复制到 dist；关闭 publicDir 避免 outDir===publicDir 警告
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: 'public',
    lib: {
      entry: resolve(__dirname, 'src/page-agent/host/main.ts'),
      name: 'OaPageAgent',
      formats: ['iife'],
      fileName: () => 'page-agent.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'page-agent.js',
      },
    },
  },
})
