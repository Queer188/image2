# image2 生图工具多 Agent 协作开发手册

> 项目目标：开发一个可自定义 API Base URL 与 API Key 的 image2 生图工具。用户输入服务地址和密钥后，工具自动获取可用模型列表，用户选择模型后可进行文生图、图生图，并支持比例、清晰度、数量、种子、提示词等参数配置。

## 1. 产品范围

### 1.1 核心功能

- API 配置
  - 用户填写 `API Base URL`
  - 用户填写 `API Key`
  - 支持保存、编辑、删除多个服务配置
  - 支持连接测试

- 模型发现
  - 根据 URL 和 API Key 获取模型列表
  - 识别可用于文生图、图生图的模型
  - 支持模型搜索、筛选、收藏
  - 缓存最近一次模型列表

- 文生图
  - 输入正向提示词
  - 输入反向提示词
  - 选择模型
  - 选择比例
  - 选择清晰度或质量等级
  - 选择生成数量
  - 支持随机种子
  - 展示生成结果

- 图生图
  - 上传参考图
  - 输入提示词
  - 选择模型
  - 设置重绘强度
  - 设置比例、清晰度、数量
  - 展示生成结果

- 结果管理
  - 预览大图
  - 下载图片
  - 复制图片 URL
  - 复制本次生成参数
  - 保存历史记录

### 1.2 非目标

- 第一版不做账号体系。
- 第一版不做代理售卖或计费系统。
- 第一版不承诺兼容所有供应商的私有参数。
- 第一版不做复杂工作流节点编辑器。

## 2. 建议技术方案

### 2.1 前端

推荐：

- React 或 Next.js
- TypeScript
- Tailwind CSS 或现有 UI 组件库
- Zustand / Redux Toolkit / TanStack Query

前端职责：

- 管理 API 配置表单
- 请求模型列表
- 渲染模型选择器
- 管理文生图、图生图表单
- 展示生成状态与结果
- 管理本地历史记录

### 2.2 后端

推荐：

- Node.js + Fastify / Express
- 或 Python + FastAPI

后端职责：

- 隐藏 API Key，不让浏览器直接暴露密钥
- 代理调用不同 image API
- 统一不同供应商的返回结构
- 处理文件上传
- 做错误归一化
- 做请求超时和重试

### 2.3 数据存储

第一版可选：

- 本地优先：浏览器 `localStorage` / `IndexedDB`
- 桌面版：SQLite
- Web 服务版：PostgreSQL / SQLite

敏感信息建议：

- API Key 不明文长期存储
- 如果必须存储，至少使用系统密钥链、服务端加密或用户本地加密

## 3. 多 Agent 团队结构

### 3.1 Orchestrator Agent：总控协调 Agent

职责：

- 拆分任务
- 排定迭代顺序
- 维护项目状态
- 合并各 Agent 的产出
- 处理跨模块冲突
- 决定是否进入下一阶段

输入：

- 用户需求
- 当前代码状态
- 各专项 Agent 的报告

输出：

- 任务清单
- 迭代计划
- 合并决策
- 验收报告

工作原则：

- 每次只推进一个清晰的里程碑。
- 每个任务必须有验收标准。
- 不允许专项 Agent 随意扩大范围。
- 出现接口冲突时，以 `API Contract Agent` 的契约为准。

### 3.2 Product Agent：产品 Agent

职责：

- 梳理用户流程
- 明确 MVP 范围
- 输出页面结构
- 定义关键交互
- 发现遗漏场景

重点问题：

- 用户第一次打开工具时看到什么？
- API Key 填错时如何提示？
- 模型获取失败时如何恢复？
- 文生图和图生图是否共用模型选择？
- 生成中、失败、成功、取消分别如何表现？

交付物：

- `docs/product-requirements.md`
- `docs/user-flows.md`
- 页面信息架构
- MVP 验收清单

### 3.3 API Contract Agent：接口契约 Agent

