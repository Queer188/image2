import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type {
  ApiErrorResponse,
  GeneratedImage,
  GenerationHistoryRecord,
  GenerateImageMode,
  GenerateImageResponse,
  HistoryListResponse,
  ImageModel,
  ImportHistoryResponse,
  ModelListResponse,
  ProviderCapabilityOverride,
  ProviderConfig,
  ProviderListResponse,
  ProviderTestResponse,
  ProviderType,
  UploadedImageRef,
  UploadImageResponse
} from "@image2/shared";

type FormState = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  providerType: ProviderType;
  capabilityOverridesText: string;
};

type GenerationFormState = {
  prompt: string;
  negativePrompt: string;
  ratio: string;
  quality: string;
  count: number;
  seed: string;
  strength: number;
};

type UploadedInputState = {
  id: string;
  fileName?: string;
  mimeType: UploadedImageRef["mimeType"];
  sizeBytes: number;
  previewUrl: string;
};

const emptyForm: FormState = {
  name: "",
  baseUrl: "",
  apiKey: "",
  providerType: "auto",
  capabilityOverridesText: ""
};

const emptyGenerationForm: GenerationFormState = {
  prompt: "",
  negativePrompt: "",
  ratio: "1:1",
  quality: "standard",
  count: 1,
  seed: "",
  strength: 0.5
};

const ratioOptions = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const qualityOptions = ["standard", "hd", "ultra"];
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const allowedUploadMimeTypes = ["image/png", "image/jpeg", "image/webp"];
const HISTORY_STORAGE_KEY = "image2:generation-history:v1";
const HISTORY_MIGRATION_KEY = "image2:generation-history:v1:migrated";
const MAX_HISTORY_ITEMS = 50;

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return payload.error.detail
      ? `${payload.error.message} ${payload.error.detail}`
      : payload.error.message;
  } catch {
    return `Request failed with HTTP ${response.status}.`;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return (await response.json()) as T;
}

function formatStatus(provider: ProviderConfig): string {
  if (provider.lastTestStatus === "success") {
    return "Connected";
  }

  if (provider.lastTestStatus === "failed") {
    return "Test failed";
  }

  return "Not tested";
}

function formatCapability(capability: ImageModel["capabilities"][number]): string {
  return capability === "text-to-image" ? "Text to image" : "Image to image";
}

function formatProviderType(providerType: ProviderConfig["providerType"]): string {
  if (providerType === "openai-compatible") {
    return "OpenAI-compatible";
  }

  if (providerType === "image2-compatible") {
    return "image2-compatible";
  }

  return "Auto";
}

function capabilityOverridesText(
  overrides: ProviderCapabilityOverride[] | undefined
): string {
  return overrides && overrides.length > 0
    ? JSON.stringify(overrides, null, 2)
    : "";
}

function parseCapabilityOverrides(
  text: string
): ProviderCapabilityOverride[] | undefined {
  if (!text.trim()) {
    return undefined;
  }

  const parsed = JSON.parse(text) as unknown;
  const capabilities = new Set(["text-to-image", "image-to-image"]);

  if (!Array.isArray(parsed)) {
    throw new Error("Capability overrides must be a JSON array.");
  }

  const overrides = parsed.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Each capability override must be an object.");
    }

    const record = item as Partial<ProviderCapabilityOverride>;
    if (!record.modelId?.trim()) {
      throw new Error("Each capability override needs a modelId.");
    }

    if (
      !Array.isArray(record.capabilities) ||
      record.capabilities.length === 0 ||
      record.capabilities.some((capability) => !capabilities.has(capability))
    ) {
      throw new Error("Capability overrides must use supported capabilities.");
    }

    return {
      modelId: record.modelId.trim(),
      capabilities: [...new Set(record.capabilities)]
    };
  });

  return overrides.length > 0 ? overrides : undefined;
}

function supportsTextToImage(model: ImageModel): boolean {
  return model.capabilities.includes("text-to-image");
}

function supportsImageToImage(model: ImageModel): boolean {
  return model.capabilities.includes("image-to-image");
}

function supportsGenerationMode(model: ImageModel, mode: GenerateImageMode): boolean {
  return mode === "text-to-image"
    ? supportsTextToImage(model)
    : supportsImageToImage(model);
}

function downloadName(image: GeneratedImage, index: number): string {
  return `${image.id || `image-${index + 1}`}.png`;
}

function historyImageDownloadName(
  record: GenerationHistoryRecord,
  image: GeneratedImage,
  index: number
): string {
  return `${record.id}-${downloadName(image, index)}`;
}

