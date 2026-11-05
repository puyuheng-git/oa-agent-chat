# oa-agent-chat

东审财税 OA **员工智能问答（对话壳）** 独立静态前端，自 monorepo [`puyuheng-git/oa-agent`](https://github.com/puyuheng-git/oa-agent) 的 `frontend/chat` 拆出（STD-009）。仅包含对话页，不含管理后台与安装向导。

技术栈：Vue 3 + Vite + Element Plus。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_API_BASE_URL` | 生产必填 | Agent Orchestrator API 根地址（**不含** `/v1/chat`）。示例：`https://agent-api.example.com`。构建时注入；本地 `npm run dev` 未设置时默认通过 Vite 代理转发到 `http://127.0.0.1:8000`。 |

复制 `.env.example` 为 `.env.local` 后填写：

```bash
VITE_API_BASE_URL=https://your-agent-api.example.com
```

所有聊天接口仍使用相对路径 `/v1/chat/*`，由上述 base 拼接；**请勿修改**请求/响应 JSON 契约。

## 本地开发

```bash
npm ci
npm run dev
```

开发服通过 `vite --host 127.0.0.1` 固定监听 **`http://127.0.0.1:5173/`**（请用该地址打开，不要用 `localhost`，以免落到 `::1`）。浏览器需带有效 `?launch=...`（一般由 OA 302 注入）。无 `launch` 时会进入 `no_launch` 状态。

## 构建与部署

```bash
npm ci
npm run build
```

产物在 `dist/`。将 **整个 `dist` 目录** 部署到静态站点（Nginx、OSS+CDN、S3 等均可）。

### OA 侧如何指向本静态 URL

1. **全页助手**：OA `assistant_host.php` 换码成功后 302 到  
   `{CHAT_STATIC_URL}/?launch={launch_code}`（可选 `&embed=1` 用于 iframe 内嵌）。
2. **悬浮挂件**：OA 页面配置 `window.oaAgentConfig.hostUrl` 指向 OA 宿主页；宿主页完成换码后 302 到  
   `{CHAT_STATIC_URL}/?launch={launch_code}&embed=1`。  
   挂件脚本使用本仓库 `public/embed.js`（部署后 URL 如 `{CHAT_STATIC_URL}/embed.js`）。

`embed=1` 时对话壳隐藏自身页头，并通过 `postMessage` 与 OA 宿主页协作：

| 消息 `type` | 方向 | 含义 |
|-------------|------|------|
| `oa-agent-chat:relaunch` | iframe → OA | 会话失效，请求 OA 重新签发 launch 并刷新 iframe |
| `oa-agent-chat:relaunch-ack` | OA → iframe | 已处理重新进入（可选，3 秒内收到则不再提示失败） |
| `oa-agent-chat:back-to-oa` | iframe → OA | 用户点击「回 OA」 |

### CSP 与 iframe 嵌入（静态托管侧配置）

**`frame-ancestors` 由静态站点响应头（或 CDN 策略）配置**，Agent 进程本身不负责允许哪些 OA 域名嵌入。

示例（Nginx，按实际 OA 域名替换）：

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://oa.example.com https://*.oa.example.com" always;
```

同时确保静态资源允许跨域访问 API：`VITE_API_BASE_URL` 指向的 Orchestrator 需为聊天域名配置 CORS（含 `Authorization` 头）。对话壳对跨域 API 使用 Bearer ticket，不依赖 API  Cookie。

## 页面状态

| 状态 | 说明 |
|------|------|
| `loading` | 换票与拉会话；≥3s 显示「正在连接…」；≥15s 或网络/CORS/持续 5xx → `orchestrator_down` |
| `no_launch` | 无 `launch` 参数，提示仅从 OA 打开 |
| `ready` | 正常对话 |
| `expired` | 401 或会话失效；主按钮「重新进入」（embed 时 postMessage） |
| `orchestrator_down` | 服务不可达；「重试」与「回 OA」 |

鉴权：ticket 仅存内存，**无静默 refresh**；过期须从 OA 重新进入。

## 验证步骤

1. 从 OA 打开助手（或带真实 `launch` 的 URL）→ 进入对话 → 提问 → 确认 **SSE 流式**回复 → 停止/重试。
2. 等待 ticket 过期或后端返回 401 → 应进入 `expired` → 点击「重新进入」（embed 下 OA 应响应 `relaunch`）。
3. 停止 Orchestrator 或故意填错 `VITE_API_BASE_URL` → 应进入 `orchestrator_down`，重试与「回 OA」可用。

## 脚本

```bash
npm run dev      # 开发
npm run build    # 类型检查 + 生产构建
npm test         # Vitest 单元测试
npm run preview  # 预览 dist
```

## CI

推送至 GitHub 时 `.github/workflows/ci.yml` 执行 `npm test` 与 `npm run build`。
