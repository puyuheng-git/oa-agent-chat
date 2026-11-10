# oa-agent-chat

东审财税 OA **员工智能问答（对话壳）** 独立静态前端。
本仓库**只**包含员工对话页与悬浮挂件脚本，**不含**管理后台与安装向导（二者由 Agent Orchestrator 进程托管，见下文「后端管理对接」）。

| 项 | 说明 |
|----|------|
| 技术栈 | Vue 3 + Vite + TypeScript + Element Plus |
| Node | 建议 18+（推荐 20 LTS） |
| 产物 | `dist/` 静态资源（`index.html`、`assets/*`、`embed.js`） |
| 上游 API | Agent Orchestrator 的 `/v1/chat/*` |

---

## 目录

1. [架构总览](#1-架构总览)
2. [项目目录结构](#2-项目目录结构)
3. [环境变量](#3-环境变量)
4. [本地开发](#4-本地开发)
5. [构建与部署](#5-构建与部署)
6. [OA 端交互对接](#6-oa-端交互对接)
7. [后端管理对接](#7-后端管理对接)
8. [Orchestrator API 契约](#8-orchestrator-api-契约)
9. [页面状态与验收](#9-页面状态与验收)
10. [脚本与测试](#10-脚本与测试)
11. [故障速查](#11-故障速查)

---

## 1. 架构总览

```
员工浏览器
    │
    ├─ 全页：OA 宿主换码 ──302──► 对话壳静态站/?launch=...
    │                              │
    └─ 挂件：embed.js → iframe      │
           请求 OA hostUrl          │
           OA 换码 302 ─────────────┘
                                    │
                    POST /v1/chat/session { launch_code }
                                    ▼
                         Agent Orchestrator
                         （管理后台 /admin/、换码 /v1/chat/launch、对话 /v1/chat/*）
                                    │
                         Bearer ticket（仅浏览器内存）
```

职责边界：

| 组件                                | 做什么                                                                              | 不做什么                              |
| --------------------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| **OA 宿主**（`assistant_host.php` 等） | 校验 OA 登录；签 assertion；向 Agent 换一次性 `launch_code`；302 到对话壳；embed 时响应 `postMessage` | 不渲染对话 UI；不把长期凭证塞进前端               |
| `embed.js`（本仓库）                   | 在 OA 业务页画悬浮球 + iframe；iframe 先打开 OA `hostUrl`                                    | 不携带身份/密钥；不解析 launch               |
| **对话壳**（本仓库）                      | 读 `?launch=` / `?embed=`；换票；聊天 / SSE / 线程 / 记忆 / 附件                              | 不校验 OA Cookie；不自己生成 launch；不含管理后台 |
| **Agent Orchestrator**            | `/v1/chat/`*、管理后台、安装向导、Skill/Tool/配置中心                                           | 不托管员工对话静态页（STD-009 后）             |

身份链路：

1. **OA** 校验员工登录，服务端 POST Agent  `/v1/chat/launch` 换一次性 `launch_code`；
2. **对话壳**只吃 URL 上的 `launch`，POST `/v1/chat/session` 换 `ticket`；
3. 之后对话壳**只**用 `Authorization: Bearer {ticket}` 调 Agent，**不再**直接调 OA 接口。

---

## 2. 项目目录结构

```
oa-agent-chat/
├── index.html                 # Vite 入口 HTML
├── package.json
├── vite.config.ts             # 别名 @、dev 代理 /v1|/healthz|/readyz、Vitest
├── tsconfig.json
├── .env.example               # 环境变量模板
├── public/
│   └── embed.js               # OA 悬浮挂件（ES5，部署后为 {CHAT_STATIC_URL}/embed.js）
└── src/
    ├── env.d.ts
    ├── shared/                # 通用 HTTP / 剪贴板
    │   ├── http.ts            # apiUrl、request、ApiError、Idempotency-Key
    │   └── clipboard.ts
    └── chat/                  # 对话壳主包
        ├── main.ts            # createApp + Element Plus 中文
        ├── App.vue            # 启动态机、会话、发消息、轮询
        ├── api.ts             # /v1/chat/* 客户端封装
        ├── oa-relay.ts        # iframe ↔ OA postMessage
        ├── bootstrap-errors.ts
        ├── delivery.ts        # 结构化回复 → 交付摘要
        ├── empty-conversation.ts
        ├── theme.css
        ├── types.ts
        ├── agent/             # 任务态适配（含 Mock 演示）
        │   ├── adapter.ts
        │   └── status.ts
        └── components/        # 侧栏、消息、输入区、记忆面板等
```

核心实现入口：

- 鉴权与 API：`src/chat/api.ts`、`src/shared/http.ts`
- OA 协作：`src/chat/oa-relay.ts`、`public/embed.js`
- 启动与状态机：`src/chat/App.vue`

---

## 3. 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `VITE_API_BASE_URL` | **生产按部署方式** | Orchestrator API **根地址**（**不含** `/v1/chat`）。构建时打进前端包。与 API **同域反代**时可留空，走相对路径。 |
| `DEV_API_PROXY_TARGET` | 本地推荐 | 仅 `npm run dev`：Vite 把 `/v1`、`/healthz`、`/readyz` 代理到此后端。**不要**在本地把后端写成 `VITE_API_BASE_URL`，否则浏览器跨端口直连并触发 CORS。 |

本地 `.env.local` 示例（复制自 `.env.example`）：

```bash
# 本地留空，走同源代理
# VITE_API_BASE_URL=
DEV_API_PROXY_TARGET=http://127.0.0.1:8765
```

生产构建示例：

```bash
# 跨域直连 API 时：
VITE_API_BASE_URL=https://your-agent-api.example.com npm run build

# 同域 Nginx 反代 /v1/ 时：可留空
npm run build
```

所有聊天接口仍使用相对路径 `/v1/chat/*`；有 `VITE_API_BASE_URL` 时再拼到该 base。**请勿单侧修改**请求/响应 JSON 契约。

> Vite 会把 `VITE_*` 打进包；改 API 地址必须**重新构建**。

---

## 4. 本地开发

### 4.1 依赖

1. 本机已安装 Node.js 18+。
2. Agent Orchestrator 在本机可访问（默认 `http://127.0.0.1:8765`），并已完成安装向导 / 配置中心基础配置（见后端仓库运维手册）。

### 4.2 启动

```bash
# 终端 1：启动 Agent（在 oa-langGraph / oa-agent 仓库，端口与 DEV_API_PROXY_TARGET 一致）
# 例如：.\scripts\start.ps1 -BindHost 127.0.0.1 -Port 8765

# 终端 2：本仓库
cp .env.example .env.local   # 确认 VITE_API_BASE_URL 为空
npm ci
npm run dev
```

开发服固定 `http://127.0.0.1:5173/`（IPv4，避免落到 `localhost`/`::1`）。

浏览器请求同域 `/v1/chat/*`，由 Vite 代理到 `DEV_API_PROXY_TARGET`（默认 `http://127.0.0.1:8765`），无需 Orchestrator 配 CORS。

### 4.3 打开方式

| 方式 | URL | 说明 |
|------|-----|------|
| 正式链路 | `http://127.0.0.1:5173/?launch={真实 launch_code}` | 需先走 OA 或 Agent 换码；无 `launch` 进入 `no_launch` |
| 本地 UI 演示 | `http://127.0.0.1:5173/?demo=1` | **仅 DEV**：跳过换票，用本地 Mock 数据看布局 |

接通标志：

- `http://127.0.0.1:8765/healthz` 与经代理的 `http://127.0.0.1:5173/healthz` 均返回健康状态
- 带有效 `launch` 打开后能进入对话并看到 SSE 流式回复

管理后台（在 Agent 进程上，不在本仓库）：`http://127.0.0.1:8765/admin/`。

---

## 5. 构建与部署

### 5.1 构建

```bash
npm ci
npm test          # 建议发布前执行
# 同域反代：可留空 VITE_API_BASE_URL
# 跨域 API：必须注入
VITE_API_BASE_URL=https://agent-api.example.com npm run build
```

| 产物 | 用途 |
|------|------|
| `dist/index.html` | 对话页 |
| `dist/assets/*` | 带哈希 JS/CSS，可长期缓存 |
| `dist/embed.js` | OA 悬浮挂件 |

将 **整个** `dist` **目录** 部署到静态站点（Nginx、OSS+CDN、S3 等均可）。对外根 URL 记为 `{CHAT_STATIC_URL}`（无尾斜杠）。

### 5.2 推荐：与 API 同域反代（无 CORS）

页面与 `embed.js` 由本站返回，`/v1/` 反代到 Agent。对话壳用相对路径，Agent **不必**回 CORS 头。

```nginx
server {
    listen 443 ssl http2;
    server_name chat.example.com;
    root /var/www/oa-agent-chat/dist;
    index index.html;

    # 按实际 OA 域名替换；能否被 OA iframe 嵌入只看这里
    add_header Content-Security-Policy "frame-ancestors 'self' https://oa.example.com https://*.oa.example.com" always;

    location /v1/ {
        proxy_pass http://127.0.0.1:8765;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;          # SSE：/v1/chat/messages/stream
        proxy_read_timeout 120s;
    }

    location /assets/ {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /embed.js {
        try_files $uri =404;
        add_header Cache-Control "public, max-age=300";
        add_header Content-Type "application/javascript; charset=utf-8";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 5.3 跨域：静态站 + 独立 API 域名

1. 构建时设置 `VITE_API_BASE_URL=https://agent-api.example.com`。
2. Orchestrator 为对话壳源配置 CORS（含 `Authorization`、`Content-Type`、`Idempotency-Key`）。
3. 对话壳对跨域 API 使用 Bearer ticket + `credentials: 'omit'`，不依赖 API Cookie。
4. 静态站仍须配置 `frame-ancestors`（见上）。

### 5.4 对象存储 + CDN

1. 上传完整 `dist/`；`index.html` / `embed.js` 短缓存，`assets/*` 长缓存。
2. SPA 回退到 `index.html`（保留 query）。
3. 配置 `frame-ancestors`；绑定 HTTPS。

### 5.5 Docker（可选，仓库未自带 Dockerfile）

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build --build-arg VITE_API_BASE_URL=https://agent-api.example.com -t oa-agent-chat:latest .
```

### 5.6 回滚与更新

1. 整包回滚上一版 `dist`（`index.html` 与 hashed assets 配套）。
2. 改 API 地址 → 改变量后全量重建发布。
3. 只改挂件 → 可单独换 `embed.js` 并刷 CDN。
4. `/v1/chat/*` 契约变更 → 前后端同步发版。

---

## 6. OA 端交互对接

### 6.1 OA 侧环境变量（宿主页）

| 变量 | 说明 |
|------|------|
| `AGENT_URL` | Agent 根地址，用于服务端 `POST .../v1/chat/launch` |
| `CHAT_STATIC_URL` | 本对话静态站根 URL（页面与 `embed.js`） |
| `OA_ASSERTION_HMAC_SECRET` | 与 Agent 管理后台「OA 对接」中的 assertion HMAC 密钥一致 |

### 6.2 换码与落地 URL

OA 换码成功后须 **HTTP 302**（或等价跳转）到对话壳：

| 场景 | URL |
|------|-----|
| 全页助手 | `{CHAT_STATIC_URL}/?launch={launch_code}` |
| 悬浮挂件 / iframe | `{CHAT_STATIC_URL}/?launch={launch_code}&embed=1` |

| Query | 说明 |
|-------|------|
| `launch` | 一次性码。对话壳 `takeLaunchCode()` 读取后立刻从地址栏删除，降低进历史/Referer/截图泄露风险 |
| `embed=1` | 隐藏对话壳自身页头；「重新进入 / 回 OA」走 `postMessage` |

宿主页服务端流程（摘要）：

1. `inc/auth.php`（或等价）校验 OA 登录。
2. 构造 assertion：`{oa, uid?, display_name, exp(≤60s), nonce, iss:"oa-host", aud:"oa-langgraph"}`，HMAC-SHA256 签名（`display_name` 须先 GBK→UTF-8）。
3. 服务端 `POST {AGENT_URL}/v1/chat/launch`，body `{"assertion":"..."}` → `launch_code`（约 60 秒、一次性）。
4. 302 到上述落地 URL。assertion / office token **不下发浏览器**。

直开 `{CHAT_STATIC_URL}/`（无 `launch`）→ 页面状态 `no_launch`，提示仅从 OA 打开（预期行为）。

### 6.3 悬浮挂件（embed.js）

OA 业务页引入：

```html
<script>
  window.oaAgentConfig = {
    // 必填：OA 侧换码宿主（相对或绝对均可）
    hostUrl: '/general/ds/agent/assistant_host.php?mode=embed',
    // 可选
    title: 'OA 智能助手',
    primaryColor: '#1C64F2',
    width: '24rem',
    height: '40rem',
    right: '1.5rem',
    bottom: '1.5rem',
  }
</script>
<script src="{CHAT_STATIC_URL}/embed.js" charset="utf-8" defer></script>
```

要点：

- `charset="utf-8"` 必须保留（OA 页面常为 GBK）。
- 配置里**不能**有员工身份或密钥；iframe 先打到 OA `hostUrl`，由 OA 换码后再 302 到对话壳。
- 挂件标题栏「重新进入」会把 iframe `src` 重新设为带 `_t` 的 `hostUrl`，再次走 OA 换码。

### 6.4 embed 模式 postMessage

实现见 `src/chat/oa-relay.ts`。对话壳向 `window.parent` 发消息（当前 `targetOrigin` 为 `'*'`；OA 侧应按 `event.origin` / `event.data.type` 校验）。

| `type` | 方向 | 含义 |
|--------|------|------|
| `oa-agent-chat:relaunch` | iframe → OA | 会话失效，请求 OA 重新签发 launch 并刷新 iframe |
| `oa-agent-chat:relaunch-ack` | OA → iframe | 已处理重新进入（可选；对话壳最多等 3 秒） |
| `oa-agent-chat:back-to-oa` | iframe → OA | 用户点击「回 OA」 |

OA 宿主伪代码：

```js
window.addEventListener('message', function (ev) {
  // 生产请校验 ev.origin === 对话壳 origin
  var data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'oa-agent-chat:relaunch') {
    iframe.src = hostUrlWithCacheBust()
    iframe.contentWindow.postMessage({ type: 'oa-agent-chat:relaunch-ack' }, chatOrigin)
  }
  if (data.type === 'oa-agent-chat:back-to-oa') {
    closeAssistantUi()
  }
})
```

非 embed（全页）时：「重新进入」为 `location.reload()`（因 `launch` 已清掉，通常需用户从 OA 菜单再进）；「回 OA」走 `history.back()`。

### 6.5 CSP（双方）

**对话静态站**（谁可以嵌本站）：

```http
Content-Security-Policy: frame-ancestors 'self' https://oa.example.com https://*.oa.example.com
```

**OA 站点**若配置了 `frame-src` / `child-src`，须允许 `{CHAT_STATIC_URL}`。

Agent 进程**不**负责 `frame-ancestors`；管理后台里的「允许嵌入的 OA 域名」为历史配置，**不会**写进响应头。

---

## 7. 后端管理对接

本仓库**不包含**管理后台 UI。管理员在 **Agent Orchestrator** 上操作：

| 入口 | 说明 |
|------|------|
| `https://{Agent域名}/admin/` | 配置中心、Tool/Skill、流程、账号权限、运行与介入等 |
| `https://{Agent域名}/setup/` | 仅首次安装；完成后永久关闭 |

与本对话壳相关的后台配置：

| 配置位置 | 影响对话壳的表现 |
|----------|------------------|
| **连接配置 → OA 对接** | assertion HMAC、office-api / mint、成功码等；决定能否换 `launch_code` |
| **连接配置 → 运行参数** | 超时、限流、介入任务有效期等（与轮询上限相关） |
| **配置中心 → 员工对话等** | 会话响应中的 `message_max_chars`、`poll_interval_seconds`、`poll_max_minutes`、`chat` 开关等 |
| **Skill 管理 / Tool 管理** | 开会话返回的 `skills[]`（欢迎页能力名与近三天新能力示例） |
| **流程配置发布** | 实际执行图；进行中的运行仍按启动时版本 |
| **LLM 配置** | 意图/聊天模型；未配置时可走规则，查询类能力仍可用 |

会话换票成功后，后端把上述配置快照进 `ChatSessionInfo`，前端只读使用，**不**直接调 `/v1/admin/`*。

管理员与员工是两套身份：管理员不能代替员工确认业务操作；员工 ticket 只证明「经 OA 换码进入的本人会话」。

更完整的运维步骤见 Agent 仓库：`docs/ops/deployment.md`、`docs/ops/user-guide.md`。

---

## 8. Orchestrator API 契约

基址规则见 [§3 环境变量](#3-环境变量)。实现：`src/chat/api.ts`、`src/shared/http.ts`。

### 8.1 鉴权与公共头

**换票（无 Bearer）：**

```http
POST /v1/chat/session
Content-Type: application/json

{ "launch_code": "<一次性码>" }
```

`ticket` 只存**内存**（刷新即丢）。之后业务请求：

```http
Authorization: Bearer <ticket>
Idempotency-Key: <uuid>    # 非 GET 写请求，每次新建
```

错误体：`{ "error": { "code", "message" } }`。

| HTTP | 对话壳行为 |
|------|------------|
| `401` / `403`（bootstrap） | → `expired`，须从 OA 重新进入 |
| `401`（对话中） | 清 ticket → `expired` |
| `≥500` 或网络失败（bootstrap） | → `orchestrator_down` |

说明：客户端虽暴露 `POST /v1/chat/session/refresh`，**当前 UI 未做静默续期定时器**；过期须从 OA 重新带 `launch` 进入。

### 8.2 主要接口一览

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/chat/session` | 换票；返回 `ticket`、`display_name`、`thread_id`、`skills`、`chat`、轮询/字数配置等 |
| `POST` | `/v1/chat/session/refresh` | 续期（壳未自动调用） |
| `POST` | `/v1/chat/session/switch` | 切换线程 |
| `POST` | `/v1/chat/messages` | 非流式发消息（备用） |
| `POST` | `/v1/chat/messages/stream` | **主路径** SSE：`delta` / `done` / `error` |
| `POST` | `/v1/chat/attachments` | 发送前整批上传；字段名 `files`；返回 `file_id` 等 |
| `GET` | `/v1/chat/runs/{run_id}` | `pending` / 转人工后轮询 |
| `GET/POST/PATCH/DELETE` | `/v1/chat/threads...` | 线程列表、新建、历史、重命名/归档、删除 |
| `GET/DELETE` | `/v1/chat/memory...` | 记忆列表、单删、清空（`confirm=true`） |
| `GET` | `/v1/chat/exports/{ticket}` | 导出文件下载（须带 Bearer，不能 `window.open`） |

流式请求体示例：

```json
{
  "message": "用户原文",
  "client_msg_id": "<字词字符>",
  "attachment_ids": ["file_xxx"]
}
```

SSE：`event: delta` → `{ "text" }`；`event: done` → 完整 `MessageResult`；注释行（心跳）忽略。反向代理**禁止缓冲** `text/event-stream`。

`reply.data` 支持 `table` / `record` / `file`；列名来自 Tool 配置，前端不写死业务字段。

### 8.3 `run_status` → 前端任务态

| 后端 `run_status` | 前端 |
|-------------------|------|
| `queued` | `queued` |
| `running` / `streaming` | `running` |
| `waiting_input` | `waiting_input` |
| `waiting_approval` / `intervention` | `waiting_approval` |
| `succeeded` / `completed` | `completed` |
| `failed` / `cancelled` | 同名 |
| 其它 | 按 `running` |

### 8.4 跨域 CORS（仅 API 与静态站不同源时）

对来源 `{CHAT_STATIC_URL}` 至少允许：

- Headers：`Authorization`、`Content-Type`、`Idempotency-Key`（若启用 CSRF 则含 `X-CSRF-Token`）
- Methods：`GET`、`POST`、`PATCH`、`DELETE`、`OPTIONS`
- SSE 长连接超时与禁用缓冲

可选探针：`GET /healthz`、`GET /readyz`（dev 代理已转发）。

---

## 9. 页面状态与验收

| 状态 | 说明 |
|------|------|
| `loading` | 换票与拉会话；≥3s 显示「正在连接…」；≥15s 或网络/CORS/持续 5xx → `orchestrator_down` |
| `no_launch` | 无 `launch` 参数，提示仅从 OA 打开 |
| `ready` | 正常对话 |
| `expired` | 401 或会话失效；主按钮「重新进入」（embed 时 postMessage） |
| `orchestrator_down` | 服务不可达；「重试」与「回 OA」 |

验证步骤：

1. 从 OA 打开助手（或带真实 `launch`）→ 提问 → 确认 **SSE 流式** → 停止/重试；可选上传图片附件。
2. 等待 ticket 过期或后端 401 → `expired` →「重新进入」（embed 下 OA 应响应 `relaunch`）。
3. 停止 Orchestrator 或填错 `VITE_API_BASE_URL` → `orchestrator_down`。

---

## 10. 脚本与测试

```bash
npm run dev       # 开发：127.0.0.1:5173
npm run build     # vue-tsc --noEmit + 生产构建
npm test          # Vitest（jsdom），匹配 src/**/*.spec.ts
npm run preview   # 预览 dist：127.0.0.1:4173
```

---

## 11. 故障速查

| 现象 | 可能原因 |
|------|----------|
| 一直 `no_launch` | 未从 OA 打开 / URL 无 `launch` |
| `orchestrator_down` / 「暂时无法连接」 | API 不可达；本地误设 `VITE_API_BASE_URL` 导致 CORS；错误 base；网关 5xx；bootstrap 超时 |
| `expired` / relaunch 失败 | launch 已消费；embed 下 OA 未刷新 iframe 或 3s 内未 ack |
| iframe 空白 | 缺 `frame-ancestors`，或 OA CSP 未放行对话壳 |
| 能进页不能流式 | 代理缓冲 SSE；检查 `/v1/chat/messages/stream` |
| 改 API 仍打旧站 | 未重建或 CDN 缓存旧包 |
| 挂件不出现 | 未配 `oaAgentConfig.hostUrl` 或 `embed.js` 404 / 未设 `charset=utf-8` |
| 欢迎页无能力 / 不能聊天 | 后台 Skill 未启用或 `chat` 未开；联系管理员在 `/admin/` 配置 |

相关实现：`src/chat/api.ts`、`src/chat/oa-relay.ts`、`public/embed.js`、`src/shared/http.ts`、`src/chat/App.vue`。
