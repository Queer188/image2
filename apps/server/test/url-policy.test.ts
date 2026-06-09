import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertSafeProviderUrl } from "../src/url-policy.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

const lookupMock = vi.mocked(lookup);
const originalTrustedProviderOrigins = process.env.TRUSTED_PROVIDER_ORIGINS;

function restoreTrustedProviderOrigins() {
  if (originalTrustedProviderOrigins === undefined) {
    delete process.env.TRUSTED_PROVIDER_ORIGINS;
    return;
  }

  process.env.TRUSTED_PROVIDER_ORIGINS = originalTrustedProviderOrigins;
}

function resolveRightCodesToBenchmarkAddress() {
  lookupMock.mockResolvedValue([{ address: "198.18.0.6", family: 4 }]);
}

describe("provider URL policy", () => {
  beforeEach(() => {
    delete process.env.TRUSTED_PROVIDER_ORIGINS;
    lookupMock.mockReset();
  });

  afterEach(() => {
    restoreTrustedProviderOrigins();
  });

  it("blocks benchmark addresses by default when discovered through DNS", async () => {
    resolveRightCodesToBenchmarkAddress();

    await expect(assertSafeProviderUrl("https://www.right.codes/draw")).rejects.toMatchObject({
      code: "PROVIDER_URL_BLOCKED",
      message: "Provider URL cannot resolve to private network addresses."
    });
  });

  it("allows a DNS-resolved private address when the provider origin is explicitly trusted", async () => {
    process.env.TRUSTED_PROVIDER_ORIGINS = "https://www.right.codes";
    resolveRightCodesToBenchmarkAddress();

    const parsed = await assertSafeProviderUrl("https://www.right.codes/draw");

    expect(parsed.origin).toBe("https://www.right.codes");
  });

  it("blocks DNS-resolved private addresses when the trusted origin does not match", async () => {
    process.env.TRUSTED_PROVIDER_ORIGINS = "https://api.right.codes";
    resolveRightCodesToBenchmarkAddress();

    await expect(assertSafeProviderUrl("https://www.right.codes/draw")).rejects.toMatchObject({
      code: "PROVIDER_URL_BLOCKED",
      message: "Provider URL cannot resolve to private network addresses."
    });
  });

  it("blocks non-HTTP provider URL protocols even when an origin is trusted", async () => {
    process.env.TRUSTED_PROVIDER_ORIGINS = "https://www.right.codes";

    await expect(assertSafeProviderUrl("file:///tmp/provider")).rejects.toMatchObject({
      code: "PROVIDER_URL_BLOCKED",
      message: "Provider URL must use HTTP or HTTPS."
    });
  });
});
