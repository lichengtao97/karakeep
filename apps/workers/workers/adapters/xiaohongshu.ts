import { and, eq } from "drizzle-orm";
import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";

import { db } from "@karakeep/db";
import { platformCredentials } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { decryptPlatformCredential } from "@karakeep/shared/platformCredentials";

import type {
  AdapterExtractInput,
  ExtractedContent,
  PlatformAdapter,
} from "./types";

export const XHS_ADAPTER_ID = "xiaohongshu";
export const XHS_ADAPTER_VERSION = "2026-05-09";
export const XHS_IMAGE_REFERER = "https://www.xiaohongshu.com/";

const SHORT_LINK_HOSTS = new Set(["xhslink.com"]);
const XHS_HOSTS = new Set([
  "xiaohongshu.com",
  "www.xiaohongshu.com",
  "m.xiaohongshu.com",
]);
const XHS_PATH_PATTERN = /^\/(?:discovery\/item|explore)\/[^/]+/;

type JsonRecord = Record<string, unknown>;

interface ParsedXhsNote {
  noteId: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  datePublished: string | null;
  coverImageUrl: string | null;
  imageList: string[];
  mediaType: "normal" | "video" | "unknown";
  tags: string[];
  hasVideoUrl: boolean;
  source: string;
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function timestampToIso(value: unknown): string | null {
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : null;
  if (!raw || !Number.isFinite(raw)) {
    return null;
  }
  const timestampMs = raw > 1_000_000_000_000 ? raw : raw * 1000;
  return new Date(timestampMs).toISOString();
}

function metaContent(document: Document, selector: string): string | null {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
  );
}

function absolutizeUrl(url: string | null | undefined, baseUrl: string) {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("data:")) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqueUrls(urls: (string | null | undefined)[], baseUrl: string) {
  return [
    ...new Set(
      urls
        .map((url) => absolutizeUrl(url, baseUrl))
        .filter((url): url is string => !!url),
    ),
  ];
}

function extractBalancedJson(text: string, startIndex: number): string | null {
  const opening = text[startIndex];
  const closing = opening === "{" ? "}" : opening === "[" ? "]" : null;
  if (!closing) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }
  return null;
}

function parseInitialState(scriptText: string): unknown | null {
  const markers = ["window.__INITIAL_STATE__", "__INITIAL_STATE__"];
  for (const marker of markers) {
    const markerIndex = scriptText.indexOf(marker);
    if (markerIndex < 0) {
      continue;
    }
    const equalsIndex = scriptText.indexOf("=", markerIndex);
    if (equalsIndex < 0) {
      continue;
    }
    const startIndex = scriptText.slice(equalsIndex + 1).search(/[{[]/);
    if (startIndex < 0) {
      continue;
    }
    const jsonText = extractBalancedJson(
      scriptText,
      equalsIndex + 1 + startIndex,
    );
    if (!jsonText) {
      continue;
    }
    try {
      return JSON.parse(jsonText.replace(/undefined/g, "null")) as unknown;
    } catch {
      continue;
    }
  }
  return null;
}

function extractInitialStates(document: Document): unknown[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>("script"))
    .map((script) => parseInitialState(script.textContent || ""))
    .filter((state): state is unknown => !!state);
}

function urlsFromValue(value: unknown): string[] {
  const direct = stringValue(value);
  if (direct) {
    return [direct];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => urlsFromValue(item));
  }
  const record = recordValue(value);
  if (!record) {
    return [];
  }
  return [
    ...urlsFromValue(record.url),
    ...urlsFromValue(record.urlDefault),
    ...urlsFromValue(record.url_default),
    ...urlsFromValue(record.urlPre),
    ...urlsFromValue(record.urlList),
    ...urlsFromValue(record.url_list),
    ...urlsFromValue(record.masterUrl),
    ...urlsFromValue(record.master_url),
  ];
}

function getNested(record: JsonRecord | null, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = recordValue(current);
    if (!currentRecord) {
      return null;
    }
    current = currentRecord[key];
  }
  return current;
}

function scoreNote(value: unknown): number {
  const note = recordValue(value);
  if (!note) {
    return 0;
  }
  let score = 0;
  if (firstString(note.noteId, note.note_id, note.id)) {
    score += 2;
  }
  if (firstString(note.title, note.desc, note.description)) {
    score += 3;
  }
  if (recordValue(note.user) || recordValue(note.userInfo)) {
    score += 2;
  }
  if (Array.isArray(note.imageList) || recordValue(note.video)) {
    score += 2;
  }
  return score;
}

