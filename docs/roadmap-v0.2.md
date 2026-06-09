# image2 v0.2 Roadmap

## 背景

v0.1 已完成本地 MVP 的主要闭环：provider 配置、连接测试、模型发现、文生图、图生图、上传限制、本地浏览器历史、安全审查和 release gate。当前主要限制是 provider 和 API Key 只保存在服务端进程内存中，上传图片也只保存在内存中，生成历史保存在浏览器 `localStorage` 中且不加密、不适合作为长期资料库。

v0.2 的定位是把 image2 从“可验证功能闭环的 MVP”升级为“可长期使用的本地生图工具”。本轮规划不实现功能，只定义后续 Phase 7 到 Phase 10 的产品目标、任务边界和验收标准。

## v0.2 产品目标

- 本地长期可用：应用重启后 provider、模型缓存、生成历史和用户偏好仍然可用。
- 密钥安全默认值更强：API Key 不再依赖进程内存长期保存，优先使用系统密钥链或本机加密方案。
- 历史记录可管理：生成历史从浏览器 `localStorage` 迁移到后端本地数据库，支持搜索、筛选、复用参数、删除和清理。
- 结果资产可留存：可选地把 provider 返回的图片 URL 或 base64 结果落到本地资产目录，降低远端 URL 过期导致历史失效的概率。
- 本地工具体验稳定：启动、迁移、错误恢复、备份、导入导出和 release 检查有明确路径。
- 继续保持本地优先：默认不引入账号、云同步或远程托管依赖。

## v0.2 非目标

- 不做账号体系、团队协作、权限管理或云同步。
- 不做供应商代理售卖、计费、额度管理或多租户部署。
- 不承诺兼容所有 provider 私有参数，只扩展通用参数和 adapter 能力边界。
- 不做复杂工作流节点编辑器、批量队列农场或训练/微调能力。
- 不把 image2 变成公开托管服务；v0.2 仍按本地单用户工具设计。
- 不默认把 API Key 明文存入 SQLite、日志、浏览器存储或导出文件。

## Phase 7: 本地持久化基础

### 目标

建立后端本地持久化层，替换 provider 进程内存存储，并为历史、模型缓存、用户偏好和后续资产管理提供稳定基础。

### 任务拆分

- API Contract Agent
  - 定义 v0.2 本地存储领域模型：providers、model_cache、generation_history、generation_images、app_settings。
  - 明确 `ProviderConfig.apiKeyRef` 仍是密钥引用，不是密钥内容。
  - 定义数据迁移版本号、记录时间字段、软删除或硬删除策略。
- Backend Agent
  - 引入本地 SQLite 作为默认持久化数据库。
  - 增加存储目录配置，例如 `IMAGE2_DATA_DIR`，默认使用项目本地 `.image2-data` 或用户数据目录。
  - 实现启动时数据库初始化和迁移执行。
  - 将 provider 元数据从内存 Map 迁移到 SQLite。
  - 保留现有 REST API 行为，避免前端大规模重写。
- Frontend Agent
  - 调整重启后的 provider 恢复体验。
  - 在 UI 中明确显示 provider 已持久保存，但 API Key 是否可用取决于密钥存储状态。
- QA Agent
  - 增加重启后 provider 仍存在的集成测试。
  - 增加迁移重复执行不破坏数据的测试。
  - 增加数据库文件缺失、损坏、目录不可写的错误场景测试。
- Docs Agent
  - 记录本地数据目录、备份建议、开发环境重置方式。

### 验收标准

- 重启 server 后，provider 名称、Base URL、连接状态、创建/更新时间仍然存在。
- `npm run check` 通过，且新增持久化测试覆盖 provider 保存、读取、更新、删除。
- 数据库迁移可重复运行，不重复建表，不破坏已有数据。
- 当数据目录不可写时，应用返回可读错误，不吞掉启动失败原因。
- API Key 明文不出现在 SQLite provider 表中。

## Phase 8: API Key 安全存储

### 目标

