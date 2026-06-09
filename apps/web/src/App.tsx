import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  ApiErrorResponse,
  GeneratedImage,
  GenerateImageResponse,
  ImageModel,
  ModelListResponse,
  ProviderConfig,
  ProviderListResponse,
  ProviderTestResponse
} from "@image2/shared";

type FormState = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey: string;
};

type GenerationFormState = {
  prompt: string;
  negativePrompt: string;
  ratio: string;
  quality: string;
  count: number;
  seed: string;
};

const emptyForm: FormState = {
  name: "",
  baseUrl: "",
  apiKey: ""
};

const emptyGenerationForm: GenerationFormState = {
  prompt: "",
  negativePrompt: "",
  ratio: "1:1",
  quality: "standard",
  count: 1,
  seed: ""
};

const ratioOptions = ["1:1", "4:3", "3:4", "16:9", "9:16"];
const qualityOptions = ["standard", "hd", "ultra"];

async function parseApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return payload.error.message;
  } catch {
    return "Request failed.";
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

function supportsTextToImage(model: ImageModel): boolean {
  return model.capabilities.includes("text-to-image");
}

function downloadName(image: GeneratedImage, index: number): string {
  return `${image.id || `image-${index + 1}`}.png`;
}

export function App() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [models, setModels] = useState<ImageModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [generationForm, setGenerationForm] =
    useState<GenerationFormState>(emptyGenerationForm);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelFetchedAt, setModelFetchedAt] = useState<string>();
  const [modelError, setModelError] = useState<string>();
  const [generationMessage, setGenerationMessage] = useState<string>();
  const [generationError, setGenerationError] = useState<string>();
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
          (model) => model.id === current && supportsTextToImage(model)
        )
          ? current
          : (payload.models.find(supportsTextToImage)?.id ??
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

  useEffect(() => {
    void loadProviders();
  }, []);

  useEffect(() => {
    void loadModels(selectedProvider?.id);
    setGeneratedImages([]);
    setGenerationMessage(undefined);
    setGenerationError(undefined);
  }, [selectedProvider?.id]);

  function updateField(field: keyof FormState, value: string) {
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

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(undefined);
    setError(undefined);

    const isEditing = Boolean(form.id);
    const payload = {
      name: form.name,
      baseUrl: form.baseUrl,
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
        apiKey: ""
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
      apiKey: ""
    });
    setMessage(undefined);
    setError(undefined);
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

    if (!selectedModel || !supportsTextToImage(selectedModel)) {
      setGenerationError("Select a text-to-image model before generating.");
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
            mode: "text-to-image",
            prompt: trimmedPrompt,
            negativePrompt: generationForm.negativePrompt.trim() || undefined,
            ratio: generationForm.ratio,
            quality: generationForm.quality,
            count: generationForm.count,
            seed
          })
        })
      );

      setGeneratedImages(result.images);
      setGenerationMessage(`Generated ${result.images.length} image(s).`);
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
          <p className="eyebrow">Phase 3</p>
          <h1>image2 Text to Image</h1>
        </div>
        <span className="status-pill">Text-to-image MVP</span>
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
            <button disabled={isSaving} type="submit">
              {isSaving ? "Saving..." : "Save provider"}
            </button>
            <button disabled={isTesting} onClick={testProvider} type="button">
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
            <button className="secondary" onClick={resetForm} type="button">
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
              Add an API provider before model discovery or generation phases.
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
            <p className="eyebrow">Text to image</p>
            <h2 id="generation-title">Generate</h2>
          </div>

          {!selectedProvider ? (
            <p className="empty-state">Select or save a provider before generating.</p>
          ) : null}

          {selectedProvider && textToImageModels.length === 0 ? (
            <p className="empty-state">
              Fetch a text-to-image model before generating.
            </p>
          ) : null}

          <label>
            Model
            <select
              disabled={textToImageModels.length === 0 || isGenerating}
              onChange={(event) => setSelectedModelId(event.target.value)}
              value={
                selectedModel && supportsTextToImage(selectedModel)
                  ? selectedModelId
                  : ""
              }
            >
              <option value="">Select model</option>
              {textToImageModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

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
          </div>

          <div className="button-row">
            <button
              disabled={
                isGenerating ||
                !selectedProvider ||
                !selectedModel ||
                !supportsTextToImage(selectedModel) ||
                !generationForm.prompt.trim()
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
              {generatedImages.map((image, index) => (
                <article className="image-card" key={image.id}>
                  {image.url ? (
                    <a href={image.url} rel="noreferrer" target="_blank">
                      <img
                        alt={`Generated result ${index + 1}`}
                        src={image.url}
                      />
                    </a>
                  ) : (
                    <div className="image-placeholder">No preview URL</div>
                  )}
                  <div className="image-actions">
                    {image.url ? (
                      <>
                        <a href={image.url} rel="noreferrer" target="_blank">
                          Preview
                        </a>
                        <a download={downloadName(image, index)} href={image.url}>
                          Download
                        </a>
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
