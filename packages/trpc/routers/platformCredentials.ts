import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { platformCredentials } from "@karakeep/db/schema";
import {
  encryptPlatformCredential,
  redactPlatformCredential,
} from "@karakeep/shared/platformCredentials";

import { createScopedAuthedProcedure, router } from "../index";

const platformCredentialsProcedure = createScopedAuthedProcedure("bookmarks");

const zPlatform = z.enum(["xiaohongshu"]);
const zCredentialType = z.enum(["cookie"]);

const credentialOutput = z.object({
  platform: zPlatform,
  credentialType: zCredentialType,
  configured: z.boolean(),
  redactedValue: z.string().nullable(),
  createdAt: z.date().nullable(),
  modifiedAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
});

export const platformCredentialsAppRouter = router({
  get: platformCredentialsProcedure
    .input(
      z.object({
        platform: zPlatform,
        credentialType: zCredentialType.default("cookie"),
      }),
    )
    .output(credentialOutput)
    .query(async ({ input, ctx }) => {
      const credential = await ctx.db.query.platformCredentials.findFirst({
        where: and(
          eq(platformCredentials.userId, ctx.user.id),
          eq(platformCredentials.platform, input.platform),
          eq(platformCredentials.credentialType, input.credentialType),
        ),
      });
      return {
        platform: input.platform,
        credentialType: input.credentialType,
        configured: !!credential,
        redactedValue: credential ? "configured" : null,
        createdAt: credential?.createdAt ?? null,
        modifiedAt: credential?.modifiedAt ?? null,
        lastUsedAt: credential?.lastUsedAt ?? null,
      };
    }),
  upsert: platformCredentialsProcedure
    .input(
      z.object({
        platform: zPlatform,
        credentialType: zCredentialType.default("cookie"),
        value: z.string().min(1),
      }),
    )
    .output(credentialOutput)
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const encryptedValue = encryptPlatformCredential(input.value);
      await ctx.db
        .insert(platformCredentials)
        .values({
          userId: ctx.user.id,
          platform: input.platform,
          credentialType: input.credentialType,
          encryptedValue,
          createdAt: now,
          modifiedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            platformCredentials.userId,
            platformCredentials.platform,
            platformCredentials.credentialType,
          ],
          set: {
            encryptedValue,
            modifiedAt: now,
          },
        });

      return {
        platform: input.platform,
        credentialType: input.credentialType,
        configured: true,
        redactedValue: redactPlatformCredential(input.value),
        createdAt: now,
        modifiedAt: now,
        lastUsedAt: null,
      };
    }),
  delete: platformCredentialsProcedure
    .input(
      z.object({
        platform: zPlatform,
        credentialType: zCredentialType.default("cookie"),
      }),
    )
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.db
        .delete(platformCredentials)
        .where(
          and(
            eq(platformCredentials.userId, ctx.user.id),
            eq(platformCredentials.platform, input.platform),
            eq(platformCredentials.credentialType, input.credentialType),
          ),
        );
      return { deleted: result.changes > 0 };
    }),
});
