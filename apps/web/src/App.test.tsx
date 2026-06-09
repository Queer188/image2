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

  it("renders the phase 1 provider setup empty state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({
        providers: []
      })
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /image2 provider setup/i })
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
      .mockResolvedValueOnce(await jsonResponse(provider, { status: 201 }));

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
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        await jsonResponse({
          providers: [provider]
        })
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          ok: true,
          message: "Provider is reachable and did not reject the API Key.",
          testedAt: "2026-06-09T00:00:01.000Z",
          statusCode: 200
        })
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          providers: [
            {
              ...provider,
              lastTestStatus: "success"
            }
          ]
        })
      );

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
});
