import type {
  GeneratedImage,
  GenerateImageRequest,
  ImageModel,
  ProviderRuntimeConfig
} from "@image2/shared";

export type AdapterInputImage = {
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
};

export type ImageProviderGenerateRequest = GenerateImageRequest & {
  inputImage?: AdapterInputImage;
};

export type ImageProviderAdapter = {
  testConnection(config: ProviderRuntimeConfig): Promise<void>;
  listModels(config: ProviderRuntimeConfig, providerId: string): Promise<ImageModel[]>;
  generateImage(
    config: ProviderRuntimeConfig,
    request: ImageProviderGenerateRequest
  ): Promise<GeneratedImage[]>;
};
