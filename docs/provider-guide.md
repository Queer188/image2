# Provider Guide

## Supported Provider Types

- `auto`: current default. Uses image2-compatible JSON first for image-to-image, then falls back to OpenAI multipart edits when needed.
- `openai-compatible`: always uses OpenAI-compatible `/models`, `/images/generations`, and multipart `/images/edits`.
- `image2-compatible`: prefers image2-compatible JSON generation and keeps the OpenAI multipart fallback.

## Capability Overrides

Use provider `capabilityOverrides` when the remote `/models` response omits or mislabels image capabilities.

Example:

```json
[
  { "modelId": "image-edit-pro", "capabilities": ["image-to-image"] },
  { "modelId": "gpt-image-1", "capabilities": ["text-to-image"] }
]
```

`modelId` may match the returned model `id`, `model`, `slug`, or `name`. `*` applies to every model returned by the provider.

## Adapter Matrix

| Case | Accepted shapes |
| --- | --- |
| Model lists | top-level arrays, `data`, `models`, `items`, `result`, `results`, `response`, `available_models`, object maps keyed by model id |
| Model ids | `id`, `model`, `slug`, `value`, or `name` |
| Text-to-image results | `url`, `image_url`, `imageUrl`, `data_url`, `dataUrl`, `b64_json`, `base64_json`, `base64`, nested `images` / `data` / `output` arrays |
| Image-to-image JSON results | same as text-to-image plus `image`, `input_image`, `reference_image`, and nested aliases |
| Multipart image edits | OpenAI-compatible `images/edits` fallback remains supported when image2 JSON is not available |

## Notes

- Public provider records keep `providerType` and `capabilityOverrides` only as metadata.
- API keys remain server-side and are not part of exported provider configs.
