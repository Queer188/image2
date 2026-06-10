# image2 v0.3.0 中文工作台发布说明

## 发布重点

- 默认界面升级为中文生图工作台，首屏保留“接口源 / 生成 / 结果 / 历史”的工作流。
- 桌面端保持左侧接口源与模型、中间生成参数、右侧结果与历史的三栏结构。
- 移动端使用“接口源 / 生成 / 结果 / 历史”四个顶部标签，390px 宽度下可用。
- 统一按钮、表单、状态提示、模型列表、结果画廊和历史记录的浅色专业工具样式。
- 修复发布验收发现的浏览器标题英文、favicon 404、连接测试详情英文残留问题。

## 浏览器验收记录

验收时间：2026-06-10

本轮使用本地 Fastify/Vite 开发服务和本地 mock provider 验收。Vite 因本机已有端口占用自动使用 `http://127.0.0.1:5177/`，API 服务使用 `http://127.0.0.1:3001`。

| 场景 | 结果 |
|---|---|
| 首次打开无接口源状态 | 通过。显示中文空状态和添加接口源表单。 |
| 添加接口源表单 | 通过。名称、接口地址、接口类型、能力补充、API 密钥、保存/测试按钮可用。 |
| 连接测试失败状态 | 通过。错误主文案为中文；已修复常见英文详情残留。 |
| 连接测试成功状态 | 通过。成功详情改为中文 HTTP 状态说明。 |
| 模型发现空状态 | 通过。空模型接口源显示“还没有可用模型”及下一步提示。 |
| 模型发现有模型状态 | 通过。长模型名和长模型 ID 可换行，文生图/图生图能力标签可见。 |
| 文生图表单 | 通过。模型、提示词、反向提示词、比例、清晰度、数量、种子和生成按钮可用。 |
| 图生图上传区域 | 通过。上传 PNG 后显示缩略图、文件名、MIME 和大小，生成按钮解锁。 |
| 生成结果画廊 | 通过。生成结果、预览、下载、复制地址按钮可见。 |
| 历史记录查看、复用、删除、清空 | 通过。复用恢复参数，单条删除成功，清空历史有二次确认。 |
| 长模型名、长 URL、长 prompt、长错误信息 | 通过。未发现横向滚动；长错误提示可换行。 |
| 用户可见英文、乱码、文字溢出 | 已修复标题和连接详情英文残留；供应商/用户输入中的英文按原样显示。 |

## 响应式验收

| 宽度 | 结果 | 截图 |
|---|---|---|
| 1280px | 通过，无横向滚动。 | `output/playwright/phase14-1280.png` |
| 1024px | 通过，无横向滚动，结果区换行正常。 | `output/playwright/phase14-1024.png` |
| 390px | 通过，无横向滚动，四个移动标签完整可点。 | `output/playwright/phase14-390-*.png` |

## 环境配置验收

- `npm run dev` 会先执行 `scripts/dev-local.mjs`，自动读取项目根目录 `.env`。
- 本轮日志确认输出：`Loaded .env keys: HOST, PORT, NODE_ENV, LOG_LEVEL, CORS_ORIGIN, ALLOW_LOCAL_PROVIDER_URLS, TRUSTED_PROVIDER_ORIGINS, IMAGE2_DATA_DIR`。
- 在 Windows 后台重定向方式下，`npm run dev` 的子进程 `stdio: inherit` 可能触发 `spawn EINVAL`；交互式终端直接运行不受影响。本轮浏览器验收使用 `npm run dev:raw` 启动服务。

## TRUSTED_PROVIDER_ORIGINS 说明

`TRUSTED_PROVIDER_ORIGINS` 只用于明确允许某些 provider origin 解析到私网、保留地址或 DNS 检查结果异常的情况。配置值必须是精确的 `http` 或 `https` origin，例如：

```txt
TRUSTED_PROVIDER_ORIGINS=https://www.right.codes
```

注意：

- 不支持通配符、路径、网段或协议外的值。
- 只放行匹配 origin 的 provider URL，不会关闭协议校验、重定向校验或其他 URL 安全策略。
- 本地开发优先使用 `ALLOW_LOCAL_PROVIDER_URLS=true` 允许 `http://localhost` / `http://127.0.0.1` provider。
- 生产或类生产部署应保持 `ALLOW_LOCAL_PROVIDER_URLS=false`，只在确认风险后添加必要的 trusted origin。

## 已知限制

- Provider 配置和 API 密钥仍只保存在本地服务端进程内，重启后需要重新添加。
- 上传的图生图参考图仍为内存保存，重启后丢失。
- 历史记录保存在本地 SQLite，未加密。
- 供应商私有参数不在 v0.3 范围内统一支持。

## 发布检查

```bash
npm run check
```

