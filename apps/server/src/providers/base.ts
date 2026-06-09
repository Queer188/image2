import type {
  GeneratedImage,
  GenerateImageRequest,
  ImageModel,
  ProviderRuntimeConfig
} from "@image2/shared";

export type ImageProviderAdapter = {
  testConnection(config: ProviderRuntimeConfig): Promise<void>;
  listModels(config: ProviderRuntimeConfig, providerId: string): Promise<ImageModel[]>;
  generateImage(
    config: ProviderRuntimeConfig,
    request: GenerateImageRequest
  ): Promise<GeneratedImage[]>;
};