实现适合本地长期使用的 API Key 安全存储方案，让 provider 可以跨重启继续使用，同时避免把密钥明文写入普通数据库或日志。

### 任务拆分

- Security Agent
  - 评估并确定密钥后端优先级：系统密钥链优先，本机加密文件作为受控 fallback。
  - 定义密钥生命周期：创建、替换、删除、不可用恢复、导出限制。
  - 更新安全威胁模型，覆盖本机恶意软件、备份泄露、日志泄露和导出泄露。
- Backend Agent
  - 实现 `SecretStore` 接口，至少包含 `set`, `get`, `delete`, `has`。
  - 推荐默认后端：Windows Credential Manager、macOS Keychain、Linux Secret Service；无法使用时提示用户启用本机加密 fallback。
  - SQLite 只保存 `apiKeyRef`、`apiKeyPreview`、密钥后端类型和密钥可用状态。
  - 删除 provider 时同步删除密钥。
  - API Key 获取失败时返回明确错误，例如“密钥不可用，请重新输入 API Key”。
- Frontend Agent
  - 在 provider 列表中展示密钥状态：可用、缺失、需要重新授权。
  - 编辑 provider 时继续允许只更新名称/Base URL，只有输入新 key 时才替换密钥。
- QA Agent
  - 增加密钥替换、删除、缺失恢复、错误脱敏测试。
  - 增加 mock SecretStore，确保 CI 不依赖真实系统密钥链。
- Docs Agent
  - 写明每个平台的密钥存储行为和 fallback 风险。

### 验收标准

- 重启 server 后，保存过 API Key 的 provider 可以继续测试连接、获取模型和生成图片。
- SQLite、浏览器存储、普通日志和错误响应中不包含 API Key 明文。
- 删除 provider 后，对应密钥引用不可再读取。
- 系统密钥链不可用时，用户看到明确降级说明或修复指引。
- CI 测试使用 mock SecretStore，release 手工检查覆盖至少一个真实平台密钥后端。

## Phase 9: 历史记录、资产留存与模型缓存

### 目标

把浏览器 `localStorage` 历史升级为可长期维护的本地资料库，并引入模型缓存和可选本地图片资产保存。

### 任务拆分

- Product Agent
  - 定义历史页信息架构：搜索、模式筛选、provider/model 筛选、日期筛选、收藏、删除。
  - 定义资产保留策略 UI：只保存参数、保存生成结果副本、按容量自动清理。
- API Contract Agent
  - 增加 history REST API：列表、详情、创建、删除、批量删除、复用参数、收藏。
  - 定义 generation image 资产字段：remoteUrl、localAssetPath、mimeType、sizeBytes、width、height、checksum。
  - 定义 model cache 字段：providerId、models、fetchedAt、expiresAt、sourceHash。
- Backend Agent
  - 将生成成功记录写入 SQLite，不再只依赖浏览器 `localStorage`。
  - 实现模型列表缓存，支持手动刷新和过期刷新。
  - 实现本地资产目录，例如 `assets/generated` 和 `assets/uploads`。
  - 对 provider 返回的 base64/data URL 结果保存为本地文件；远端 URL 结果可按用户设置选择是否下载副本。
  - 增加资产清理策略：按数量、总容量、时间或手动删除。
- Frontend Agent
  - 将历史面板改为后端历史数据源。
  - 支持历史搜索、筛选、收藏、复用参数、查看本地资产状态。
  - 对图生图历史明确展示参考图是否已保留，缺失时提示重新上传。
- Security Agent
  - 审查远端图片下载 SSRF 和内容类型风险。
  - 规定本地资产文件名不能直接使用用户输入，必须使用 id/checksum 派生。
  - 确保导出历史时默认不包含 API Key 和敏感 headers。
- QA Agent
  - 增加历史持久化、模型缓存、资产保存、资产清理和迁移测试。

### 验收标准

