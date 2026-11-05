# oa-agent-chat 部署指南

东审财税 OA **员工智能问答（对话壳）** 静态前端的生产部署说明。本仓库只产出静态资源（`dist/`），不包含 Agent Orchestrator、管理后台或安装向导。

技术栈：Vue 3 + Vite + Element Plus。Node.js 建议 **20 LTS**（与 CI 一致）。

## 1. 架构与依赖

```
OA（换码 / 302）
        │  ?launch=...[&embed=1]
        ▼
对话壳静态站（本仓库 dist）  ──Bearer ticket──►  Agent Orchestrator API
        │                                         （VITE_API_BASE_URL）
        │ postMessage（仅 embed）
        ▼
OA 宿主页（iframe 父页）
```

部署前请确认：

| 依赖 | 说明 |
|------|------|
| Agent Orchestrator | 已对外提供 HTTPS API，聊天契约为 `/v1/chat/*` |
| OA 换码入口 | `assistant_host.php`（或等价宿主）可 302 到本静态站 |
| HTTPS | 生产对话壳与 API 均建议 HTTPS；混合内容会导致浏览器拦截 |
| CORS | Orchestrator 须允许对话壳源，并允许 `Authorization` 头 |

本仓库**不**负责 OA PHP、Orchestrator 进程或数据库。

## 2. 环境变量

| 变量 | 必填 | 注入时机 | 说明 |
|------|------|----------|------|
| `VITE_API_BASE_URL` | **生产必填** | **构建时** | Orchestrator API 根地址，**不含** `/v1/chat`。示例：`https://agent-api.example.com` |

要点：

- Vite 会把 `VITE_*` 打进前端包；改 API 地址必须**重新构建**，不能只改运行时环境变量。
- 末尾斜杠可有可无，运行时会去掉。
- 本地 `npm run dev` 未设置时，请求走 Vite 代理到 `http://127.0.0.1:8000`。
- 生产设置了该变量后，请求使用 `credentials: 'omit'` + Bearer ticket，**不依赖** API Cookie。

```bash
cp .env.example .env.production.local
# 编辑：
# VITE_API_BASE_URL=https://agent-api.example.com
```

也可用 CI / 构建命令内联注入（不必落盘）：

```bash
VITE_API_BASE_URL=https://agent-api.example.com npm run build
```

## 3. 构建

```bash
git clone https://github.com/puyuheng-git/oa-agent-chat.git
cd oa-agent-chat
npm ci
VITE_API_BASE_URL=https://agent-api.example.com npm run build
```

产物：

| 路径 | 用途 |
|------|------|
| `dist/index.html` | 对话页入口 |
| `dist/assets/*` | JS/CSS（带内容哈希，可长期缓存） |
| `dist/embed.js` | OA 悬浮挂件脚本（来自 `public/embed.js`） |

构建脚本会先跑 `vue-tsc --noEmit` 再 `vite build`。也可先跑测试：

```bash
npm test
npm run build
```

本地预览产物：

```bash
npm run preview
```

## 4. 静态托管

将 **整个 `dist` 目录** 发布到任意静态站点。常见选项：

- Nginx / Caddy 本机或容器
- 对象存储 + CDN（OSS、S3、COS 等）
- 任意静态托管（Netlify、Cloudflare Pages 等）

记一个对外根 URL，下文记为 `{CHAT_STATIC_URL}`，例如 `https://agent-chat.example.com`（无尾斜杠）。

### 4.1 Nginx 示例

