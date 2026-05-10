import { eq } from "drizzle-orm";
import { workerStatsCounter } from "metrics";
import { withWorkerTracing } from "workerTracing";

import type { ZSemanticIndexingRequest } from "@karakeep/shared-server";
import { db } from "@karakeep/db";
import {
  bookmarkChunks,
  bookmarkEmbeddings,
  bookmarks,
} from "@karakeep/db/schema";
import {
  SemanticIndexingQueue,
  zSemanticIndexingRequestSchema,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { InferenceClientFactory } from "@karakeep/shared/inference";
import logger from "@karakeep/shared/logger";
import { DequeuedJob, getQueueClient } from "@karakeep/shared/queueing";
import {
  chunkTextForEmbedding,
  embeddingToBuffer,
} from "@karakeep/shared/semanticSearch";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

export class SemanticIndexingWorker {
  static async build() {
    logger.info("Starting semantic indexing worker ...");
    return (await getQueueClient())!.createRunner<ZSemanticIndexingRequest>(
      SemanticIndexingQueue,
      {
        run: withWorkerTracing("semanticIndexingWorker.run", run),
        onComplete: (job) => {
          workerStatsCounter.labels("semanticIndexing", "completed").inc();
          logger.info(`[semanticIndexing][${job.id}] Completed successfully`);
          return Promise.resolve();
        },
        onError: (job) => {
          workerStatsCounter.labels("semanticIndexing", "failed").inc();
          if (job.numRetriesLeft == 0) {
            workerStatsCounter
              .labels("semanticIndexing", "failed_permanent")
              .inc();
          }
          logger.error(
            `[semanticIndexing][${job.id}] Failed: ${job.error}\n${job.error.stack}`,
          );
          return Promise.resolve();
        },
      },
      {
        concurrency: serverConfig.search.numWorkers,
        pollIntervalMs: 1000,
        timeoutSecs: serverConfig.search.jobTimeoutSec,
      },
    );
  }
}

async function deleteSemanticIndex(bookmarkId: string) {
  await db
    .delete(bookmarkChunks)
    .where(eq(bookmarkChunks.bookmarkId, bookmarkId));
}

async function bookmarkTextForEmbedding(bookmarkId: string) {
  const bookmark = await db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, bookmarkId),
    with: {
      link: true,
      text: true,
      asset: true,
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
    },
  });
  if (!bookmark) {
    return null;
  }

  const parts = [
    bookmark.title,
    bookmark.note,
    bookmark.summary,
    ...bookmark.tagsOnBookmarks.map((tag) => tag.tag.name),
  ];
  if (bookmark.type === BookmarkTypes.LINK && bookmark.link) {
    parts.push(
      bookmark.link.title,
      bookmark.link.description,
      bookmark.link.author,
      bookmark.link.publisher,
      await Bookmark.getBookmarkPlainTextContent(
        bookmark.link,
        bookmark.userId,
      ),
    );
  } else if (bookmark.type === BookmarkTypes.TEXT && bookmark.text) {
    parts.push(bookmark.text.text);
  } else if (bookmark.type === BookmarkTypes.ASSET && bookmark.asset) {
    parts.push(bookmark.asset.content, bookmark.asset.metadata);
  }

  return {
    userId: bookmark.userId,
    text: parts.filter((part): part is string => !!part?.trim()).join("\n\n"),
  };
}

async function indexBookmark(bookmarkId: string) {
  const inferenceClient = InferenceClientFactory.build();
  if (!inferenceClient) {
    logger.debug("[semanticIndexing] Inference is not configured, skipping");
    return;
  }

  const source = await bookmarkTextForEmbedding(bookmarkId);
  if (!source) {
    await deleteSemanticIndex(bookmarkId);
    return;
  }

  const chunks = chunkTextForEmbedding(source.text);
  await deleteSemanticIndex(bookmarkId);
  if (chunks.length === 0) {
    return;
  }

  const inserted = await db
    .insert(bookmarkChunks)
    .values(
      chunks.map((chunk) => ({
        bookmarkId,
        userId: source.userId,
        idx: chunk.idx,
        content: chunk.content,
        tokenCount: chunk.tokenCount,
        contentHash: chunk.contentHash,
      })),
    )
    .returning();

  const embeddings = await inferenceClient.generateEmbeddingFromText(
    inserted.map((chunk) => chunk.content),
  );
  await db.insert(bookmarkEmbeddings).values(
    inserted.map((chunk, index) => {
      const embedding = embeddings.embeddings[index];
      return {
        chunkId: chunk.id,
        bookmarkId,
        userId: source.userId,
        model: serverConfig.embedding.textModel,
        dim: embedding.length,
        embedding: embeddingToBuffer(embedding),
      };
    }),
  );
}

async function run(job: DequeuedJob<ZSemanticIndexingRequest>) {
  const request = zSemanticIndexingRequestSchema.safeParse(job.data);
  if (!request.success) {
    throw new Error(`Malformed semantic indexing job: ${request.error}`);
  }

  if (request.data.type === "delete") {
    await deleteSemanticIndex(request.data.bookmarkId);
    return;
  }
  await indexBookmark(request.data.bookmarkId);
}
