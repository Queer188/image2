export type HealthStatus = {
  status: "ok";
  service: "image2-server";
};

export type ProviderConnectionState = "untested" | "success" | "failed";

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKeyPreview: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus: ProviderConnectionState;
};

export type ProviderRuntimeConfig = {
  baseUrl: string;
  apiKey: string;
};

export type CreateProviderRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

export type UpdateProviderRequest = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
};

export type TestProviderRequest =
  | {
      providerId: string;
      baseUrl?: never;
      apiKey?: never;
    }
  | {
      providerId?: never;
      baseUrl: string;
      apiKey: string;
    };

export type ProviderListResponse = {
  providers: ProviderConfig[];
};

export type ProviderTestResponse = {
  ok: boolean;
  message: string;
  testedAt: string;
  statusCode?: number;
};

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_CONNECTION_FAILED"
  | "PROVIDER_URL_BLOCKED"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  error: {
    code: ApiErrorCode;
    message: string;
    detail?: string;
  };
};