```nginx
server {
    listen 443 ssl http2;
    server_name agent-chat.example.com;

    # ssl_certificate     ...;
    # ssl_certificate_key ...;

    root /var/www/oa-agent-chat/dist;
    index index.html;

    # 允许 OA 域名把对话壳嵌进 iframe（按实际 OA 域名替换）
    add_header Content-Security-Policy "frame-ancestors 'self' https://oa.example.com https://*.oa.example.com" always;

    # 带哈希的静态资源可长期缓存
    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # embed.js 发布后可能被多页引用，建议短缓存或发布后主动刷新 CDN
    location = /embed.js {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=300";
        add_header Content-Type "application/javascript; charset=utf-8";
    }

    # SPA：未知路径回退到 index.html（保留 query，如 ?launch=）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 4.2 对象存储 + CDN

1. 上传 `dist/` 全部文件到 bucket（保持相对路径）。
2. 将 `index.html`、`embed.js` 设为较短缓存；`assets/*` 可设长缓存。
3. 在 CDN / 边缘配置：
   - 默认文档：`index.html`
   - SPA 回退：未命中对象时返回 `index.html`（HTTP 200）
   - 响应头：`Content-Security-Policy: frame-ancestors ...`（同上）
4. 绑定 HTTPS 域名作为 `{CHAT_STATIC_URL}`。

### 4.3 Docker（可选，Nginx 镜像）

仓库本身无 Dockerfile；若需容器化，可在构建机先产出 `dist`，再拷入官方 Nginx 镜像，例如：

```dockerfile
# 多阶段示例（构建机需能访问 npm registry）
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# 自行挂载或 COPY 含 frame-ancestors / try_files 的 nginx.conf
EXPOSE 80
```

构建：

```bash
docker build --build-arg VITE_API_BASE_URL=https://agent-api.example.com -t oa-agent-chat:latest .
```

## 5. Orchestrator CORS

对话壳在生产对 API 使用跨域 `fetch` + `Authorization: Bearer …`。Orchestrator 须对 `{CHAT_STATIC_URL}` 源放行，至少包含：

- `Access-Control-Allow-Origin`：对话壳源（或等价白名单）
- `Access-Control-Allow-Headers`：含 `Authorization`、`Content-Type`、`Idempotency-Key`、`X-CSRF-Token`（若后端会校验）
- `Access-Control-Allow-Methods`：含 `GET`、`POST`、`PATCH`、`DELETE`、`OPTIONS`
- 若使用 SSE（`/v1/chat/messages/stream`），确保代理/网关不缓冲流式响应

健康检查（可选，运维侧）：`GET {VITE_API_BASE_URL}/healthz`、`/readyz`。

## 6. OA 侧配置

### 6.1 全页助手

OA `assistant_host.php`（或等价）换码成功后 302 到：

```text
{CHAT_STATIC_URL}/?launch={launch_code}
```

可选 `&embed=1`（全页一般不需要）。

### 6.2 悬浮挂件（iframe）

1. OA 页面配置宿主换码地址，例如：

```html
<script>
  window.oaAgentConfig = {
    hostUrl: '/general/ds/agent/assistant_host.php?mode=embed',
    // 可选：title / primaryColor / width / height / right / bottom
  }
</script>
<script src="{CHAT_STATIC_URL}/embed.js" charset="utf-8" defer></script>
```

2. 宿主页完成换码后 302 到：

```text
{CHAT_STATIC_URL}/?launch={launch_code}&embed=1
```

`embed=1` 时对话壳隐藏自身页头，并通过 `postMessage` 与 OA 协作：

| `type` | 方向 | 含义 |
|--------|------|------|
| `oa-agent-chat:relaunch` | iframe → OA | 会话失效，请重新签发 launch 并刷新 iframe |
| `oa-agent-chat:relaunch-ack` | OA → iframe | 已处理重新进入（可选；3 秒内收到则不再提示失败） |
| `oa-agent-chat:back-to-oa` | iframe → OA | 用户点击「回 OA」 |

### 6.3 CSP / iframe

`frame-ancestors` **必须**在静态站（或 CDN）响应头配置；Agent 进程不负责允许哪些 OA 域名嵌入。若 OA 被 CSP `frame-src` / `child-src` 限制，也需把 `{CHAT_STATIC_URL}` 加入 OA 侧白名单。

## 7. 发布检查清单

构建与发布：

- [ ] `VITE_API_BASE_URL` 指向正确的生产 Orchestrator（无 `/v1/chat` 后缀）
- [ ] `npm ci && npm test && npm run build` 通过
- [ ] `dist/` 完整上传；`embed.js` 可被公网访问
- [ ] HTTPS 证书有效；`index.html` SPA 回退正常

联调：

- [ ] 从 OA 打开助手 → 带 `launch` 进入对话 → SSE 流式回复正常
- [ ] ticket 过期 / 401 → `expired` →「重新进入」（embed 下 OA 响应 `relaunch`）
- [ ] 停 Orchestrator 或错填 API → `orchestrator_down`，「重试 / 回 OA」可用
- [ ] 浏览器控制台无 CORS / CSP / 混合内容报错
- [ ] 无 `launch` 直开静态 URL → `no_launch`（预期行为）

安全：

- [ ] `launch` 为一次性码；前端会尽快从地址栏移除，仍勿在日志中长期保留完整带码 URL
- [ ] ticket 仅存内存，无静默 refresh；过期须从 OA 重新进入
- [ ] 勿把含密钥的 `.env*.local` 提交进仓库

## 8. 回滚与更新

1. **回滚静态站**：保留上一版 `dist` 产物（或对象存储版本），整体替换当前目录即可；带哈希的 `assets` 与旧 `index.html` 配套回滚。
2. **改 API 地址**：修改 `VITE_API_BASE_URL` 后重新构建并发布完整 `dist`。
3. **只改挂件**：可单独替换 `embed.js`；注意 CDN 缓存，必要时刷新或改 query 版本号。
4. **契约变更**：`/v1/chat/*` 请求/响应 JSON **请勿单侧修改**；前后端需同步发版。

## 9. CI

推送至 GitHub 时 `.github/workflows/ci.yml` 在 Node 20 上执行 `npm test` 与 `npm run build`。  
注意：CI 默认**未**注入生产 `VITE_API_BASE_URL`；生产构建请在发布流水线或本机显式传入该变量。

## 10. 故障速查

| 现象 | 可能原因 |
|------|----------|
| 页面一直 `no_launch` | 未从 OA 打开，或 URL 无 `launch` |
| `orchestrator_down` | API 不可达、CORS 失败、错误的 `VITE_API_BASE_URL`、网关 5xx |
| iframe 空白 / 被拒 | 静态站缺少 `frame-ancestors`，或 OA CSP 未放行对话壳域名 |
| 能进页但不能流式 | 代理缓冲 SSE；检查 `/v1/chat/messages/stream` |
| 改了 API 地址仍打旧站 | 未重新 `npm run build`，或 CDN 仍缓存旧 `index.html` / 旧 chunk |
| 挂件不出现 | 未配置 `window.oaAgentConfig.hostUrl`，或 `embed.js` 404 |

更完整的产品行为与页面状态说明见仓库根目录 [README.md](../README.md)。
