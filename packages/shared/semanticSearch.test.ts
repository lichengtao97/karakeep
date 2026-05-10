import { describe, expect, test } from "vitest";

import {
  bufferToEmbedding,
  chunkTextForEmbedding,
  cosineSimilarity,
  embeddingToBuffer,
  reciprocalRankFusion,
} from "./semanticSearch";

describe("semanticSearch helpers", () => {
  test("chunks text with stable hashes", () => {
    const chunks = chunkTextForEmbedding("a ".repeat(1200), 100, 10);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({
      idx: 0,
      tokenCount: expect.any(Number),
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  test("round-trips embeddings through buffers", () => {
    const embedding = [0.1, 0.2, 0.3];
    const roundTrip = bufferToEmbedding(embeddingToBuffer(embedding));
    expect(roundTrip).toHaveLength(3);
    expect(roundTrip[0]).toBeCloseTo(0.1);
    expect(roundTrip[1]).toBeCloseTo(0.2);
    expect(roundTrip[2]).toBeCloseTo(0.3);
  });

  test("scores cosine similarity and RRF", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    const scores = reciprocalRankFusion([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(scores.get("b")!).toBeGreaterThan(scores.get("a")!);
  });
});
