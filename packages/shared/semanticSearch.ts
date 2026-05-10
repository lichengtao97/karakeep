import crypto from "node:crypto";

export interface TextChunk {
  idx: number;
  content: string;
  tokenCount: number;
  contentHash: string;
}

export function chunkTextForEmbedding(
  text: string,
  maxChars = 1600,
  overlapChars = 160,
): TextChunk[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + maxChars, normalized.length);
    const content = normalized.slice(start, end).trim();
    if (content) {
      chunks.push({
        idx: chunks.length,
        content,
        tokenCount: Math.ceil(content.length / 4),
        contentHash: crypto.createHash("sha256").update(content).digest("hex"),
      });
    }
    if (end === normalized.length) {
      break;
    }
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

export function embeddingToBuffer(embedding: number[]) {
  return Buffer.from(new Float32Array(embedding).buffer);
}

export function bufferToEmbedding(buffer: Buffer) {
  return Array.from(
    new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4),
  );
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (!aNorm || !bNorm) {
    return 0;
  }
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

export function reciprocalRankFusion(
  rankedLists: string[][],
  k = 60,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return scores;
}
