# Product Requirements

## Phase 1: Provider Configuration

The first usable workflow lets a user configure one or more image API providers and test whether a provider is reachable.

## User Flow

1. User opens the app and sees the provider setup workspace.
2. User enters a provider name, API Base URL, and API Key.
3. User saves the provider.
4. The provider list shows name, base URL, key preview, and connection status.
5. User can test a provider connection.
6. User can edit provider name/base URL and optionally replace the API Key.
7. User can delete a provider.

## Phase 1 Acceptance

- User can add, edit, delete, and list providers.
- User can test a provider before or after saving.
- Saved provider responses show only an API key reference and masked preview.
- Authentication and connection failures show readable errors.
- Model list, text-to-image, image-to-image, uploads, and history controls are not implemented in this phase.
