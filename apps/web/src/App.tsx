import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type {
  ApiErrorResponse,
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

const emptyForm: FormState = {
  name: "",
  baseUrl: "",
  apiKey: ""
};

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

export function App() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.id),
    [providers, form.id]
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

  useEffect(() => {
    void loadProviders();
  }, []);

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

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Phase 1</p>
          <h1>image2 Provider Setup</h1>
        </div>
        <span className="status-pill">Local API configuration</span>
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
    </main>
  );
}
