# Product Requirements

## Phase 3: Text-to-Image MVP

The current workflow lets a user configure one or more image API providers, test whether a provider is reachable, fetch image-capable models, and generate images from text prompts.

## User Flow

1. User opens the app and sees the provider setup workspace.
2. User enters a provider name, API Base URL, and API Key.
3. User saves the provider.
4. The provider list shows name, base URL, key preview, and connection status.
5. User can test a provider connection.
6. User can edit provider name/base URL and optionally replace the API Key.
7. User can delete a provider.
8. User selects a saved provider.
9. The app fetches available image models from the provider.
10. User can refresh the model list and select a model.
11. Loading, empty, and error states are shown without clearing provider inputs.
12. User enters a positive prompt and optional negative prompt.
13. User configures ratio, quality, count, and optional seed.
14. User submits a text-to-image generation request.
15. The app shows generating, success, or failure state.
16. Successful results appear in a gallery with preview and download actions.

## Phase 3 Acceptance

- User can add, edit, delete, and list providers.
- User can test a provider before or after saving.
- Saved provider responses show only an API key reference and masked preview.
- Authentication and connection failures show readable errors.
- Model discovery uses a saved provider and does not expose the API Key to the browser.
- Model rows show `text-to-image` and `image-to-image` capability tags when detected.
- Model list loading, refresh, empty, and error states are visible.
- Text-to-image form includes model, prompt, negative prompt, ratio, quality, count, and optional seed.
- Generation preserves form input on failure.
- Generated images are previewable and downloadable.
- Image-to-image, uploads, and complex history controls are not implemented in this phase.