function findBestNote(value: unknown): JsonRecord | null {
  const candidates: { score: number; note: JsonRecord }[] = [];
  function visit(current: unknown) {
    const record = recordValue(current);
    if (record) {
      const score = scoreNote(record);
      if (score >= 5) {
        candidates.push({ score, note: record });
      }
      for (const nested of Object.values(record)) {
        visit(nested);
      }
      return;
    }
    if (Array.isArray(current)) {
      for (const nested of current) {
        visit(nested);
      }
    }
  }
  visit(value);
  return candidates.sort((a, b) => b.score - a.score)[0]?.note ?? null;
}

function parseNote(note: JsonRecord, baseUrl: string): ParsedXhsNote {
  const user = recordValue(note.user) || recordValue(note.userInfo);
  const imageList = uniqueUrls(
    arrayValue(note.imageList).flatMap((image) => {
      const imageRecord = recordValue(image);
      if (!imageRecord) {
        return urlsFromValue(image);
      }
      return [
        ...urlsFromValue(imageRecord.urlDefault),
        ...urlsFromValue(imageRecord.url_default),
        ...urlsFromValue(imageRecord.urlPre),
        ...urlsFromValue(imageRecord.url),
        ...urlsFromValue(imageRecord.livePhoto),
      ];
    }),
    baseUrl,
  );
  const videoUrls = uniqueUrls(
    [
      ...urlsFromValue(getNested(note, ["video", "media", "stream", "h264"])),
      ...urlsFromValue(getNested(note, ["video", "media", "stream", "h265"])),
      ...urlsFromValue(getNested(note, ["video", "url"])),
    ],
    baseUrl,
  );
  const tags = arrayValue(note.tagList)
    .map((tag) => {
      const record = recordValue(tag);
      return firstString(record?.name, record?.tagName, tag);
    })
    .filter((tag): tag is string => !!tag);
  const coverImageUrl =
    uniqueUrls(
      [
        ...urlsFromValue(note.cover),
        ...urlsFromValue(getNested(note, ["cover", "urlDefault"])),
      ],
      baseUrl,
    )[0] ||
    imageList[0] ||
    null;

  return {
    noteId: firstString(note.noteId, note.note_id, note.id),
    title: firstString(note.title),
    description: firstString(note.desc, note.description),
    author: firstString(user?.nickname, user?.name, user?.userName),
    datePublished:
      timestampToIso(note.time) ||
      timestampToIso(note.timestamp) ||
      timestampToIso(note.createTime),
    coverImageUrl,
    imageList,
    mediaType:
      firstString(note.type) === "video" || videoUrls.length > 0
        ? "video"
        : imageList.length > 0
          ? "normal"
          : "unknown",
    tags,
    hasVideoUrl: videoUrls.length > 0,
    source: "initial-state",
  };
}

function parseMetaFallback(
  document: Document,
  url: string,
): ParsedXhsNote | null {
  const title =
    metaContent(document, 'meta[property="og:title"]') ||
    metaContent(document, 'meta[name="twitter:title"]') ||
    document.title.trim() ||
    null;
  const description =
    metaContent(document, 'meta[property="og:description"]') ||
    metaContent(document, 'meta[name="description"]') ||
    metaContent(document, 'meta[name="twitter:description"]') ||
    null;
  const imageList = uniqueUrls(
    [
      metaContent(document, 'meta[property="og:image"]'),
      metaContent(document, 'meta[name="twitter:image"]'),
    ],
    url,
  );
  if (!title && !description && imageList.length === 0) {
    return null;
  }
  return {
    noteId: null,
    title,
    description,
    author: null,
    datePublished: metaContent(
      document,
      'meta[property="article:published_time"]',
    ),
    coverImageUrl: imageList[0] || null,
    imageList,
    mediaType: "unknown",
    tags: [],
    hasVideoUrl: false,
    source: "meta",
  };
}

