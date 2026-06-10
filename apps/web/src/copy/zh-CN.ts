import type {
  ApiErrorCode,
  GenerateImageMode,
  ImageModel,
  ProviderType
} from "@image2/shared";

const apiErrorMessages: Record<ApiErrorCode, string> = {
  BAD_REQUEST: "请求参数有误，请检查填写内容后重试。",
  HISTORY_NOT_FOUND: "没有找到这条历史记录，可能已经被删除。",
  PROVIDER_NOT_FOUND: "没有找到这个接口源，请重新选择或保存接口源。",
  PROVIDER_AUTH_FAILED: "API 密钥无效或没有权限，请检查后重试。",
  PROVIDER_CONNECTION_FAILED: "接口源连接失败，请检查地址、网络或服务状态。",
  PROVIDER_GENERATION_FAILED: "图片生成失败，请检查模型、提示词和参数后重试。",
  PROVIDER_MODEL_LIST_FAILED: "模型列表获取失败，请检查接口源配置后重试。",
  PROVIDER_URL_BLOCKED: "这个接口地址被安全策略拦截，请使用允许的 HTTPS 地址。",
  INTERNAL_ERROR: "本地服务发生异常，请稍后重试。"
};

function localizeDetail(detail: string): string {
  return detail
    .replace(/Provider returned HTTP (\d+)\./g, "服务返回 HTTP $1。")
    .replace(/HTTP (\d+) Unauthorized/g, "HTTP $1 未授权")
    .replace(/HTTP (\d+) Forbidden/g, "HTTP $1 无权限")
    .replace(/No response body\./g, "响应内容为空。")
    .replace(/Connection failed\./g, "连接失败。")
    .replace(/Model discovery failed\./g, "模型发现失败。")
    .replace(/Image generation failed\./g, "图片生成失败。");
}

function withDetail(message: string, detail?: string): string {
  return detail ? `${message} 详情：${localizeDetail(detail)}` : message;
}

