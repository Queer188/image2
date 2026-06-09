# Provider Guide

## Supported Provider Types

- `auto`: default. Uses image2-compatible JSON first where relevant, then falls back to OpenAI multipart edits when needed.
- `openai-compatible`: uses OpenAI-compatible `/models`, `/images/generations`, and multipart `/images/edits`.
- `image2-compatible`: prefers image2-compatible JSON generation and keeps the OpenAI multipart fallback.

Provider type is adapter metadata. It does not change API Key storage; keys remain server-side and are never exported by provider APIs.

## Base URL Rules

- Use HTTPS provider URLs by default.
- Localhost HTTP URLs are only allowed when `ALLOW_LOCAL_PROVIDER_URLS=true`.
- Private network and DNS-unverified hostnames are blocked by the server URL policy.
- Avoid embedding API Keys in URLs. Use the API Key field only.

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
| Text-to-image results | `url`, `image_url`, `imageUrl`, inline image URL fields, base64 fields, nested `images` / `data` / `output` arrays |
| Image-to-image JSON results | same as text-to-image plus common reference image aliases |
| Multipart image edits | OpenAI-compatible `/images/edits` fallback when image2 JSON is unavailable |

## Text-To-Image Expectations

OpenAI-compatible providers should accept JSON at `/images/generations` with at least:

```json
{
  "model": "model-id",
  "prompt": "prompt text",
  "n": 1
}
```

Optional fields include `negative_prompt`, `size`/ratio equivalents, quality, and seed when supported by the provider.

## Image-To-Image Expectations

image2-compatible providers receive JSON generation requests with common reference image fields. OpenAI-compatible providers receive multipart edits at `/images/edits`. The frontend uploads the reference image to the local server first; generation requests use only the upload id.

## Troubleshooting

- No models: refresh models, verify the Base URL, and add capability overrides for known image models.
- Auth failure: re-enter the API Key and test connection. v0.2 loses provider keys after server restart.
- URL blocked: use HTTPS, or enable localhost provider URLs only for trusted local development.
- Image edit fails: try switching provider type between `auto`, `openai-compatible`, and `image2-compatible`.