- 重启浏览器和 server 后，生成历史仍可查看和复用。
- 历史记录可以按 prompt、模式、provider/model、日期和收藏状态筛选。
- 模型列表可在离线或 provider 临时失败时显示最近缓存，并标记缓存时间。
- provider 返回 data URL/base64 图片时，本地资产文件可保存、预览、下载。
- 清理历史时，关联资产按用户选择删除或保留，行为可预测。
- 资产文件名、错误响应和导出文件不包含 API Key、Authorization header 或上传原始 data URL。

## Phase 10: 长期使用体验与发布硬化

### 目标

补齐长期使用所需的运维、恢复、导入导出、可观测性和发布质量门槛，使 v0.2 可以作为稳定本地版本发布。

### 任务拆分

- Product Agent
  - 定义首次启动、数据目录选择、迁移失败、密钥缺失、资产目录不可写的用户恢复流程。
  - 定义设置页范围：数据目录、密钥后端状态、历史保留策略、模型缓存刷新策略、导入导出。
- Backend Agent
  - 增加健康检查扩展信息：数据库可用、密钥后端可用、资产目录可写、迁移版本。
  - 增加结构化应用诊断导出，默认脱敏。
  - 实现 provider/model/history/settings 的导入导出；默认不导出 API Key。
  - 为长耗时 generation 增加更清晰的超时、取消或任务状态边界设计。
- Frontend Agent
  - 增加设置页和诊断状态。
  - 增加导入导出入口和失败恢复提示。
  - 优化生成中、取消、超时、provider 失败后的状态恢复。
- Security Agent
  - 复审 CORS、SSRF、密钥存储、资产下载和导入文件校验。
  - 明确公开部署仍非 v0.2 支持场景，并在 README 中保持警示。
- QA Agent
  - 增加 E2E 冒烟：首次启动、保存 provider、重启恢复、生成、历史复用、导出诊断。
  - 增加跨平台路径、Windows 文件锁、目录权限相关测试或手工检查。
- Docs Agent
  - 更新 README、development、security review、troubleshooting。
  - 增加 v0.2 release notes 和升级说明。

### 验收标准

- 设置页能展示数据库、密钥后端、资产目录和模型缓存状态。
- 用户可以导出不含 API Key 的配置、历史和诊断信息。
- 导入无效文件不会破坏现有数据，并给出可读错误。
- 迁移失败、密钥缺失、资产目录不可写都有明确恢复路径。
- v0.2 release 前 `npm run check` 通过，手工验收清单完成。
- README 能让新用户完成安装、配置、生成、备份和基本故障排查。

## 数据持久化方案建议

推荐采用“后端 SQLite + 本地资产目录 + 浏览器轻量偏好”的本地优先架构。

### SQLite

- 用途：provider 元数据、模型缓存、生成历史、生成图片索引、用户设置、迁移版本。
- 不存：API Key 明文、Authorization header、上传图片 data URL、provider 原始敏感响应。
- 表建议：
  - `schema_migrations(version, applied_at)`
  - `providers(id, name, base_url, api_key_ref, api_key_preview, secret_backend, secret_status, last_test_status, last_tested_at, created_at, updated_at, deleted_at)`
  - `model_cache(provider_id, models_json, fetched_at, expires_at, source_hash)`
  - `generation_history(id, provider_id, provider_name, model_id, model_name, mode, prompt, negative_prompt, ratio, quality, count, seed, strength, input_image_json, created_at, favorite, deleted_at)`
  - `generation_images(id, history_id, remote_url, local_asset_path, mime_type, size_bytes, width, height, seed, checksum, metadata_json, created_at)`
  - `app_settings(key, value_json, updated_at)`
- 迁移策略：只允许前向迁移；迁移脚本必须幂等；启动时先备份当前数据库或至少记录迁移前版本。

### 本地资产目录

- 用途：生成结果副本、可选上传参考图副本、缩略图缓存。
- 目录建议：
  - `assets/generated/YYYY/MM/<image-id>.<ext>`
  - `assets/uploads/YYYY/MM/<upload-id>.<ext>`
  - `assets/thumbs/<image-id>.webp`