export const zhCN = {
  app: {
    version: "v0.3 中文化",
    title: "image2 生图工作台",
    tagline: "本地优先的 AI 生图工作台"
  },
  actions: {
    saveProvider: "保存接口源",
    saving: "保存中...",
    testConnection: "测试连接",
    testing: "测试中...",
    delete: "删除",
    newProvider: "新建",
    refreshModels: "刷新模型",
    loading: "加载中...",
    generate: "开始生成",
    generating: "生成中...",
    preview: "预览",
    download: "下载",
    copyUrl: "复制地址",
    clearHistory: "清空历史",
    viewResults: "查看结果",
    reuseParameters: "复用参数"
  },
  labels: {
    providerName: "接口源名称",
    apiBaseUrl: "接口地址",
    providerType: "接口类型",
    capabilityOverrides: "模型能力补充",
    apiKey: "API 密钥",
    currentKey: "当前密钥",
    modelForCurrentMode: "当前模式使用的模型",
    model: "模型",
    referenceImage: "上传参考图",
    prompt: "正向提示词",
    negativePrompt: "反向提示词",
    ratio: "画面比例",
    quality: "清晰度",
    count: "生成数量",
    seed: "种子",
    strength: "重绘强度"
  },
  values: {
    notAvailable: "未设置"
  },
  placeholders: {
    providerName: "OpenAI 兼容接口",
    apiBaseUrl: "https://api.example.com/v1",
    keepCurrentKey: "留空则继续使用已保存密钥",
    newApiKey: "sk-...",
    prompt: "描述你想生成的画面",
    negativePrompt: "不希望出现在画面中的元素",
    optional: "可选"
  },
  providerTypes: {
    auto: "自动识别",
    "openai-compatible": "OpenAI 兼容",
    "image2-compatible": "image2 兼容"
  } satisfies Record<ProviderType, string>,
  status: {
    connected: "已连接",
    testFailed: "连接失败",
    notTested: "未测试"
  },
  capabilities: {
    "text-to-image": "文生图",
    "image-to-image": "图生图"
  } satisfies Record<ImageModel["capabilities"][number], string>,
  modes: {
    "text-to-image": "文生图",
    "image-to-image": "图生图"
  } satisfies Record<GenerateImageMode, string>,
  quality: {
    standard: "标准",
    hd: "高清",
    ultra: "超清"
  },
  sections: {
    apiProvider: "API 接口源",
    addProvider: "添加接口源",
    editProvider: "编辑接口源",
    savedServices: "已保存服务",
    providers: "接口源",
    modelDiscovery: "模型发现",
    models: "模型",
    generate: "生成",
    results: "生成结果",
    gallery: "结果画廊",
    history: "历史记录",
    generationHistory: "生成历史"
  },
  aria: {
    savedProviders: "已保存接口源",
    generationMode: "生成模式",
    workbench: "生图工作台",
    workbenchMobileTabs: "工作台移动端分区"
  },
  mobileTabs: {
    source: "接口源",
    generate: "生成",
    results: "结果",
    history: "历史"
  },
  empty: {
    loadingProviders: "正在加载接口源...",
    noProviders:
      "还没有接口源。先添加一个 API 接口源，测试连接后再获取模型。",
    selectProviderForModels: "还没有选择接口源。选择或保存接口源后即可获取模型。",
    loadingModels: (providerName: string) =>
      `正在从 ${providerName} 加载模型...`,
    noImageModels:
      "还没有可用模型。请刷新模型；如果接口返回空列表，请检查接口类型或能力补充。",
    selectProviderBeforeGenerating: "生成前请先选择或保存接口源。",
    needTextModel: "生成前请先获取可用于文生图的模型。",
    needImageModel: "生成前请先获取可用于图生图的模型。",
    uploadingReference: "正在上传参考图...",
    generatedImagesPlaceholder:
      "还没有生成结果。完成一次文生图或图生图后，图片会显示在这里。",
    generatingImages: "正在生成图片...",
    noHistory: "还没有历史记录。成功生成后会自动保存，方便复用参数。",
    noPreviewUrl: "没有预览地址",
    noImageUrl: "没有返回图片地址"
  },
  messages: {
    providerSaved: "接口源已保存。API 密钥只保存在本地服务端进程中。",
    providerDeleted: "接口源已删除。",
    testSucceeded: (_message: string, statusCode?: number) =>
      `连接测试成功。详情：服务返回 HTTP ${statusCode ?? "未知"}。`,
    importedHistory: (count: number) =>
      count > 0
        ? `已导入 ${count} 条本地历史记录。`
        : "本地历史记录已是最新。",
    viewingSavedImages: (count: number) => `正在查看 ${count} 张历史图片。`,
    viewingHistoryFrom: (date: string) => `正在查看 ${date} 的生成结果。`,
    parametersReused: "参数已复用。",
    imageToImageParametersReused:
      "参数已复用。重新生成前请再次上传参考图。",
    historyParametersCopied: "历史参数已填入生成表单。",
    historyProviderMissing:
      "历史参数已填入生成表单，但原接口源已不在已保存列表中。",
    historyItemDeleted: "历史记录已删除。",
    historyCleared: "历史记录已清空。",
    imageUrlCopied: "图片地址已复制。",
    generatedImages: (count: number) => `已生成 ${count} 张图片。`,
    generationSavedToHistory: "本次生成已保存到历史记录。",
    modelSelected: (name: string) => `已选择 ${name}。`,
    modelsFetched: (date: string) => `获取时间：${date}。`,
    providerOverrides: (count: number) => ` - ${count} 条能力补充`
  },
  errors: {
    requestFailed: (status: number) =>
      withDetail("请求失败，请稍后重试。", `服务返回 HTTP ${status}。`),
    loadProviders: "接口源加载失败，请刷新页面后重试。",
    modelDiscovery: "模型发现失败，请检查接口源配置后重试。",
    historyLoad: "历史记录加载失败，请稍后重试。",
    browserHistoryFallback:
      "服务端历史记录暂时不可用。当前显示浏览器中的本地历史，服务恢复后会自动同步。",
    invalidCapabilityOverridesJsonArray:
      "模型能力补充格式不正确，请填写 JSON 数组。",
    invalidCapabilityOverrideObject:
      "每条模型能力补充都必须是对象。",
    capabilityOverrideMissingModel:
      "每条模型能力补充都需要填写 modelId。",
    unsupportedCapabilityOverride:
      "模型能力补充只能使用支持的能力类型。",
    invalidCapabilityOverrides: "模型能力补充格式不正确。",
    readSelectedImage: "无法读取所选图片，请重新选择。",
    unsupportedUploadType: "请上传 PNG、JPEG 或 WebP 格式的参考图。",
    uploadTooLarge: "参考图不能超过 5 MB。",
    uploadFailed: "参考图上传失败，请重试。",
    saveProvider: "接口源保存失败，请检查填写内容后重试。",
    needApiKeyToTest:
      "测试未保存的接口源变更时需要填写 API 密钥，或先保存接口源。",
    connectionFailed: "连接失败，请检查接口地址、API 密钥和网络状态。",
    deleteProvider: "接口源删除失败，请稍后重试。",
    serverHistoryDeleteBlocked:
      "请先恢复本地服务连接，再从当前视图删除浏览器历史记录。",
    serverHistoryClearBlocked:
      "请先恢复本地服务连接，再从当前视图清空浏览器历史记录。",
    historyDelete: "历史记录删除失败，请稍后重试。",
    historyClear: "历史记录清空失败，请稍后重试。",
    copyImageUrl: "当前浏览器无法复制图片地址，请手动复制。",
    selectProviderBeforeGenerating: "生成前请先选择接口源。",
    selectTextModelBeforeGenerating: "生成前请先选择文生图模型。",
    selectImageModelBeforeGenerating: "生成前请先选择图生图模型。",
    promptRequired: "请先填写正向提示词。",
    seedInteger: "种子必须是整数。",
    uploadReferenceBeforeGenerating: "图生图前请先上传参考图。",
    generationFailed: "图片生成失败，请检查参数后重试。",
    localizeApiError: (
      code: ApiErrorCode,
      message: string,
      detail?: string
    ): string => withDetail(apiErrorMessages[code] ?? message, detail ?? message)
  }
} as const;