职责：

- 设计前后端接口
- 统一模型、任务、图片、错误的数据结构
- 抽象不同供应商的 API 差异
- 定义适配器接口

关键契约示例：

```ts
type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
};

type ImageModel = {
  id: string;
  name: string;
  providerId: string;
  capabilities: Array<"text-to-image" | "image-to-image">;
  supportedRatios?: string[];
  supportedQualities?: string[];
  raw?: unknown;
};

type GenerateImageRequest = {
  providerId: string;
  modelId: string;
  mode: "text-to-image" | "image-to-image";
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  quality?: "standard" | "hd" | "ultra" | string;
  count?: number;
  seed?: number;
  strength?: number;
  inputImageId?: string;
};

type GeneratedImage = {
  id: string;
  url?: string;
  localPath?: string;
  width?: number;
  height?: number;
  seed?: number;
  metadata: Record<string, unknown>;
};
```

交付物：

- `docs/api-contract.md`
- `src/shared/types.ts`
- 错误码设计
- 供应商适配器规范

### 3.4 Provider Adapter Agent：供应商适配 Agent

职责：

- 实现 OpenAI-compatible 或 image2-compatible API 适配
- 获取模型列表
- 调用文生图
- 调用图生图
- 兼容常见返回格式
- 处理异步任务轮询

适配器接口建议：

```ts
interface ImageProviderAdapter {
  testConnection(config: ProviderRuntimeConfig): Promise<void>;
  listModels(config: ProviderRuntimeConfig): Promise<ImageModel[]>;
  generateImage(
    config: ProviderRuntimeConfig,
    request: GenerateImageRequest
  ): Promise<GeneratedImage[]>;
}
```

实现重点：

- URL 拼接必须可靠，避免重复斜杠。
- 请求超时必须可配置。
- 错误信息要保留供应商原始响应摘要。
- 不同供应商字段差异要在 adapter 内消化，不泄露到 UI。

交付物：

- `src/server/providers/base.ts`
- `src/server/providers/openai-compatible.ts`
- `src/server/providers/image2-compatible.ts`
- adapter 单元测试

### 3.5 Backend Agent：后端 Agent

职责：

- 搭建服务端 API
- 管理 provider 配置
- 提供模型列表接口
- 提供生成接口
- 处理上传图片
- 统一错误响应

推荐接口：

```txt
POST /api/providers/test
POST /api/providers
GET  /api/providers
PUT  /api/providers/:id
DELETE /api/providers/:id

POST /api/models/list
POST /api/images/upload
POST /api/images/generate
GET  /api/history
DELETE /api/history/:id
```

错误响应建议：

```json
{
  "error": {
    "code": "PROVIDER_AUTH_FAILED",
    "message": "API Key 无效或权限不足",
    "detail": "Provider returned 401 Unauthorized"
  }
}
```

交付物：

- 后端路由
- 配置存储
- 文件上传
- 历史记录
- 集成测试

### 3.6 Frontend Agent：前端 Agent

职责：

- 构建主界面
- 实现 API 设置面板
- 实现模型选择器
- 实现文生图表单
- 实现图生图表单
- 实现结果画廊
- 实现历史记录

页面结构建议：

```txt
App
├── TopBar
├── ProviderPanel
├── ModelPicker
├── GenerationTabs
│   ├── TextToImageForm
│   └── ImageToImageForm
├── ResultGallery
└── HistoryDrawer
```

交互要求：

- 没有配置 API 时，引导用户先添加配置。
- 模型列表加载中时显示状态。
- 生成按钮必须有 loading 状态。
- 生成失败时保留用户输入。
- 图生图上传后显示缩略图。
- 生成结果支持下载、复制 URL、复用参数。

交付物：

- UI 组件
- 状态管理
- API client
- 基础响应式布局
- 浏览器端测试

### 3.7 Security Agent：安全 Agent

职责：

