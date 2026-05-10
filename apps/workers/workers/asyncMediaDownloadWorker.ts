import { and, eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { fetchWithProxy, selectRunProxies } from "network";
import { withWorkerTracing } from "workerTracing";

import type { ZAsyncMediaDownloadRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  asyncMediaDownloads,
  bookmarkLinks,
} from "@karakeep/db/schema";
import {
  AsyncMediaDownloadQueue,
  QuotaService,
  zAsyncMediaDownloadRequestSchema,
} from "@karakeep/shared-server";
import {
  ASSET_TYPES,
  newAssetId,
  readAsset,
  saveAsset,
} from "@karakeep/shared/assetdb";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";

function normalizeImageContentType(contentType: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.startsWith("image/") ? normalized : null;
}

function replaceImageSource(html: string, oldUrl: string, assetUrl: string) {
  const escapedUrl = oldUrl.replaceAll("&", "&amp;");
  return html.replaceAll(oldUrl, assetUrl).replaceAll(escapedUrl, assetUrl);
}

async function rewriteStoredHtmlImage({
  bookmarkId,
  userId,
  sourceUrl,
  assetUrl,
}: {
  bookmarkId: string;
  userId: string;
  sourceUrl: string;
  assetUrl: string;
}) {
  const link = await db.query.bookmarkLinks.findFirst({
    where: eq(bookmarkLinks.id, bookmarkId),
  });
  if (!link) {
    return;
  }

  if (link.htmlContent) {
    await db
      .update(bookmarkLinks)
      .set({
        htmlContent: replaceImageSource(link.htmlContent, sourceUrl, assetUrl),
      })
      .where(eq(bookmarkLinks.id, bookmarkId));
    return;
  }

  if (!link.contentAssetId) {
    return;
  }

  const stored = await readAsset({
    userId,
    assetId: link.contentAssetId,
  });
  const html = stored.asset.toString("utf8");
  const rewritten = replaceImageSource(html, sourceUrl, assetUrl);
  if (rewritten === html) {
    return;
  }

  const buffer = Buffer.from(rewritten, "utf8");
  const quotaApproved = await QuotaService.checkStorageQuota(
    db,
    userId,
    buffer.byteLength,
  );
  const contentType = stored.metadata.contentType || ASSET_TYPES.TEXT_HTML;
  await saveAsset({
    userId,
    assetId: link.contentAssetId,
    asset: buffer,
    metadata: {
      contentType,
      fileName: stored.metadata.fileName ?? null,
    },
    quotaApproved,
  });
  await db
    .update(assets)
    .set({
      contentType,
      size: buffer.byteLength,
      fileName: stored.metadata.fileName ?? null,
    })
    .where(eq(assets.id, link.contentAssetId));
}

export class AsyncMediaDownloadWorker {
  static async build() {
    logger.info("Starting async media download worker ...");
    return (await getQueueClient())!.createRunner<ZAsyncMediaDownloadRequest>(
      AsyncMediaDownloadQueue,
      {
        run: withWorkerTracing("asyncMediaDownloadWorker.run", run),
        onComplete: (job) => {
          workerStatsCounter.labels("asyncMediaDownload", "completed").inc();
          logger.info(`[asyncMediaDownload][${job.id}] Completed successfully`);
          return Promise.resolve();
        },
        onError: (job) => {
          workerStatsCounter.labels("asyncMediaDownload", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter
              .labels("asyncMediaDownload", "failed_permanent")
              .inc();
          }
          logger.error(
            `[asyncMediaDownload][${job.id}] Failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: 1,
        pollIntervalMs: 1000,
        timeoutSecs: 60,
      },
    );
  }
}

async function run(job: DequeuedJob<ZAsyncMediaDownloadRequest>) {
  const request = zAsyncMediaDownloadRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(`Malformed async media download job: ${request.error}`);
  }

  const download = await db.query.asyncMediaDownloads.findFirst({
    where: eq(asyncMediaDownloads.id, request.data.downloadId),
  });
  if (!download || download.status === "success") {
    return;
  }

  await db
    .update(asyncMediaDownloads)
    .set({ attempts: download.attempts + 1 })
    .where(eq(asyncMediaDownloads.id, download.id));

  try {
    const response = await fetchWithProxy(
      download.sourceUrl,
      {
        signal: job.abortSignal,
        headers: download.referer ? { Referer: download.referer } : undefined,
      },
      selectRunProxies(),
    );
    if (!response.ok) {
      throw new Error(`Media fetch failed: ${response.status}`);
    }
    const contentType = normalizeImageContentType(
      response.headers.get("content-type"),
    );
    if (!contentType) {
      throw new Error("Media response is not an image");
    }

    const asset = Buffer.from(await response.arrayBuffer());
    const quotaApproved = await QuotaService.checkStorageQuota(
      db,
      download.userId,
      asset.byteLength,
    );
    const assetId = newAssetId();
    await saveAsset({
      userId: download.userId,
      assetId,
      asset,
      metadata: {
        contentType,
        fileName: null,
      },
      quotaApproved,
    });
    await db.insert(assets).values({
      id: assetId,
      bookmarkId: download.bookmarkId,
      userId: download.userId,
      assetType:
        download.target === "banner"
          ? AssetTypes.LINK_BANNER_IMAGE
          : AssetTypes.LINK_INLINE_IMAGE,
      contentType,
      size: asset.byteLength,
      fileName: null,
    });

    if (download.target === "inline") {
      await rewriteStoredHtmlImage({
        bookmarkId: download.bookmarkId,
        userId: download.userId,
        sourceUrl: download.sourceUrl,
        assetUrl: `/api/assets/${assetId}`,
      });
    } else {
      await db
        .update(bookmarkLinks)
        .set({ imageUrl: `/api/assets/${assetId}` })
        .where(eq(bookmarkLinks.id, download.bookmarkId));
    }

    await db
      .update(asyncMediaDownloads)
      .set({ status: "success", assetId, error: null })
      .where(eq(asyncMediaDownloads.id, download.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(asyncMediaDownloads)
      .set({ status: "failure", error: message })
      .where(
        and(
          eq(asyncMediaDownloads.id, download.id),
          eq(asyncMediaDownloads.status, "pending"),
        ),
      );
    throw error;
  }
}
