import type { ImageModelCapability } from "@image2/shared";

export type ModelListFixture = {
  name: string;
  payload: unknown;
  capabilityOverrides?: Array<{
    modelId: string;
    capabilities: ImageModelCapability[];
  }>;
  expected: Array<{
    id: string;
    capabilities: ImageModelCapability[];
  }>;
};

export const modelListFixtures: ModelListFixture[] = [
  {
    name: "OpenAI data array",
    payload: {
      object: "list",
      data: [
        { id: "gpt-image-1", name: "GPT Image" },
        { id: "gpt-4.1", object: "model" }
      ]
    },
    expected: [{ id: "gpt-image-1", capabilities: ["text-to-image"] }]
  },
  {
    name: "nested image2 models array",
    payload: {
      result: {
        models: [
          {
            model: "plain-generator",
            display_name: "Plain Generator",
            task: "txt2img",
            supported_ratios: ["1:1", "16:9"]
          },
          { id: "vision-image-embed", name: "Vision Image Embedder" }
        ]
      }
    },
    expected: [{ id: "plain-generator", capabilities: ["text-to-image"] }]
  },
  {
    name: "object map with overrides",
    payload: {
      models: {
        "vendor-art": { name: "Vendor Art" },
        "vendor-edit": { name: "Vendor Edit" }
      }
    },
    capabilityOverrides: [
      { modelId: "vendor-art", capabilities: ["text-to-image"] },
      { modelId: "vendor-edit", capabilities: ["image-to-image"] }
    ],
    expected: [
      { id: "vendor-art", capabilities: ["text-to-image"] },
      { id: "vendor-edit", capabilities: ["image-to-image"] }
    ]
  },
  {
    name: "available_models array",
    payload: {
      available_models: [
        {
          id: "flux-pro",
          name: "Flux Pro",
          qualities: ["standard", "hd"]
        }
      ]
    },
    expected: [{ id: "flux-pro", capabilities: ["text-to-image"] }]
  }
];

export type GenerationFixture = {
  name: string;
  payload: unknown;
  expectedUrl: string;
};

export const generationFixtures: GenerationFixture[] = [
  {
    name: "OpenAI URL response",
    payload: {
      data: [{ url: "https://cdn.example.com/openai-url.png" }]
    },
    expectedUrl: "https://cdn.example.com/openai-url.png"
  },
  {
    name: "data URL response",
    payload: {
      images: [{ data_url: "data:image/png;base64,aGVsbG8=" }]
    },
    expectedUrl: "data:image/png;base64,aGVsbG8="
  },
  {
    name: "base64 response",
    payload: {
      output: [{ image_base64: "aGVsbG8=", mimeType: "image/webp" }]
    },
    expectedUrl: "data:image/webp;base64,aGVsbG8="
  },
  {
    name: "nested string URL response",
    payload: {
      result: {
        images: ["https://cdn.example.com/string-url.png"]
      }
    },
    expectedUrl: "https://cdn.example.com/string-url.png"
  }
];