- 审查 API Key 存储方案
- 检查日志是否泄露密钥
- 检查前端是否暴露密钥
- 检查上传文件限制
- 检查 SSRF 风险
- 检查 CORS 策略

重点风险：

- 用户填写任意 URL，服务端代理请求可能导致 SSRF。
- API Key 不能写入普通日志。
- 错误响应不能完整回显 Authorization header。
- 上传图片需要限制类型和大小。
- 生成图片 URL 不能默认信任为安全资源。

建议策略：

- 对用户自定义 URL 做协议限制，只允许 `https://`，本地开发可临时允许 `http://localhost`。
- 设置请求超时。
- 禁止请求私网地址，除非用户显式开启本地模式。
- 日志中对 API Key 做 mask。
- 文件上传限制为常见图片 MIME 类型。

交付物：

- `docs/security-review.md`
- 安全检查清单
- SSRF 防护实现或风险说明

### 3.8 QA Agent：测试 Agent

职责：

- 写测试计划
- 覆盖关键用户路径
- 构造假供应商服务
- 验证错误状态
- 做回归测试

测试场景：

- API Key 正确，可以获取模型。
- API Key 错误，展示认证失败。
- URL 不可达，展示连接失败。
- 模型列表为空，展示空状态。
- 文生图成功。
- 文生图失败。
- 图生图上传非图片失败。
- 图生图成功。
- 生成过程中重复点击不会重复提交。
- 历史记录可以复用参数。

交付物：

- 单元测试
- 集成测试
- E2E 测试
- 手工验收报告

### 3.9 Docs Agent：文档 Agent

职责：

- 编写 README
- 编写配置说明
- 编写常见问题
- 编写开发者文档
- 记录供应商适配方式

交付物：

- `README.md`
- `docs/provider-guide.md`
- `docs/development.md`
- `docs/troubleshooting.md`

## 4. 推荐迭代路线

### Phase 0：项目骨架

目标：

- 建立前后端项目
- 跑通开发环境
- 确定技术栈

负责 Agent：

- Orchestrator Agent
- Backend Agent
- Frontend Agent

验收标准：

- `npm install` 成功
- `npm run dev` 成功
- 前端能看到空白主界面
- 后端健康检查接口可用

### Phase 1：API 配置与连接测试

目标：

- 用户可以填写 URL 和 API Key
- 后端可以测试连接
- 错误能清楚反馈

负责 Agent：

- Product Agent
- API Contract Agent
- Backend Agent
- Frontend Agent
- Security Agent

验收标准：

- 用户可以新增 provider
- 用户可以测试 provider
- API Key 不出现在前端日志和服务端日志中
- 连接失败有明确原因

### Phase 2：模型发现

目标：

- 根据 provider 获取模型列表
- 前端展示模型
- 支持选择模型

负责 Agent：

- API Contract Agent
- Provider Adapter Agent
- Backend Agent
- Frontend Agent
- QA Agent

验收标准：

- 能获取至少一种供应商的模型列表
- 模型能区分文生图和图生图能力
- 模型加载失败不影响配置保存
- 模型列表可刷新

### Phase 3：文生图 MVP

目标：

- 用户选择模型后可以文生图
- 支持比例、清晰度、数量
- 显示生成结果

负责 Agent：

- Provider Adapter Agent
- Backend Agent
- Frontend Agent
- QA Agent

验收标准：

- 文生图成功返回图片
- 生成中状态清晰
- 失败后保留表单输入
- 结果可下载

### Phase 4：图生图 MVP

目标：

- 用户上传图片
- 设置重绘强度
- 调用图生图模型生成结果

负责 Agent：

- API Contract Agent
- Provider Adapter Agent
- Backend Agent
- Frontend Agent
- Security Agent
- QA Agent

验收标准：

- 支持上传 PNG/JPEG/WebP
- 超出大小限制有提示
- 图生图成功返回图片
- 上传文件不会泄露到错误日志