function imageHref(image: GeneratedImage | undefined): string | undefined {
  return image?.url ?? image?.localPath;
}

function createHistoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadGenerationHistory(): GenerationHistoryRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!rawHistory) {
      return [];
    }

    const parsed = JSON.parse(rawHistory) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (record): record is GenerationHistoryRecord =>
        typeof record === "object" &&
        record !== null &&
        "id" in record &&
        "parameters" in record &&
        "images" in record &&
        Array.isArray((record as GenerationHistoryRecord).images)
    );
  } catch {
    return [];
  }
}

function formatMode(mode: GenerateImageMode): string {
  return mode === "text-to-image" ? "Text to image" : "Image to image";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read the selected image."));
    });
    reader.addEventListener("error", () => {
      reject(new Error("Unable to read the selected image."));
    });
    reader.readAsDataURL(file);
  });
}

export function App() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [activeMode, setActiveMode] = useState<GenerateImageMode>("text-to-image");
  const [generationForm, setGenerationForm] =
    useState<GenerationFormState>(emptyGenerationForm);
  const [uploadedInput, setUploadedInput] = useState<UploadedInputState>();
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generationHistory, setGenerationHistory] = useState<
    GenerationHistoryRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isUploadingInput, setIsUploadingInput] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelFetchedAt, setModelFetchedAt] = useState<string>();
  const [modelError, setModelError] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();
  const [generationMessage, setGenerationMessage] = useState<string>();
  const [generationError, setGenerationError] = useState<string>();
  const [historyMessage, setHistoryMessage] = useState<string>();
  const [historyError, setHistoryError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.id),
    [providers, form.id]
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId),
    [models, selectedModelId]
  );
  const textToImageModels = useMemo(
    () => models.filter(supportsTextToImage),
    [models]
  );
  const imageToImageModels = useMemo(
    () => models.filter(supportsImageToImage),
    [models]
  );
  const activeModeModels = useMemo(
    () => models.filter((model) => supportsGenerationMode(model, activeMode)),
    [models, activeMode]
  );

  async function loadProviders(options: { preserveStatus?: boolean } = {}) {
    setIsLoading(true);
    if (!options.preserveStatus) {
      setError(undefined);
    }

    try {
      const payload = await readJson<ProviderListResponse>(
        await fetch("/api/providers")
      );
      setProviders(payload.providers);
    } catch (loadError) {
      if (!options.preserveStatus) {
        setError(loadError instanceof Error ? loadError.message : "Load failed.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function loadModels(providerId = form.id) {
    if (!providerId) {
      setModels([]);
      setSelectedModelId("");
      setModelFetchedAt(undefined);
      setModelError(undefined);
      return;
    }

    setIsLoadingModels(true);
    setModelError(undefined);

    try {
      const payload = await readJson<ModelListResponse>(
        await fetch("/api/models/list", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({ providerId })
        })
      );
      setModels(payload.models);
      setModelFetchedAt(payload.fetchedAt);
      setSelectedModelId((current) =>
        payload.models.some(
          (model) => model.id === current && supportsGenerationMode(model, activeMode)
        )
          ? current
          : (payload.models.find((model) =>
              supportsGenerationMode(model, activeMode)
            )?.id ??
            payload.models[0]?.id ??
            "")
      );
    } catch (loadError) {
      setModels([]);
      setSelectedModelId("");
      setModelFetchedAt(undefined);
      setModelError(
        loadError instanceof Error ? loadError.message : "Model discovery failed."
      );
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function importLocalHistoryIfNeeded(): Promise<
    ImportHistoryResponse | undefined
  > {
    if (typeof window === "undefined") {
      return undefined;
    }

    if (window.localStorage.getItem(HISTORY_MIGRATION_KEY)) {
      return undefined;
    }

    const records = loadGenerationHistory();
    if (records.length === 0) {
      window.localStorage.setItem(HISTORY_MIGRATION_KEY, "true");
      return undefined;
    }

    const result = await readJson<ImportHistoryResponse>(
      await fetch("/api/history/import", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          records: records.slice(0, MAX_HISTORY_ITEMS)
        })
      })
    );

    window.localStorage.setItem(HISTORY_MIGRATION_KEY, "true");
    window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    return result;
  }

  async function loadHistory() {
    setHistoryError(undefined);

    try {
      const migrated = await importLocalHistoryIfNeeded();
      if (migrated) {
        setGenerationHistory(migrated.records.slice(0, MAX_HISTORY_ITEMS));
        setHistoryMessage(
          migrated.imported > 0
            ? `Imported ${migrated.imported} saved history item(s).`
            : "Saved history is already up to date."
        );
        return;
      }

      const payload = await readJson<HistoryListResponse>(await fetch("/api/history"));
      setGenerationHistory(payload.records.slice(0, MAX_HISTORY_ITEMS));
    } catch (loadError) {
      const fallback = loadGenerationHistory();
      if (fallback.length > 0) {
        setGenerationHistory(fallback.slice(0, MAX_HISTORY_ITEMS));
        setHistoryError(
          "Server history is unavailable. Showing browser history until the server can be reached."
        );
        return;
      }

      setHistoryError(
        loadError instanceof Error ? loadError.message : "History could not be loaded."
      );
    }
  }

  useEffect(() => {
    void loadProviders();
    void loadHistory();
  }, []);

  useEffect(() => {
    void loadModels(selectedProvider?.id);
    setGeneratedImages([]);
    setGenerationMessage(undefined);
    setGenerationError(undefined);
  }, [selectedProvider?.id]);

  useEffect(() => {
    setSelectedModelId((current) =>
      models.some((model) => model.id === current && supportsGenerationMode(model, activeMode))
        ? current
        : (models.find((model) => supportsGenerationMode(model, activeMode))?.id ?? "")
    );
    setGenerationMessage(undefined);
    setGenerationError(undefined);
  }, [activeMode, models]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function resetForm() {
    setForm(emptyForm);
    setMessage(undefined);
    setError(undefined);
  }

  function updateGenerationField(
    field: keyof GenerationFormState,
    value: string | number
  ) {
    setGenerationForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function uploadReferenceImage(file: File) {
    setIsUploadingInput(true);
    setUploadError(undefined);
    setUploadedInput(undefined);

    if (!allowedUploadMimeTypes.includes(file.type)) {
      setUploadError("Upload a PNG, JPEG, or WebP reference image.");
      setIsUploadingInput(false);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError("Reference image must be 5 MB or smaller.");
      setIsUploadingInput(false);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await readJson<UploadImageResponse>(
        await fetch("/api/images/upload", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type,
            dataUrl
          })
        })
      );

      setUploadedInput({
        id: result.image.id,
        fileName: result.image.fileName,
        mimeType: result.image.mimeType,
        sizeBytes: result.image.sizeBytes,
        previewUrl: dataUrl
      });
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error ? uploadFailure.message : "Upload failed."
      );
    } finally {
      setIsUploadingInput(false);
    }
  }

  function handleReferenceImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void uploadReferenceImage(file);
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    setError(undefined);

    const isEditing = Boolean(form.id);
    let capabilityOverrides: ProviderCapabilityOverride[] | undefined;

    try {
      capabilityOverrides = parseCapabilityOverrides(form.capabilityOverridesText);
    } catch (overrideError) {
      setError(
        overrideError instanceof Error
          ? overrideError.message
          : "Capability overrides are invalid."
      );
      setIsSaving(false);
      return;
    }

    const payload = {
      name: form.name,
      baseUrl: form.baseUrl,
      providerType: form.providerType,
      capabilityOverrides: capabilityOverrides ?? [],
      ...(form.apiKey ? { apiKey: form.apiKey } : {})
    };

    try {
      const response = await fetch(
        isEditing ? `/api/providers/${form.id}` : "/api/providers",
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );
      const provider = await readJson<ProviderConfig>(response);

      setProviders((current) => {
        if (isEditing) {
          return current.map((item) => (item.id === provider.id ? provider : item));
        }

        return [...current, provider];
      });
      setForm({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: "",
        providerType: provider.providerType ?? "auto",
        capabilityOverridesText: capabilityOverridesText(provider.capabilityOverrides)
      });
      setMessage("Provider saved. API Key is stored only in the server process.");
      if (isEditing) {
        await loadModels(provider.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function testProvider() {
    setIsTesting(true);
    setMessage(undefined);
    setError(undefined);

    const useSavedProvider = Boolean(form.id) && !form.apiKey;
    const payload = useSavedProvider
      ? { providerId: form.id }
      : {
          baseUrl: form.baseUrl,
          apiKey: form.apiKey
        };

    try {
      const result = await readJson<ProviderTestResponse>(
        await fetch("/api/providers/test", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      );
      setMessage(`${result.message} HTTP ${result.statusCode ?? "n/a"}.`);
      await loadProviders({ preserveStatus: true });
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : "Connection failed.");
      await loadProviders({ preserveStatus: true });
    } finally {
      setIsTesting(false);
    }
  }

  async function deleteSelectedProvider() {
    if (!form.id) {
      return;
    }

    setIsSaving(true);
    setMessage(undefined);
    setError(undefined);

    try {
      const response = await fetch(`/api/providers/${form.id}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setProviders((current) => current.filter((provider) => provider.id !== form.id));
      resetForm();
      setMessage("Provider deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Delete failed."
      );
    } finally {
      setIsSaving(false);
    }
  }

  function editProvider(provider: ProviderConfig) {
    setForm({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: "",
      providerType: provider.providerType ?? "auto",
      capabilityOverridesText: capabilityOverridesText(provider.capabilityOverrides)
    });
    setMessage(undefined);
    setError(undefined);
  }

  function createGenerationHistoryRecord(
    images: GeneratedImage[],
    generatedAt: string,
    seed: number | undefined,
    trimmedPrompt: string
  ): GenerationHistoryRecord | undefined {
    if (!selectedProvider || !selectedModel) {
      return undefined;
    }

    return {
      id: createHistoryId(),
      createdAt: generatedAt,
      providerId: selectedProvider.id,
      providerName: selectedProvider.name,
      modelId: selectedModel.id,
      modelName: selectedModel.name,
      parameters: {
        mode: activeMode,
        prompt: trimmedPrompt,
        negativePrompt: generationForm.negativePrompt.trim() || undefined,
        ratio: generationForm.ratio,
        quality: generationForm.quality,
        count: generationForm.count,
        seed,
        strength: activeMode === "image-to-image" ? generationForm.strength : undefined,
        inputImage:
          activeMode === "image-to-image" && uploadedInput
            ? {
                fileName: uploadedInput.fileName,
                mimeType: uploadedInput.mimeType,
                sizeBytes: uploadedInput.sizeBytes
              }
            : undefined
      },
      images
    };
  }

  function viewHistoryRecord(record: GenerationHistoryRecord) {
    setGeneratedImages(record.images);
    setGenerationMessage(`Viewing ${record.images.length} saved image(s).`);
    setGenerationError(undefined);
    setHistoryMessage(`Viewing results from ${formatDate(record.createdAt)}.`);
    setHistoryError(undefined);
  }

  function reuseHistoryRecord(record: GenerationHistoryRecord) {
    const matchingProvider = providers.find(
      (provider) => provider.id === record.providerId
    );

    if (matchingProvider) {
      editProvider(matchingProvider);
    }

    setActiveMode(record.parameters.mode);
    setSelectedModelId(record.modelId);
    setGenerationForm({
      prompt: record.parameters.prompt,
      negativePrompt: record.parameters.negativePrompt ?? "",
      ratio: record.parameters.ratio ?? "1:1",
      quality: record.parameters.quality ?? "standard",
      count: record.parameters.count ?? 1,
      seed: record.parameters.seed === undefined ? "" : String(record.parameters.seed),
      strength: record.parameters.strength ?? 0.5
    });
    setGeneratedImages(record.images);
    setGenerationError(undefined);
    setUploadError(undefined);

    if (record.parameters.mode === "image-to-image") {
      setUploadedInput(undefined);
      setGenerationMessage(
        "Parameters reused. Upload the reference image again before regenerating."
      );
    } else {
      setGenerationMessage("Parameters reused.");
    }

    setHistoryMessage(
      matchingProvider
        ? "History parameters copied into the generation form."
        : "History parameters copied, but the original provider is no longer saved."
    );
    setHistoryError(undefined);
  }

  async function deleteHistoryRecord(recordId: string) {
    try {
      const response = await fetch(`/api/history/${encodeURIComponent(recordId)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setGenerationHistory((current) =>
        current.filter((record) => record.id !== recordId)
      );
      setHistoryMessage("History item deleted.");
      setHistoryError(undefined);
    } catch (deleteError) {
      setHistoryError(
        deleteError instanceof Error ? deleteError.message : "History delete failed."
      );
      setHistoryMessage(undefined);
    }
  }

  async function clearHistory() {
    try {
      const response = await fetch("/api/history", {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setGenerationHistory([]);
      setHistoryMessage("History cleared.");
      setHistoryError(undefined);
    } catch (clearError) {
      setHistoryError(
        clearError instanceof Error ? clearError.message : "History clear failed."
      );
      setHistoryMessage(undefined);
    }
  }

  async function copyImageUrl(url: string) {
    try {
      await copyText(url);
      setHistoryMessage("Image URL copied.");
      setHistoryError(undefined);
    } catch {
      setHistoryError("Unable to copy the image URL in this browser.");
      setHistoryMessage(undefined);
    }
  }

  async function generateImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsGenerating(true);
    setGenerationMessage(undefined);
    setGenerationError(undefined);

    if (!selectedProvider) {
      setGenerationError("Select a provider before generating images.");
      setIsGenerating(false);
      return;
    }

    if (!selectedModel || !supportsGenerationMode(selectedModel, activeMode)) {
      setGenerationError(
        activeMode === "text-to-image"
          ? "Select a text-to-image model before generating."
          : "Select an image-to-image model before generating."
      );
      setIsGenerating(false);
      return;
    }

    const trimmedPrompt = generationForm.prompt.trim();
    if (!trimmedPrompt) {
      setGenerationError("Prompt is required.");
      setIsGenerating(false);
      return;
    }

    const seed =
      generationForm.seed.trim() === "" ? undefined : Number(generationForm.seed);
    if (seed !== undefined && !Number.isInteger(seed)) {
      setGenerationError("Seed must be an integer.");
      setIsGenerating(false);
      return;
    }

    if (activeMode === "image-to-image" && !uploadedInput) {
      setGenerationError("Upload a reference image before generating.");
      setIsGenerating(false);
      return;
    }

    try {
      const result = await readJson<GenerateImageResponse>(
        await fetch("/api/images/generate", {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            providerId: selectedProvider.id,
            modelId: selectedModel.id,
            modelName: selectedModel.name,
            mode: activeMode,
            prompt: trimmedPrompt,
            negativePrompt: generationForm.negativePrompt.trim() || undefined,
            ratio: generationForm.ratio,
            quality: generationForm.quality,
            count: generationForm.count,
            seed,
            strength:
              activeMode === "image-to-image" ? generationForm.strength : undefined,
            inputImageId: activeMode === "image-to-image" ? uploadedInput?.id : undefined
          })
        })
      );

      setGeneratedImages(result.images);
      setGenerationMessage(`Generated ${result.images.length} image(s).`);
      const historyRecord =
        result.historyRecord ??
        createGenerationHistoryRecord(
          result.images,
          result.generatedAt,
          seed,
          trimmedPrompt
        );

      if (historyRecord) {
        setGenerationHistory((current) =>
          [historyRecord, ...current.filter((record) => record.id !== historyRecord.id)].slice(
            0,
            MAX_HISTORY_ITEMS
          )
        );
        setHistoryMessage("Generation saved to history.");
        setHistoryError(undefined);
      }
    } catch (generateError) {
      setGenerationError(
        generateError instanceof Error ? generateError.message : "Generation failed."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Phase 5</p>
          <h1>image2 Generation Workbench</h1>
        </div>
        <span className="status-pill">Generation history and polish</span>
      </header>

      <section className="workspace" aria-labelledby="provider-title">
        <form className="provider-form" onSubmit={saveProvider}>
          <div className="section-heading">
            <p className="eyebrow">API Provider</p>
            <h2 id="provider-title">
              {form.id ? "Edit provider" : "Add provider"}
            </h2>
          </div>

          <label>
            Provider name
            <input
              autoComplete="off"
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="OpenAI compatible"
              required
              value={form.name}
            />
          </label>

          <label>
            API Base URL
            <input
              inputMode="url"
              onChange={(event) => updateField("baseUrl", event.target.value)}
              placeholder="https://api.example.com/v1"
              required
              value={form.baseUrl}
            />
          </label>

          <label>
            Provider type
            <select
              onChange={(event) =>
                updateField("providerType", event.target.value as ProviderType)
              }
              value={form.providerType}
            >
              <option value="auto">Auto</option>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="image2-compatible">image2-compatible</option>
            </select>
          </label>

          <label>
            Capability overrides
            <textarea
              onChange={(event) =>
                updateField("capabilityOverridesText", event.target.value)
              }
              placeholder='[{"modelId":"image-edit-pro","capabilities":["image-to-image"]}]'
              rows={3}
              value={form.capabilityOverridesText}
            />
          </label>

          <label>
            API Key
            <input
              autoComplete="new-password"
              onChange={(event) => updateField("apiKey", event.target.value)}
              placeholder={form.id ? "Leave blank to keep current key" : "sk-..."}
              required={!form.id}
              type="password"
              value={form.apiKey}
            />
          </label>

          {selectedProvider ? (
            <p className="key-preview">
              Current key: <strong>{selectedProvider.apiKeyPreview}</strong>
            </p>
          ) : null}

          <div className="button-row">
            <button
              disabled={
                isSaving ||
                !form.name.trim() ||
                !form.baseUrl.trim() ||
                (!form.id && !form.apiKey.trim())
              }
              type="submit"
            >
              {isSaving ? "Saving..." : "Save provider"}
            </button>
            <button
              disabled={
                isTesting ||
                isSaving ||
                (form.id ? false : !form.baseUrl.trim() || !form.apiKey.trim())
              }
              onClick={testProvider}
              type="button"
            >
              {isTesting ? "Testing..." : "Test connection"}
            </button>
            {form.id ? (
              <button
                className="secondary"
                disabled={isSaving}
                onClick={deleteSelectedProvider}
                type="button"
              >
                Delete
              </button>
            ) : null}
            <button
              className="secondary"
              disabled={isSaving || isTesting}
              onClick={resetForm}
              type="button"
            >
              New
            </button>
          </div>

          {message ? <p className="notice success">{message}</p> : null}
          {error ? <p className="notice error">{error}</p> : null}
        </form>

        <aside className="provider-list" aria-label="Saved providers">
          <div className="section-heading">
            <p className="eyebrow">Saved services</p>
            <h2>Providers</h2>
          </div>

          {isLoading ? <p className="empty-state">Loading providers...</p> : null}

          {!isLoading && providers.length === 0 ? (
            <p className="empty-state">
              Add an API provider to unlock model discovery and generation.
            </p>
          ) : null}

          <div className="provider-stack">
            {providers.map((provider) => (
              <button
                className="provider-row"
                key={provider.id}
                onClick={() => editProvider(provider)}
                type="button"
              >
                <span>
                  <strong>{provider.name}</strong>
                  <small>{provider.baseUrl}</small>
                  <small>
                    {formatProviderType(provider.providerType)}
                    {provider.capabilityOverrides?.length
                      ? ` - ${provider.capabilityOverrides.length} override(s)`
                      : ""}
                  </small>
                </span>
                <span className={`connection-state ${provider.lastTestStatus}`}>
                  {formatStatus(provider)}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="model-panel" aria-labelledby="model-title">
        <div className="model-panel-header">
          <div className="section-heading">
            <p className="eyebrow">Model discovery</p>
            <h2 id="model-title">Models</h2>
          </div>
          <button
            className="secondary"
            disabled={!selectedProvider || isLoadingModels}
            onClick={() => loadModels()}
            type="button"
          >
            {isLoadingModels ? "Loading..." : "Refresh"}
          </button>
        </div>

        {!selectedProvider ? (
          <p className="empty-state">Select or save a provider to fetch models.</p>
        ) : null}

        {selectedProvider && isLoadingModels ? (
          <p className="empty-state">Loading models from {selectedProvider.name}...</p>
        ) : null}

        {selectedProvider && !isLoadingModels && modelError ? (
          <p className="notice error">{modelError}</p>
        ) : null}

        {selectedProvider && !isLoadingModels && !modelError && models.length === 0 ? (
          <p className="empty-state">
            No image-capable models were returned by this provider.
          </p>
        ) : null}

        {models.length > 0 ? (
          <>
            <label className="model-select-label">
              Active model
              <select
                onChange={(event) => setSelectedModelId(event.target.value)}
                value={selectedModelId}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="model-grid">
              {models.map((model) => (
                <button
                  className={`model-row ${
                    model.id === selectedModelId ? "selected" : ""
                  }`}
                  key={model.id}
                  onClick={() => setSelectedModelId(model.id)}
                  type="button"
                >
                  <span>
                    <strong>{model.name}</strong>
                    <small>{model.id}</small>
                  </span>
                  <span className="capability-stack">
                    {model.capabilities.map((capability) => (
                      <span className="capability-pill" key={capability}>
                        {formatCapability(capability)}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>

            <p className="model-meta">
              {selectedModel ? `Selected ${selectedModel.name}. ` : ""}
              {modelFetchedAt ? `Fetched ${new Date(modelFetchedAt).toLocaleString()}.` : ""}
            </p>
          </>
        ) : null}
      </section>

      <section className="generation-panel" aria-labelledby="generation-title">
        <form className="generation-form" onSubmit={generateImages}>
          <div className="section-heading">
            <p className="eyebrow">
              {activeMode === "text-to-image" ? "Text to image" : "Image to image"}
            </p>
            <h2 id="generation-title">Generate</h2>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Generation mode">
            <button
              aria-selected={activeMode === "text-to-image"}
              className={activeMode === "text-to-image" ? "selected" : ""}
              onClick={() => setActiveMode("text-to-image")}
              role="tab"
              type="button"
            >
              Text ({textToImageModels.length})
            </button>
            <button
              aria-selected={activeMode === "image-to-image"}
              className={activeMode === "image-to-image" ? "selected" : ""}
              onClick={() => setActiveMode("image-to-image")}
              role="tab"
              type="button"
            >
              Image ({imageToImageModels.length})
            </button>
          </div>

          {!selectedProvider ? (
            <p className="empty-state">Select or save a provider before generating.</p>
          ) : null}

          {selectedProvider && activeModeModels.length === 0 ? (
            <p className="empty-state">
              {activeMode === "text-to-image"
                ? "Fetch a text-to-image model before generating."
                : "Fetch an image-to-image model before generating."}
            </p>
          ) : null}

          <label>
            Model
            <select
              disabled={activeModeModels.length === 0 || isGenerating}
              onChange={(event) => setSelectedModelId(event.target.value)}
              value={
                selectedModel && supportsGenerationMode(selectedModel, activeMode)
                  ? selectedModelId
                  : ""
              }
            >
              <option value="">Select model</option>
              {activeModeModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          {activeMode === "image-to-image" ? (
            <div className="upload-panel">
              <label>
                Reference image
                <input
                  accept="image/png,image/jpeg,image/webp"
                  disabled={isUploadingInput || isGenerating}
                  onChange={handleReferenceImageChange}
                  type="file"
                />
              </label>

              {isUploadingInput ? (
                <p className="empty-state">Uploading reference image...</p>
              ) : null}

              {uploadedInput ? (
                <div className="upload-preview">
                  <img alt="Uploaded reference" src={uploadedInput.previewUrl} />
                  <p>
                    <strong>{uploadedInput.fileName ?? "Reference image"}</strong>
                    <span>
                      {uploadedInput.mimeType} -{" "}
                      {Math.ceil(uploadedInput.sizeBytes / 1024)} KB
                    </span>
                  </p>
                </div>
              ) : null}

              {uploadError ? <p className="notice error">{uploadError}</p> : null}
            </div>
          ) : null}

          <label>
            Prompt
            <textarea
              onChange={(event) => updateGenerationField("prompt", event.target.value)}
              placeholder="Describe the image to generate"
              required
              rows={5}
              value={generationForm.prompt}
            />
          </label>

          <label>
            Negative prompt
            <textarea
              onChange={(event) =>
                updateGenerationField("negativePrompt", event.target.value)
              }
              placeholder="Elements to avoid"
              rows={3}
              value={generationForm.negativePrompt}
            />
          </label>

          <div className="generation-controls">
            <label>
              Ratio
              <select
                onChange={(event) => updateGenerationField("ratio", event.target.value)}
                value={generationForm.ratio}
              >
                {ratioOptions.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Quality
              <select
                onChange={(event) => updateGenerationField("quality", event.target.value)}
                value={generationForm.quality}
              >
                {qualityOptions.map((quality) => (
                  <option key={quality} value={quality}>
                    {quality}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Count
              <input
                max={4}
                min={1}
                onChange={(event) =>
                  updateGenerationField("count", Number(event.target.value))
                }
                type="number"
                value={generationForm.count}
              />
            </label>

            <label>
              Seed
              <input
                inputMode="numeric"
                onChange={(event) => updateGenerationField("seed", event.target.value)}
                placeholder="Optional"
                type="number"
                value={generationForm.seed}
              />
            </label>

            {activeMode === "image-to-image" ? (
              <label>
                Strength
                <input
                  max={1}
                  min={0}
                  onChange={(event) =>
                    updateGenerationField("strength", Number(event.target.value))
                  }
                  step={0.05}
                  type="range"
                  value={generationForm.strength}
                />
                <span className="control-value">
                  {generationForm.strength.toFixed(2)}
                </span>
              </label>
            ) : null}
          </div>

          <div className="button-row">
            <button
              disabled={
                isGenerating ||
                isUploadingInput ||
                !selectedProvider ||
                !selectedModel ||
                !supportsGenerationMode(selectedModel, activeMode) ||
                !generationForm.prompt.trim() ||
                (activeMode === "image-to-image" && !uploadedInput)
              }
              type="submit"
            >
              {isGenerating ? "Generating..." : "Generate"}
            </button>
          </div>

          {generationMessage ? (
            <p className="notice success">{generationMessage}</p>
          ) : null}
          {generationError ? <p className="notice error">{generationError}</p> : null}
        </form>

        <section className="result-gallery" aria-labelledby="results-title">
          <div className="section-heading">
            <p className="eyebrow">Results</p>
            <h2 id="results-title">Gallery</h2>
          </div>

          {isGenerating ? (
            <p className="empty-state">Generating images...</p>
          ) : null}

          {!isGenerating && generatedImages.length === 0 ? (
            <p className="empty-state">Generated images will appear here.</p>
          ) : null}

          {generatedImages.length > 0 ? (
            <div className="gallery-grid">
              {generatedImages.map((image, index) => {
                const href = imageHref(image);

                return (
                  <article className="image-card" key={image.id}>
                    {href ? (
                      <a href={href} rel="noreferrer" target="_blank">
                        <img alt={`Generated result ${index + 1}`} src={href} />
                      </a>
                    ) : (
                      <div className="image-placeholder">No preview URL</div>
                    )}
                    <div className="image-actions">
                      {href ? (
                        <>
                          <a href={href} rel="noreferrer" target="_blank">
                            Preview
                          </a>
                          <a download={downloadName(image, index)} href={href}>
                            Download
                          </a>
                        </>
                      ) : null}
                      {image.url ? (
                        <button
                          className="link-button"
                          onClick={() => void copyImageUrl(image.url ?? "")}
                          type="button"
                        >
                          Copy URL
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </section>

      <section className="history-panel" aria-labelledby="history-title">
        <div className="history-header">
          <div className="section-heading">
            <p className="eyebrow">History</p>
            <h2 id="history-title">Generation history</h2>
          </div>
          <button
            className="secondary"
            disabled={generationHistory.length === 0}
            onClick={() => void clearHistory()}
            type="button"
          >
            Clear history
          </button>
        </div>

        {historyMessage ? <p className="notice success">{historyMessage}</p> : null}
        {historyError ? <p className="notice error">{historyError}</p> : null}

        {generationHistory.length === 0 ? (
          <p className="empty-state">
            Successful generations will be saved here on this device.
          </p>
        ) : null}

        {generationHistory.length > 0 ? (
          <div className="history-list">
            {generationHistory.map((record) => {
              const firstImageHref = imageHref(record.images[0]);

              return (
                <article className="history-card" key={record.id}>
                  <div className="history-summary">
                    {firstImageHref ? (
                      <img alt="" className="history-thumb" src={firstImageHref} />
                    ) : (
                      <div className="history-thumb placeholder">No URL</div>
                    )}
                    <div>
                      <h3>{record.parameters.prompt}</h3>
                      <p>
                        {formatMode(record.parameters.mode)} - {record.modelName} -{" "}
                        {formatDate(record.createdAt)}
                      </p>
                      <p>
                        Ratio {record.parameters.ratio ?? "n/a"} - Quality{" "}
                        {record.parameters.quality ?? "n/a"} - Count{" "}
                        {record.parameters.count ?? record.images.length}
                        {record.parameters.seed !== undefined
                          ? ` - Seed ${record.parameters.seed}`
                          : ""}
                      </p>
                      {record.parameters.inputImage ? (
                        <p>
                          Reference:{" "}
                          {record.parameters.inputImage.fileName ??
                            record.parameters.inputImage.mimeType}{" "}
                          ({Math.ceil(record.parameters.inputImage.sizeBytes / 1024)} KB)
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="history-actions">
                    <button onClick={() => viewHistoryRecord(record)} type="button">
                      View results
                    </button>
                    <button
                      className="secondary"
                      onClick={() => reuseHistoryRecord(record)}
                      type="button"
                    >
                      Reuse parameters
                    </button>
                    <button
                      className="secondary"
                      onClick={() => void deleteHistoryRecord(record.id)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="history-images">
                    {record.images.map((image, index) => {
                      const href = imageHref(image);

                      return (
                        <div
                          className="history-image-row"
                          key={`${record.id}-${image.id}`}
                        >
                          <span>Image {index + 1}</span>
                          <div className="image-actions">
                            {href ? (
                              <>
                                <a href={href} rel="noreferrer" target="_blank">
                                  Preview
                                </a>
                                <a
                                  download={historyImageDownloadName(record, image, index)}
                                  href={href}
                                >
                                  Download
                                </a>
                              </>
                            ) : (
                              <span className="muted-text">No image URL returned</span>
                            )}
                            {image.url ? (
                              <button
                                className="link-button"
                                onClick={() => void copyImageUrl(image.url ?? "")}
                                type="button"
                              >
                                Copy URL
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </main>
  );
}