function buildXhsHtml(note: ParsedXhsNote) {
  const dom = new JSDOM("<article></article>");
  const { document } = dom.window;
  const article = document.querySelector("article")!;
  article.setAttribute("data-platform", XHS_ADAPTER_ID);

  if (note.author || note.datePublished) {
    const header = document.createElement("header");
    if (note.author) {
      const byline = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = note.author;
      byline.append(strong);
      header.append(byline);
    }
    if (note.datePublished) {
      const time = document.createElement("time");
      time.setAttribute("datetime", note.datePublished);
      time.textContent = note.datePublished;
      header.append(time);
    }
    article.append(header);
  }

  if (note.title) {
    const heading = document.createElement("h1");
    heading.textContent = note.title;
    article.append(heading);
  }
  if (note.description) {
    for (const line of note.description.split(/\n{2,}/)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line.trim();
      article.append(paragraph);
    }
  }
  if (note.tags.length > 0) {
    const tagList = document.createElement("p");
    tagList.textContent = note.tags.map((tag) => `#${tag}`).join(" ");
    article.append(tagList);
  }
  for (const imageUrl of note.imageList) {
    const img = document.createElement("img");
    img.setAttribute("src", imageUrl);
    article.append(img);
  }
  return article.outerHTML;
}

export function parseXhsHtml(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const initialStates = extractInitialStates(document);
  const note = initialStates
    .map((state) => findBestNote(state))
    .find((found): found is JsonRecord => !!found);
  const parsed =
    (note ? parseNote(note, url) : null) || parseMetaFallback(document, url);

  if (
    !parsed ||
    (!parsed.title && !parsed.description && parsed.imageList.length === 0)
  ) {
    throw new Error("Xiaohongshu page did not contain public note metadata");
  }

  const title = parsed.title || parsed.description || "Xiaohongshu";
  const imageList = parsed.coverImageUrl
    ? uniqueUrls([parsed.coverImageUrl, ...parsed.imageList], url)
    : parsed.imageList;

  return {
    title,
    description: parsed.description,
    author: parsed.author,
    publisher: "Xiaohongshu",
    datePublished: parsed.datePublished,
    dateModified: null,
    coverImageUrl: parsed.coverImageUrl || imageList[0] || null,
    htmlContent: buildXhsHtml({ ...parsed, title, imageList }),
    imageList,
    platform: XHS_ADAPTER_ID,
    rawExtraction: {
      noteId: parsed.noteId,
      mediaType: parsed.mediaType,
      source: parsed.source,
      imageList,
      coverImageUrl: parsed.coverImageUrl || imageList[0] || null,
      tags: parsed.tags,
      hasVideoUrl: parsed.hasVideoUrl,
    },
    adapterVersion: XHS_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: XHS_IMAGE_REFERER,
  };
}

async function getXhsCookie(userId: string): Promise<string | null> {
  const credential = await db.query.platformCredentials.findFirst({
    where: and(
      eq(platformCredentials.userId, userId),
      eq(platformCredentials.platform, "xiaohongshu"),
      eq(platformCredentials.credentialType, "cookie"),
    ),
  });
  if (credential) {
    await db
      .update(platformCredentials)
      .set({ lastUsedAt: new Date() })
      .where(eq(platformCredentials.id, credential.id));
    return decryptPlatformCredential(credential.encryptedValue);
  }
  return serverConfig.adapters.xhsUserCookie ?? null;
}

export const xiaohongshuAdapter: PlatformAdapter = {
  id: XHS_ADAPTER_ID,
  version: XHS_ADAPTER_VERSION,
  priority: 70,
  match(url: URL) {
    if (SHORT_LINK_HOSTS.has(url.hostname)) {
      return url.pathname !== "/";
    }
    return XHS_HOSTS.has(url.hostname) && XHS_PATH_PATTERN.test(url.pathname);
  },
  async extract({
    url,
    userId,
    abortSignal,
    runProxy,
  }: AdapterExtractInput): Promise<ExtractedContent> {
    const cookie = await getXhsCookie(userId);
    const response = await fetchWithProxy(
      url,
      {
        signal: abortSignal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: XHS_IMAGE_REFERER,
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      runProxy,
    );
    if (!response.ok) {
      throw new Error(`Xiaohongshu adapter fetch failed: ${response.status}`);
    }
    const html = await response.text();
    return {
      ...parseXhsHtml(html, response.url || url),
      statusCode: response.status,
      url: response.url || url,
    };
  },
};
