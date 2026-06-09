import type { ProviderType } from "@image2/shared";
import type { ImageProviderAdapter } from "./providers/base.js";
import { image2CompatibleAdapter } from "./providers/image2-compatible.js";
import { openAiCompatibleAdapter } from "./providers/openai-compatible.js";

export function getImageProviderAdapter(
  providerType: ProviderType | undefined
): ImageProviderAdapter {
  switch (providerType ?? "auto") {
    case "openai-compatible":
      return openAiCompatibleAdapter;
    case "image2-compatible":
    case "auto":
      return image2CompatibleAdapter;
    default:
      return image2CompatibleAdapter;
  }
}