### Phase 5：历史记录与体验优化

目标：

- 保存生成历史
- 支持复用参数
- 增加模型收藏
- 优化错误提示

负责 Agent：

- Product Agent
- Frontend Agent
- Backend Agent
- QA Agent
- Docs Agent

验收标准：

- 历史记录可查看
- 参数可一键复用
- 图片可重新下载
- README 足够让新用户跑起来

## 5. Agent 协作协议

### 5.1 每个 Agent 开始任务前必须说明

```md
## Task Brief

- Agent:
- Task:
- Scope:
- Files likely touched:
- Dependencies:
- Risks:
- Acceptance criteria:
```

### 5.2 每个 Agent 完成任务后必须提交

```md
## Task Report

- Agent:
- Summary:
- Files changed:
- Tests run:
- Known limitations:
- Follow-up tasks:
```

### 5.3 交接格式

```md
## Handoff

- From:
- To:
- Context:
- Decisions made:
- Open questions:
- Blockers:
- Suggested next action:
```

### 5.4 冲突处理

- 产品范围冲突：由 Product Agent 提议，Orchestrator Agent 决策。
- 接口字段冲突：由 API Contract Agent 决策。
- 安全风险冲突：Security Agent 有否决权。
- UI 实现冲突：Frontend Agent 决策，但必须满足 Product Agent 的用户流程。
- 测试失败冲突：QA Agent 负责复现，相关实现 Agent 负责修复。

## 6. 推荐任务拆分模板

### 6.1 建立项目骨架

```md
Agent: Orchestrator Agent
Goal: 初始化项目并确定技术栈
Tasks:
- 创建前后端目录
- 添加 TypeScript
- 添加 lint/test/dev scripts
- 添加 README 初稿
Acceptance:
- 本地开发命令可运行
- 健康检查接口可访问
```

### 6.2 设计接口契约

```md
Agent: API Contract Agent
Goal: 统一 provider、model、generation 的数据结构
Tasks:
- 定义 shared types
- 定义 REST API
- 定义错误码
- 定义 adapter interface
Acceptance:
- 前后端可以基于同一份类型开发
- 错误结构统一
```

### 6.3 实现供应商适配器

```md
Agent: Provider Adapter Agent
Goal: 接入第一种 OpenAI-compatible image API
Tasks:
- 实现 testConnection
- 实现 listModels
- 实现 text-to-image
- 实现 image-to-image
- 兼容 URL/base path
Acceptance:
- mock provider 测试通过
- 错误被统一转换
```

### 6.4 实现前端主界面

```md
Agent: Frontend Agent
Goal: 完成可用的生图工作台
Tasks:
- Provider 配置面板
- Model 选择器
- 文生图表单
- 图生图表单
- 结果画廊
Acceptance:
- 不看文档也能完成一次生成
- 移动端和桌面端布局不崩
```

### 6.5 安全审查

```md
Agent: Security Agent
Goal: 检查 API Key、自定义 URL、上传文件风险
Tasks:
- 审查密钥存储
- 审查日志脱敏
- 审查 SSRF 风险
- 审查上传限制
Acceptance:
- 没有明显密钥泄露
- 任意 URL 请求有基本防护
- 上传文件大小和类型受限
```

## 7. 代码结构建议

```txt
image2-tool/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── providers/
│   │   │   │   ├── models/
│   │   │   │   ├── generation/
│   │   │   │   └── history/
│   │   │   ├── lib/
│   │   │   └── app/
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── routes/
│       │   ├── providers/
│       │   ├── services/
│       │   ├── storage/
│       │   ├── security/
│       │   └── index.ts
│       └── package.json
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts
│           └── errors.ts
├── docs/
│   ├── api-contract.md
│   ├── product-requirements.md
│   ├── provider-guide.md
│   └── security-review.md
├── tests/
│   ├── fixtures/
│   └── e2e/
├── agent.md
└── README.md
```

