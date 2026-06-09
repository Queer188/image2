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
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders the localized generation empty state", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      await jsonResponse({
        providers: []
      })
    ).mockResolvedValueOnce(
      await jsonResponse({
        records: []
      })
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: /image2 生图工作台/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/先添加一个 API 接口源/)).toBeInTheDocument();
    expect(screen.getByText(/成功生成的记录会保存在这里/)).toBeInTheDocument();
  });

  it("saves a provider without rendering the API key", async () => {
    const apiKey = "sk-test-secret-value";
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        await jsonResponse({
          providers: []
        })
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          records: []
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

    fireEvent.change(await screen.findByLabelText(/接口源名称/), {
      target: { value: "Local Provider" }
    });
    fireEvent.change(screen.getByLabelText(/接口地址/), {
      target: { value: "https://api.example.com/v1" }
    });
    fireEvent.change(screen.getByLabelText(/API 密钥/), {
      target: { value: apiKey }
    });
    fireEvent.click(screen.getByRole("button", { name: /保存接口源/ }));

    await waitFor(() => {
      expect(screen.getByText(/接口源已保存/)).toBeInTheDocument();
    });
    expect(screen.getByText(/sk-\.\.\.alue/i)).toBeInTheDocument();
    expect(screen.queryByText(apiKey)).not.toBeInTheDocument();
  });

  it("shows localized API errors with technical detail", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        await jsonResponse(
          {
            error: {
              code: "PROVIDER_AUTH_FAILED",
              message: "Provider rejected the API key.",
              detail: "HTTP 401 Unauthorized"
            }
          },
          { status: 401 }
        )
      )
      .mockResolvedValueOnce(
        await jsonResponse({
          records: []
        })
      );

    render(<App />);

    expect(await screen.findByText(/API 密钥无效或没有权限/)).toBeInTheDocument();
    expect(screen.getByText(/详情：HTTP 401 Unauthorized/)).toBeInTheDocument();
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

      if (url === "/api/history") {
        return jsonResponse({
          records: []
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
    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }));

    await waitFor(() => {
      expect(screen.getByText(/连接测试成功/)).toBeInTheDocument();
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

      if (url === "/api/history") {
        return jsonResponse({
          records: []
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));

    expect(await screen.findAllByText("GPT Image")).toHaveLength(3);
    expect(screen.getAllByText("文生图").length).toBeGreaterThan(0);
    expect(screen.getByText("图生图")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/models/list",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ providerId: "provider-1" })
      })
    );
  });

  it("generates text-to-image results without sending an API key from the browser", async () => {
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
            }
          ],
          fetchedAt: "2026-06-09T00:00:02.000Z"
        });
      }

      if (url === "/api/history") {
        return jsonResponse({
          records: []
        });
      }

      if (url === "/api/images/generate") {
        return jsonResponse({
          images: [
            {
              id: "image-1",
              url: "https://cdn.example.com/image-1.png",
              width: 1024,
              height: 1024,
              metadata: {
                index: 0
              }
            }
          ],
          generatedAt: "2026-06-09T00:00:03.000Z"
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));
    await screen.findAllByText("GPT Image");

    fireEvent.change(screen.getByLabelText("正向提示词"), {
      target: { value: "A quiet studio desk" }
    });
    fireEvent.change(screen.getByLabelText(/反向提示词/), {
      target: { value: "blur" }
    });
    fireEvent.change(screen.getByLabelText(/种子/), {
      target: { value: "42" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByText(/已生成 1 张图片/)).toBeInTheDocument();
    expect(screen.getByAltText(/生成结果 1/)).toHaveAttribute(
      "src",
      "https://cdn.example.com/image-1.png"
    );
    expect(screen.getAllByRole("link", { name: "下载" })[0]).toHaveAttribute(
      "download",
      "image-1.png"
    );
    expect(screen.getByRole("heading", { name: "A quiet studio desk" })).toBeInTheDocument();
    expect(window.localStorage.getItem("image2:generation-history:v1")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/images/generate",
      expect.objectContaining({
        method: "POST",
          body: JSON.stringify({
            providerId: "provider-1",
            modelId: "gpt-image-1",
            modelName: "GPT Image",
            mode: "text-to-image",
            prompt: "A quiet studio desk",
          negativePrompt: "blur",
          ratio: "1:1",
          quality: "standard",
          count: 1,
          seed: 42
        })
      })
    );
    expect(JSON.stringify(vi.mocked(fetch).mock.calls)).not.toContain(
      "sk-test-secret-value"
    );
  });

  it("uploads a reference image and generates image-to-image results", async () => {
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

      if (url === "/api/history") {
        return jsonResponse({
          records: []
        });
      }

      if (url === "/api/images/upload") {
        return jsonResponse(
          {
            image: {
              id: "upload-1",
              fileName: "reference.png",
              mimeType: "image/png",
              sizeBytes: 5,
              uploadedAt: "2026-06-09T00:00:03.000Z"
            }
          },
          { status: 201 }
        );
      }

      if (url === "/api/images/generate") {
        return jsonResponse({
          images: [
            {
              id: "edited-1",
              url: "https://cdn.example.com/edited-1.png",
              metadata: {
                index: 0
              }
            }
          ],
          generatedAt: "2026-06-09T00:00:04.000Z"
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));
    await screen.findAllByText("Image Edit Pro");
    fireEvent.click(screen.getByRole("tab", { name: /图生图/ }));

    const file = new File(["hello"], "reference.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText(/上传参考图/), {
      target: {
        files: [file]
      }
    });

    expect(await screen.findByAltText(/上传参考图/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("正向提示词"), {
      target: { value: "Change the wall color" }
    });
    fireEvent.change(screen.getByLabelText(/反向提示词/), {
      target: { value: "blur" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByText(/已生成 1 张图片/)).toBeInTheDocument();
    expect(screen.getByAltText(/生成结果 1/)).toHaveAttribute(
      "src",
      "https://cdn.example.com/edited-1.png"
    );

    const generateCall = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => url.toString() === "/api/images/generate");
    expect(generateCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          providerId: "provider-1",
          modelId: "image-edit-pro",
          modelName: "Image Edit Pro",
          mode: "image-to-image",
          prompt: "Change the wall color",
          negativePrompt: "blur",
          ratio: "1:1",
          quality: "standard",
          count: 1,
          seed: undefined,
          strength: 0.5,
          inputImageId: "upload-1"
        })
      })
    );
    expect(generateCall?.[1]?.body?.toString()).not.toContain("data:image/png");
    expect(window.localStorage.getItem("image2:generation-history:v1")).toBeNull();
  });

  it("reuses and deletes a saved text-to-image history item", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
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
            }
          ],
          fetchedAt: "2026-06-09T00:00:02.000Z"
        });
      }

      if (url === "/api/history") {
        return jsonResponse({
          records: []
        });
      }

      if (
        url.startsWith("/api/history/") &&
        typeof init?.method === "string" &&
        init.method === "DELETE"
      ) {
        return new Response(null, { status: 204 });
      }

      if (url === "/api/images/generate") {
        return jsonResponse({
          images: [
            {
              id: "image-1",
              url: "https://cdn.example.com/image-1.png",
              metadata: {
                index: 0
              }
            }
          ],
          generatedAt: "2026-06-09T00:00:03.000Z"
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: /local provider/i }));
    await screen.findAllByText("GPT Image");
    fireEvent.change(screen.getByLabelText("正向提示词"), {
      target: { value: "A reusable prompt" }
    });
    fireEvent.change(screen.getByLabelText(/种子/), {
      target: { value: "77" }
    });
    fireEvent.click(screen.getByRole("button", { name: "开始生成" }));

    expect(await screen.findByRole("heading", { name: "A reusable prompt" }))
      .toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("正向提示词"), {
      target: { value: "Changed prompt" }
    });
    fireEvent.click(screen.getByRole("button", { name: /复用参数/ }));

    expect(screen.getByLabelText("正向提示词")).toHaveValue("A reusable prompt");
    expect(screen.getByLabelText(/种子/)).toHaveValue(77);

    const deleteButtons = screen.getAllByRole("button", { name: "删除" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "A reusable prompt" }))
        .not.toBeInTheDocument();
    });
    expect(screen.getByText(/成功生成的记录会保存在这里/)).toBeInTheDocument();
  });

  it("migrates existing localStorage history to server history", async () => {
    const localRecord = {
      id: "local-history-1",
      createdAt: "2026-06-09T00:00:00.000Z",
      providerId: "provider-1",
      providerName: "Local Provider",
      modelId: "gpt-image-1",
      modelName: "GPT Image",
      parameters: {
        mode: "text-to-image",
        prompt: "Migrated local prompt",
        ratio: "1:1",
        quality: "standard",
        count: 1
      },
      images: [
        {
          id: "image-1",
          url: "https://cdn.example.com/migrated.png",
          metadata: {
            index: 0
          }
        }
      ]
    };
    window.localStorage.setItem(
      "image2:generation-history:v1",
      JSON.stringify([localRecord])
    );

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = input.toString();

      if (url === "/api/providers") {
        return jsonResponse({
          providers: []
        });
      }

      if (url === "/api/history/import") {
        return jsonResponse({
          imported: 1,
          records: [localRecord]
        });
      }

      throw new Error(`Unexpected fetch ${url}`);
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Migrated local prompt" })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/history/import",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(window.localStorage.getItem("image2:generation-history:v1")).toBeNull();
  });
});
