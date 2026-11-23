# oa-agent-chat 部署指南

东审财税 OA **员工智能问答（对话壳）** 静态前端的生产部署说明。本仓库只产出静态资源（`dist/`），不包含 Agent Orchestrator、管理后台或安装向导。

技术栈：Vue 3 + Vite + Element Plus。Node.js 建议 **20 LTS**（与 CI 一致）。

## 1. 架构与依赖

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
                                    │
                                    ▼
                         Agent Orchestrator API
                         （VITE_API_BASE_URL）
                                    │
                         Bearer ticket（仅内存）
                         /v1/chat/* 业务接口
```

部署前请确认：

| 依赖 | 说明 |
|------|------|
| Agent Orchestrator | 已对外 HTTPS 提供 `/v1/chat/*`（及可选 `/healthz`、`/readyz`） |
| OA 换码入口 | `assistant_host.php`（或等价）能校验登录、拿一次性 `launch_code` 并 302 到本静态站 |
| HTTPS | 对话壳与 API 均建议 HTTPS，避免混合内容 |
| CORS | Orchestrator 须允许对话壳源，并允许 `Authorization` 等头 |

本仓库**不**负责 OA PHP、Orchestrator 进程或数据库。身份链路是：

1. **OA** 校验员工登录，向 Orchestrator（或约定的换码服务）换取一次性 `launch_code`；
2. **对话壳**只吃 URL 上的 `launch`，向 Orchestrator 换 `ticket`；
3. 之后对话壳**只**用 `Authorization: Bearer {ticket}` 调 Agent 后台，**不再**直接调 OA 接口。

---

## 2. 与 OA 对接细节

### 2.1 职责边界

| 角色 | 做什么 | 不做什么 |
|------|--------|----------|
| OA 宿主（`assistant_host.php` 等） | 校验 OA 登录；签发/换取一次性 `launch_code`；302 到对话壳；embed 时响应 `postMessage` | 不直接渲染对话 UI；不把长期凭证塞进前端 |
| `embed.js`（本仓库 `public/embed.js`） | 在 OA 业务页画悬浮球 + iframe；iframe 的 `src` 指向 OA `hostUrl`（不是直接指向对话壳） | 不携带身份/密钥；不解析 launch |
| 对话壳（本仓库） | 读 `?launch=` / `?embed=`；换票；聊天；embed 下向父页 `postMessage` | 不校验 OA Cookie；不自己生成 launch |

### 2.2 换码与落地 URL 约定

OA 换码成功后必须 **HTTP 302**（或等价跳转）到对话壳：

**全页助手：**

```text
{CHAT_STATIC_URL}/?launch={launch_code}
```

**悬浮挂件 / iframe 内嵌：**

```text
{CHAT_STATIC_URL}/?launch={launch_code}&embed=1
```

| Query | 必填 | 说明 |
|-------|------|------|
| `launch` | 是 | 一次性换码。对话壳 `takeLaunchCode()` 读取后立刻 `history.replaceState` 从地址栏删掉，降低进历史/Referer/截图泄露的风险 |
| `embed` | 挂件为 `1` | `embed=1` 时隐藏对话壳自身页头；「重新进入 / 回 OA」走 `postMessage`，而不是整页 `reload` / `history.back` |

约束（OA / 换码服务需保证）：

- `launch_code` **一次性、短时有效**；对话壳会把它原样 POST 给 Orchestrator，**不会**在请求体里带 OA 用户名/Cookie。
- 同一 `launch_code` 被消费后再次 bootstrap 会失败 → 页面进入 `expired`，需 OA 重新签发。
- 直开 `{CHAT_STATIC_URL}/`（无 `launch`）→ 页面状态 `no_launch`，提示「仅从 OA 打开」。这是预期行为。

### 2.3 全页打开流程

```
用户点 OA「智能助手」
  → OA assistant_host.php 校验登录
  → OA 向 Agent 侧换 launch_code
  → 302 {CHAT_STATIC_URL}/?launch=...
  → 对话壳 takeLaunchCode() 存到内存并清 URL
  → POST {API}/v1/chat/session { "launch_code": "..." }
  → 拿到 ticket，进入 ready
```

全页模式下「重新进入」：对话壳对当前页 `location.reload()`。  
因 `launch` 已被清掉，**仅 reload 不够**——需要 OA 再次带新 `launch` 打开（例如用户从 OA 菜单再进一次）。若产品要求全页也能一键重进，应由 OA 提供可再次换码的入口 URL。

### 2.4 悬浮挂件（embed.js）

OA 业务页引入：

```html
<script>
  window.oaAgentConfig = {
    // 必填：OA 侧换码宿主（相对或绝对均可）。iframe 首次打开会请求此地址。
    hostUrl: '/general/ds/agent/assistant_host.php?mode=embed',
    // 可选外观
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

挂件行为：

1. 未配置 `hostUrl` → 控制台警告，挂件不加载。
2. 点击悬浮球 → 创建 iframe，`src = hostUrl + &_t={timestamp}`（防缓存）。
3. **iframe 先打到 OA**，由 OA 校验登录、换码，再 302 到  
   `{CHAT_STATIC_URL}/?launch=...&embed=1`。
4. 挂件标题栏「重新进入」会把 iframe `src` 重新设为带新 `_t` 的 `hostUrl`（再次走 OA 换码），**不依赖**对话壳内的 relaunch 消息也能刷新。
5. 脚本保持 ES5，兼容老旧 OA 浏览器；不携带任何身份或密钥。

### 2.5 embed 模式 `postMessage` 协议

实现见 `src/chat/oa-relay.ts`。对话壳向 `window.parent` 发消息，**当前 `targetOrigin` 为 `'*'`**（OA 侧仍应按 `event.origin` / `event.data.type` 校验）。

| `type` | 方向 | 载荷 | 何时触发 | OA 宿主应做什么 |
|--------|------|------|----------|-----------------|
| `oa-agent-chat:relaunch` | iframe → OA | `{ type }` | 用户在 `expired` 点「重新进入」且 `embed=1` | 重新换码，把 iframe 导航到新的 `?launch=...&embed=1`；建议随后回 ack |
| `oa-agent-chat:relaunch-ack` | OA → iframe | `{ type }` | OA 已处理 relaunch | 对话壳等待 **最多 3 秒**；收到则认为成功；超时则界面提示 relaunch 失败 |
| `oa-agent-chat:back-to-oa` | iframe → OA | `{ type }` | 用户点「回 OA」且在 iframe 内 | 关闭助手窗 / 收起挂件 / 跳回业务页（产品自定） |

消息体形状：

```js
// 对话壳发出
{ type: 'oa-agent-chat:relaunch' }
{ type: 'oa-agent-chat:back-to-oa' }

// OA 宿主回复（推荐）
{ type: 'oa-agent-chat:relaunch-ack' }
```

OA 宿主页伪代码：

```js
window.addEventListener('message', function (ev) {
  // 生产环境请校验 ev.origin === '{CHAT_STATIC_URL 的 origin}'
  var data = ev.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'oa-agent-chat:relaunch') {
    // 1) 重新请求换码地址，或直接把 iframe.src 指回 hostUrl（带新 _t）
    iframe.src = hostUrlWithCacheBust()
    // 2) 可选：立刻或在 302 完成后 ack
    iframe.contentWindow.postMessage({ type: 'oa-agent-chat:relaunch-ack' }, chatOrigin)
  }
  if (data.type === 'oa-agent-chat:back-to-oa') {
    closeAssistantUi()
  }
})
```

非 embed（全页）时：`requestOaRelaunch` 会因 `parent === self` 失败；「回 OA」走 `history.back()`。

### 2.6 CSP / iframe 白名单（双方）

**静态站（对话壳）响应头**——允许谁把本站嵌进 iframe：

```http
Content-Security-Policy: frame-ancestors 'self' https://oa.example.com https://*.oa.example.com
```

**OA 站点 CSP**——若配置了 `frame-src` / `child-src`，须允许 `{CHAT_STATIC_URL}`。

Agent 进程**不**负责 `frame-ancestors`；漏配时常见现象是 iframe 空白或浏览器报拒绝嵌入。

### 2.7 OA 联调检查清单

- [ ] 全页：从 OA 菜单进入，地址栏短暂出现 `launch=` 后被清掉，进入对话
- [ ] 挂件：业务页加载 `embed.js`，点开后 iframe 最终落在对话壳且 `embed=1`
- [ ] ticket 失效后点「重新进入」：embed 下 OA 刷新 iframe 并（建议）回 ack；3 秒内无 ack 则对话壳提示失败
- [ ] 「回 OA」：embed 下宿主收到 `back-to-oa` 并关闭窗口
- [ ] 无 CORS/CSP/混合内容控制台错误

---

## 3. 与 Agent 后台（Orchestrator）对接细节

### 3.1 基址与路径规则

| 项 | 约定 |
|----|------|
| 构建变量 | `VITE_API_BASE_URL` = API **根**，例如 `https://agent-api.example.com`（**不要**带 `/v1/chat`） |
| 实际请求 | `{VITE_API_BASE_URL}` + `/v1/chat/...` |
| 未配置时（本地 dev） | 使用相对路径 `/v1/...`，由 Vite 代理到 `http://127.0.0.1:8000` |
| 凭证模式 | 配置了 base → `credentials: 'omit'` + Bearer；未配置 → `same-origin`（走同源代理） |

聊天接口路径与 JSON 契约与后端对齐后**请勿单侧修改**（STD-009）。

### 3.2 鉴权与公共请求头

**换票（无 Bearer）：**

```http
POST /v1/chat/session
Content-Type: application/json
Accept: application/json

{ "launch_code": "<一次性码>" }
```

成功后响应中的 `ticket` 只保存在对话壳**内存**（刷新页面即丢）。之后所有业务请求：

```http
Authorization: Bearer <ticket>
Accept: application/json
Content-Type: application/json          # 有 body 时
Idempotency-Key: <uuid>                 # 非 GET 写请求，每次新建
X-CSRF-Token: <token>                   # 仅当前端已 setCsrfToken；当前对话壳换票路径未强制依赖 Cookie CSRF
```

错误体约定（前端解析）：

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "给人看的说明"
  }
}
```

| HTTP | 对话壳行为 |
|------|------------|
| `401` / `403`（bootstrap） | 视为会话失效 → `expired`，需从 OA 重新进入 |
| `401`（对话中） | 清 ticket → `expired` |
| `≥500` 或网络 `TypeError`（bootstrap） | `orchestrator_down` |
| 其它业务错误 | 展示 `error.message`（流式失败则进助手错误气泡） |

说明：

- 客户端虽暴露 `POST /v1/chat/session/refresh`，**当前对话壳未做静默续期定时器**；过期必须从 OA 重新带 `launch` 进入（与 README「无静默 refresh」一致）。后端仍可实现 refresh 供后续使用。
- 请求体**不**携带 OA 身份字段（测试断言 body 不含 `"oa"`）。

### 3.3 会话：换票与切换线程

#### `POST /v1/chat/session`

请求：`{ "launch_code": string }`

响应（`ChatSessionInfo`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `ticket` | string | Bearer 凭证 |
| `expires_in` | number | 秒；前端有 `refreshDelayMs` 工具（到期前 2 分钟，最短 30 秒），但 UI 暂未挂静默续期 |
| `display_name` | string | 页头展示名 |
| `thread_id` | string | 当前线程 |
| `skills` | `SkillMenuItem[]?` | 欢迎页能力；近三天新 Skill/Tool 的 `examples` 会进快捷示例 |
| `chat` | boolean? | 是否允许日常聊天 |
| `message_max_chars` | number? | 输入上限，缺省前端用 500 |
| `poll_interval_seconds` | number? | `reply.type === 'pending'` 时轮询间隔，缺省 5s |
| `poll_max_minutes` | number? | 轮询最长时长，缺省按 35 分钟 |

`SkillMenuItem`：`name`、`display_name`、`description`、`examples: string[]`、`created_at?`、`newest_tool_created_at?`。

#### `POST /v1/chat/session/refresh`

- Header：Bearer  
- 响应：`{ "expires_in": number }`  
- 当前壳未自动调用。

#### `POST /v1/chat/session/switch`

```json
{ "thread_id": "thr_xxx" }
```

响应可带回 `skills` / `chat` / `message_max_chars` / 轮询配置（与开会话类似的子集）。

### 3.4 发消息与 SSE 流式

#### 非流式（备用）`POST /v1/chat/messages`

```json
{ "message": "用户原文", "client_msg_id": "<8-64 位字词字符>" }
```

#### 流式（主路径）`POST /v1/chat/messages/stream`

```http
POST /v1/chat/messages/stream
Authorization: Bearer <ticket>
Accept: text/event-stream
Content-Type: application/json

{ "message": "...", "client_msg_id": "..." }
```

SSE 事件（`event:` + JSON `data:`；`:` 开头行为心跳，前端忽略）：

| event | data | 前端行为 |
|-------|------|----------|
| `delta` | `{ "text": "片段" }` | 追加到流式气泡（展示前会剥 HTML/粗体标记） |
| `done` | 完整 `MessageResult` | 结束流式，写入最终回复 |
| `error` | `{ "code"?, "message"? }` | 抛错，展示失败 |

`MessageResult`：

```ts
{
  run_id: string
  thread_id: string
  run_status: string
  reply: {
    type: 'markdown' | 'text' | 'error' | 'pending'
    content: string
    data: ReplyData  // table | record | null；列名来自 Tool 配置，前端不写死业务字段
    error_code?: string
    notice?: string
    chain?: string[]
  }
}
```

若 `reply.type === 'pending'`（如转人工），前端按会话配置轮询：

#### `GET /v1/chat/runs/{run_id}`

```ts
{ run_id, run_status, done: boolean, reply: Reply | null }
```

`done && reply` 时停止轮询并更新气泡。

**网关注意：** 反向代理不得缓冲 `text/event-stream`；超时要覆盖长生成。

### 3.5 `run_status` 映射

后端 `run_status` → 对话壳任务态（`mapRunStatus`）：

| 后端 `run_status` | 前端展示态 |
|-------------------|------------|
| `queued` | `queued` |
| `running` / `streaming` | `running` |
| `waiting_input` | `waiting_input`（等待补充信息） |
| `waiting_approval` / `intervention` | `waiting_approval`（等待审批） |
| `succeeded` / `completed` | `completed` |
| `failed` | `failed` |
| `cancelled` | `cancelled` |
| 其它未知值 | 按 `running` 处理 |

### 3.6 线程

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/chat/threads?page&page_size&status` | `status=active\|archived`；列表项含 `thread_id`、`title`、`pinned`、时间戳等 |
| `POST` | `/v1/chat/threads` | 新建空线程 |
| `GET` | `/v1/chat/threads/{id}/messages?page&page_size` | 历史消息；前端会翻页拼满 |
| `PATCH` | `/v1/chat/threads/{id}` | body：`{ title? , status? }` |
| `DELETE` | `/v1/chat/threads/{id}` | 删除 |

历史消息项：`message_id`、`role`、`content`、`reply_type`、`data`、`error_code?`、`created_at`、`run_id?`。

### 3.7 记忆

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/v1/chat/memory?page&page_size` | 列表；`kind`: `preference` \| `constraint` \| `note` |
| `DELETE` | `/v1/chat/memory/{memory_id}` | 删一条 |
| `DELETE` | `/v1/chat/memory` | body：`{ "confirm": true }` 清空本人 active 记忆 |

### 3.8 尚未接入（后端若未提供，前端会明示）

- 附件上传：发送时仅文本进 API；附件只留在本地气泡演示。
- 审批写接口：`/v1/chat/approvals` 前端适配器仍抛「尚未接入」。

### 3.9 CORS（Orchestrator 必配）

对来源 `{CHAT_STATIC_URL}`：

- `Access-Control-Allow-Origin`：对话壳源（或白名单）
- `Access-Control-Allow-Headers`：至少 `Authorization`、`Content-Type`、`Idempotency-Key`；若启用 CSRF 则含 `X-CSRF-Token`
- `Access-Control-Allow-Methods`：`GET`、`POST`、`PATCH`、`DELETE`、`OPTIONS`
- SSE：禁止中间层缓冲；注意预检与长连接超时

可选运维探针：`GET /healthz`、`GET /readyz`（dev 代理已转发同名路径）。

### 3.10 Agent 联调检查清单

- [ ] `VITE_API_BASE_URL` 正确且无 `/v1/chat` 后缀；改地址后已重新构建
- [ ] `POST /v1/chat/session` 用真实 launch 能返回 `ticket` / `thread_id` / `display_name`
- [ ] 带 Bearer 发流式消息，浏览器 Network 可见 `delta`/`done` 事件
- [ ] `pending` 回复会按配置轮询 `/v1/chat/runs/{id}`
- [ ] 线程列表 / 历史 / 切换 / 记忆 CRUD 与鉴权头正确
- [ ] 故意 401 → 对话壳 `expired`；停 API → bootstrap 进 `orchestrator_down`
- [ ] 控制台无 CORS 错误

---

## 4. 环境变量

| 变量 | 必填 | 注入时机 | 说明 |
|------|------|----------|------|
| `VITE_API_BASE_URL` | **生产必填** | **构建时** | Orchestrator API 根地址，**不含** `/v1/chat` |

Vite 会把 `VITE_*` 打进包；改 API 地址必须**重新构建**。

```bash
cp .env.example .env.production.local
# VITE_API_BASE_URL=https://agent-api.example.com

# 或内联：
VITE_API_BASE_URL=https://agent-api.example.com npm run build
```

---

## 5. 构建

```bash
git clone https://github.com/puyuheng-git/oa-agent-chat.git
cd oa-agent-chat
npm ci
VITE_API_BASE_URL=https://agent-api.example.com npm run build
```

| 产物 | 用途 |
|------|------|
| `dist/index.html` | 对话页 |
| `dist/assets/*` | 带哈希 JS/CSS，可长期缓存 |
| `dist/embed.js` | OA 挂件脚本 |

```bash
npm test && npm run build
npm run preview   # 本地预览 dist
```

---

## 6. 静态托管

将 **整个 `dist`** 发布到 Nginx / Caddy / OSS+CDN 等。对外根 URL 记为 `{CHAT_STATIC_URL}`（无尾斜杠）。

### 6.1 Nginx 示例

```nginx
server {
    listen 443 ssl http2;
    server_name agent-chat.example.com;

    root /var/www/oa-agent-chat/dist;
    index index.html;

    add_header Content-Security-Policy "frame-ancestors 'self' https://oa.example.com https://*.oa.example.com" always;

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

### 6.2 对象存储 + CDN

1. 上传完整 `dist/`；`index.html` / `embed.js` 短缓存，`assets/*` 长缓存。  
2. SPA 回退到 `index.html`（保留 query）。  
3. 配置 `frame-ancestors`。  
4. 绑定 HTTPS 域名。

### 6.3 Docker（可选）

仓库无自带 Dockerfile；示例：

```dockerfile
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
EXPOSE 80
```

```bash
docker build --build-arg VITE_API_BASE_URL=https://agent-api.example.com -t oa-agent-chat:latest .
```

---

## 7. 页面状态（部署验收用）

| 状态 | 含义 |
|------|------|
| `loading` | 换票与拉会话；≥3s 显示「正在连接…」；≥15s → `orchestrator_down` |
| `no_launch` | 无 `launch` |
| `ready` | 可对话 |
| `expired` | 401/403 或换票失败需重进 |
| `orchestrator_down` | 网络/5xx/超时 |

---

## 8. 发布总检查清单

- [ ] 构建注入正确的 `VITE_API_BASE_URL`；`npm ci && npm test && npm run build` 通过
- [ ] `dist/` 与 `embed.js` 可公网访问；HTTPS / SPA 回退正常
- [ ] **§2.7 OA 联调**与 **§3.10 Agent 联调**全部勾选
- [ ] 勿提交 `.env*.local`；日志勿长期保留完整带 `launch` 的 URL

---

## 9. 回滚与更新

1. 整包回滚上一版 `dist`（`index.html` 与 hashed assets 配套）。  
2. 改 API 地址 → 改变量后全量重建发布。  
3. 只改挂件 → 可单独换 `embed.js` 并刷 CDN。  
4. `/v1/chat/*` 契约变更 → 前后端同步发版。

---

## 10. CI

`.github/workflows/ci.yml` 在 Node 20 跑 `npm test` 与 `npm run build`。  
CI **默认不注入**生产 `VITE_API_BASE_URL`；生产构建在发布流水线显式传入。

---

## 11. 故障速查

| 现象 | 可能原因 |
|------|----------|
| 一直 `no_launch` | 未从 OA 打开 / URL 无 `launch` |
| `orchestrator_down` | API 不可达、CORS、错误 base、网关 5xx、bootstrap 超时 |
| `expired` / relaunch 失败 | launch 已消费；embed 下 OA 未刷新 iframe 或 3s 内未 ack |
| iframe 空白 | 缺 `frame-ancestors`，或 OA CSP 未放行对话壳 |
| 能进页不能流式 | 代理缓冲 SSE；检查 `/v1/chat/messages/stream` |
| 改 API 仍打旧站 | 未重建或 CDN 缓存旧包 |
| 挂件不出现 | 未配 `oaAgentConfig.hostUrl` 或 `embed.js` 404 |

产品行为总览见 [README.md](../README.md)。实现参考：`src/chat/api.ts`、`src/chat/oa-relay.ts`、`public/embed.js`、`src/shared/http.ts`。