## 8. MVP 验收清单

- 可以添加一个 API Provider。
- 可以测试 URL 和 API Key 是否可用。
- 可以获取模型列表。
- 可以选择模型。
- 可以文生图。
- 可以图生图。
- 可以设置比例。
- 可以设置清晰度。
- 可以设置生成数量。
- 可以下载结果图片。
- API Key 不出现在前端源码、浏览器日志、服务端日志中。
- 常见错误有可读提示。

## 9. 关键技术风险

### 9.1 不同供应商接口不一致

应对：

- 用 adapter 层隔离差异。
- UI 只依赖统一结构。
- 对供应商原始字段保存在 `raw` 中，便于调试。

### 9.2 用户自定义 URL 带来 SSRF 风险

应对：

- 默认只允许 `https://`。
- 禁止访问私网 IP。
- 开发模式才允许 localhost。
- 设置请求超时。

### 9.3 API Key 泄露

应对：

- 前端不直接调用第三方 API。
- 后端代理请求。
- 日志脱敏。
- 错误响应不回显密钥。

### 9.4 图片生成任务时间长

应对：

- 支持 loading 状态。
- 后端设置合理超时。
- 如供应商返回任务 ID，则实现轮询。
- 后续可升级为队列。

## 10. 推荐给 Orchestrator Agent 的系统提示词

```md
你是 image2 生图工具项目的 Orchestrator Agent。

你的职责是协调 Product、API Contract、Provider Adapter、Backend、Frontend、Security、QA、Docs 等 Agent 完成项目。

工作原则：
- 每次只推进一个明确阶段。
- 先确认范围，再分派任务。
- 每个任务必须包含验收标准。
- 不允许专项 Agent 扩大任务范围。
- API 契约冲突由 API Contract Agent 解决。
- 安全风险由 Security Agent 审查，必要时有否决权。
- 每轮结束必须输出当前状态、已完成事项、阻塞点和下一步。

当前项目目标：
开发一个用户可自定义 API Base URL 和 API Key 的 image2 生图工具，支持获取模型列表、选择模型、文生图、图生图、调整比例和清晰度。
```

## 11. 推荐给专项 Agent 的通用提示词

```md
你是 image2 生图工具项目中的专项 Agent。

你必须遵守：
- 只处理分配给你的任务。
- 开始前输出 Task Brief。
- 完成后输出 Task Report。
- 修改接口前必须同步 API Contract Agent。
- 涉及 API Key、URL 请求、文件上传时必须同步 Security Agent。
- 涉及用户流程变化时必须同步 Product Agent。
- 涉及测试缺口时必须同步 QA Agent。

你的输出必须包含：
- 你做了什么
- 改了哪些文件
- 如何验证
- 有什么风险
- 下一步建议
```

## 12. 第一周开发建议

### Day 1

- 确定技术栈。
- 建立项目骨架。
- 写出 API 契约初稿。

### Day 2

- 实现 provider 配置。
- 实现连接测试。
- 实现密钥脱敏。

### Day 3

- 实现模型列表获取。
- 前端完成模型选择器。
- 增加 mock provider。

### Day 4

- 实现文生图。
- 前端完成文生图表单和结果画廊。

### Day 5

- 实现图生图。
- 增加上传限制。
- 完成基础测试。

### Day 6

- 历史记录。
- 复用参数。
- 错误体验优化。

### Day 7

- QA 回归。
- 安全审查。
- README 和使用文档。

## 13. 最小可行开发顺序

如果只想最快跑通，可以按这个顺序：

1. 建一个 mock provider。
2. 跑通 `listModels`。
3. 跑通 `text-to-image`。
4. 做一个简单 UI。
5. 接入真实 provider。
6. 再做 `image-to-image`。
7. 最后补历史、安全、测试、文档。

这个顺序可以避免一开始就被真实供应商的接口差异拖慢。