- 文件名策略：使用内部 id 或 checksum，不使用 prompt、provider 名称或用户上传文件名。
- 清理策略：支持按总容量、时间、历史删除联动和手动清理。

### 浏览器存储

- 用途：纯 UI 偏好，例如当前展开面板、最近选择的 tab、临时草稿。
- 不存：API Key、长期历史、上传图片 data URL、大型生成结果。

## API Key 安全存储方案建议

推荐实现 `SecretStore` 抽象，避免业务逻辑绑定具体密钥后端。

```ts
type SecretStore = {
  kind: "system-keychain" | "encrypted-file" | "memory";
  set(ref: string, value: string): Promise<void>;
  get(ref: string): Promise<string>;
  delete(ref: string): Promise<void>;
  has(ref: string): Promise<boolean>;
};
```

### 推荐优先级

1. 系统密钥链：Windows Credential Manager、macOS Keychain、Linux Secret Service。
2. 本机加密文件 fallback：仅在系统密钥链不可用时启用，并明确提示风险。
3. 内存模式：只用于测试或显式临时会话，不作为 v0.2 默认长期方案。

### 存储规则

- SQLite 只保存 `apiKeyRef`、`apiKeyPreview`、`secretBackend` 和 `secretStatus`。
- API Key 创建和更新只在请求入口、SecretStore、provider adapter runtime 中短暂出现。
- 日志 redaction 继续覆盖 `apiKey`、Authorization、Bearer token、`sk-*` 模式和 provider 原始错误摘要。
- 导出配置默认不包含 API Key；如果未来支持密钥导出，必须是单独显式动作并要求用户确认加密方式。
- 密钥不可读时，provider 保留但进入 `secret_missing` 或 `needs_reauth` 状态。

## 风险清单

- 系统密钥链跨平台差异大：需要 mock 测试和真实平台手工验证。
- SQLite 迁移失败可能导致用户数据不可用：需要迁移前备份和清晰恢复文档。
- 远端图片 URL 下载可能引入 SSRF 和大文件风险：必须复用 URL 安全策略、限制 content type、大小和 redirect。
- 本地资产目录可能快速膨胀：需要容量限制、清理策略和可见的占用信息。
- 浏览器 localStorage 到 SQLite 的历史迁移可能重复导入：需要去重 id 或 checksum 策略。
- API Key fallback 加密如果密钥材料管理不当，可能给用户错误安全感：必须明确威胁模型和限制。
- Provider 返回格式继续分化：adapter 层要保持兼容边界，避免 UI 依赖私有字段。
- 长耗时生成和取消语义不统一：v0.2 需要定义本地取消只取消客户端等待，还是尝试取消 provider 任务。
- 数据导入功能可能覆盖或污染现有数据：必须默认合并、预览变更，并支持失败回滚。
- 公开部署误用风险仍存在：README 和 security review 必须继续强调 v0.2 是本地单用户工具。

## 发布检查清单

- `npm install` 可在干净环境完成。
- `npm run check` 通过。
- 数据库初始化、迁移、重复启动和空数据启动均通过测试。
- Provider 可跨 server 重启保存和恢复。
- API Key 可跨 server 重启安全读取，并且明文不出现在 SQLite、浏览器存储、日志和错误响应中。
- 删除 provider 会删除或失效对应密钥引用。
- 模型缓存可刷新、可过期、可在 provider 临时失败时显示最近缓存。
- 文生图和图生图成功记录会写入后端历史。
- 历史记录可搜索、筛选、复用、删除和清理。
- 本地资产保存、预览、下载和清理通过测试。
- 上传限制仍覆盖 PNG/JPEG/WebP 和大小限制。
- SSRF 防护覆盖 provider URL 和远端资产下载。
- CORS 在生产环境没有宽松默认值。
- 导出文件默认不包含 API Key。
- 导入无效文件不会破坏现有数据。
- README、development、security review、troubleshooting 和 release notes 已更新。
- 至少完成一次手工冒烟：首次启动、添加 provider、测试连接、获取模型、文生图、图生图、重启恢复、历史复用、删除 provider。

