import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const provider = {
  id: "provider-1",
  name: "Local Provider",
  baseUrl: "https://api.example.com/v1",
  apiKeyRef: "key-ref-1",
  apiKeyPreview: "sk-...alue",
  createdAt: "2026-06-09T00:00:00.000Z",
  updatedAt: "2026-06-09T00:00:00.000Z",
  lastTestStatus: "untested"
};

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json"
      },
      ...init
    })
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the phase 2 model discovery empty state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({
        providers: []
      })
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /image2 model discovery/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/add an api provider/i)).toBeInTheDocument();
  });

  it("saves a provider without rendering the API key", async () => {
    const apiKey = "sk-test-secret-value";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        await jsonResponse({
          providers: []
        })
      )
      .mockResolvedValueOnce(await jsonResponse(provider, { status: 201 }))
      .mockResolvedValueOnce(
        await jsonResponse({
          models: [],
          fetchedAt: "2026-06-09T00:00:02.000Z"
        })
      );

    render(<App />);

    fireEvent.change(await screen.findByLabelText(/provider name/i), {
      target: { value: "Local Provider" }
    });
    fireEvent.change(screen.getByLabelText(/api base url/i), {
      target: { value: "https://api.example.com/v1" }
    });
    fireEvent.change(screen.getByLabelText(/api key/i), {
      target: { value: apiKey }
    });
    fireEvent.click(screen.getByRole("button", { name: /save provider/i }));

    await waitFor(() => {
      expect(screen.getByText(/provider saved/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/sk-\.\.\.alue/i)).toBeInTheDocument();
    expect(screen.queryByText(apiKey)).not.toBeInTheDocument();
  });

  it("tests a saved provider connection", async () => {
    let providerLoads = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();

      if (url === "/api/providers") {
        providerLoads += 1;
        return jsonResponse({
          providers: [
            {
              ...provider,
              lastTestStatus: providerLoads > 1 ? "success" : "untested"
            }
          ]
        });
      }

      if (url === "/api/models/list") {
        return jsonResponse({
          models: [],
          fetchedAt: "2026-06-09T00:00:02.000Z"
        });
      }

      if (url === "/api/providers/test") {
        return jsonResponse({
          ok: true,
          message: "Provider is reachable and did not reject the API Key.",
          testedAt: "2026-06-09T00:00:01.000Z",
          statusCode: 200
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => {
      expect(screen.getByText(/provider is reachable/i)).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/providers/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ providerId: "provider-1" })
      })
    );
  });

  it("loads and selects image-capable models for the selected provider", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();

      if (url === "/api/providers") {
        return jsonResponse({
          providers: [provider]
        });
      }

      if (url === "/api/models/list") {
        return jsonResponse({
          models: [
            {
              id: "gpt-image-1",
              name: "GPT Image",
              providerId: provider.id,
              capabilities: ["text-to-image"]
            },
            {
              id: "image-edit-pro",
              name: "Image Edit Pro",
              providerId: provider.id,
              capabilities: ["image-to-image"]
            }
          ],
          fetchedAt: "2026-06-09T00:00:02.000Z"
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));

    expect(await screen.findAllByText("GPT Image")).toHaveLength(2);
    expect(screen.getByText("Text to image")).toBeInTheDocument();
    expect(screen.getByText("Image to image")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/list",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ providerId: "provider-1" })
      })
    );
  });
});
