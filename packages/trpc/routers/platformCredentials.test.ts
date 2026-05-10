import { beforeEach, describe, expect, test, vi } from "vitest";

import { platformCredentials } from "@karakeep/db/schema";
import { decryptPlatformCredential } from "@karakeep/shared/platformCredentials";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

vi.mock("@karakeep/shared/config", async (original) => {
  const mod = (await original()) as typeof import("@karakeep/shared/config");
  return {
    ...mod,
    default: {
      ...mod.default,
      signingSecret: () => "test-secret",
    },
  };
});

beforeEach<CustomTestContext>(defaultBeforeEach());

describe("platform credentials router", () => {
  test<CustomTestContext>("stores encrypted platform credentials", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0].platformCredentials;

    expect(
      await api.get({ platform: "xiaohongshu", credentialType: "cookie" }),
    ).toMatchObject({
      platform: "xiaohongshu",
      credentialType: "cookie",
      configured: false,
      redactedValue: null,
    });

    await api.upsert({
      platform: "xiaohongshu",
      credentialType: "cookie",
      value: "a1=secret; web_session=token",
    });

    const rows = await db.select().from(platformCredentials);
    expect(rows).toHaveLength(1);
    expect(rows[0].encryptedValue).not.toContain("secret");
    expect(decryptPlatformCredential(rows[0].encryptedValue)).toBe(
      "a1=secret; web_session=token",
    );

    expect(
      await api.get({ platform: "xiaohongshu", credentialType: "cookie" }),
    ).toMatchObject({
      configured: true,
      redactedValue: "configured",
    });

    await api.delete({ platform: "xiaohongshu", credentialType: "cookie" });
    expect(await db.select().from(platformCredentials)).toHaveLength(0);
  });
});
