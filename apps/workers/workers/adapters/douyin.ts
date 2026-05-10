import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";

import type {
  AdapterExtractInput,
  ExtractedContent,
  PlatformAdapter,
} from "./types";

export const DOUYIN_ADAPTER_ID = "douyin";
export const DOUYIN_ADAPTER_VERSION = "2026-05-09";
export const DOUYIN_IMAGE_REFERER = "https://www.douyin.com/";

const SHORT_LINK_HOSTS = new Set(["v.douyin.com"]);
const DOUYIN_HOSTS = new Set([
  "douyin.com",
  "www.douyin.com",
  "m.douyin.com",
  "iesdouyin.com",
  "www.iesdouyin.com",
]);
const DIRECT_PATH_PATTERN = /^\/(?:video|note)\/[^/]+/;
const SHARE_PATH_PATTERN = /^\/share\/(?:video|note|slides)\/[^/]+/;

type JsonRecord = Record<string, unknown>;

interface ParsedDouyinItem {
  id: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  datePublished: string | null;
  coverImageUrl: string | null;
  imageList: string[];
  mediaType: "video" | "image" | "unknown";
  musicTitle: string | null;
  videoUrlCount: number;
  source: string;
}

function metaContent(document: Document, selector: string): string | null {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function stripProductSuffix(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return (
    value
      .replace(/\s*[-_]\s*抖音\s*$/i, "")
      .replace(/\s*[-_]\s*Douyin\s*$/i, "")
      .trim() || null
  );
}

function parsePossiblyEncodedJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const candidates = [trimmed];
  if (trimmed.includes("%7B") || trimmed.includes("%5B")) {
    try {
      candidates.unshift(decodeURIComponent(trimmed));
    } catch {
      // Fall through to the raw text below.
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  return null;
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

function parseAssignedJson(scriptText: string): unknown[] {
  const values: unknown[] = [];
  const markers = [
    "window._ROUTER_DATA",
    "window.__INIT_PROPS__",
    "window.__UNIVERSAL_DATA_FOR_REHYDRATION__",
    "window._SSR_DATA",
    "window.SIGI_STATE",
  ];

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
    const parsed = parsePossiblyEncodedJson(jsonText);
    if (parsed) {
      values.push(parsed);
    }
  }

  return values;
}

function extractHydrationJson(document: Document): unknown[] {
  const values: unknown[] = [];
  const selectors = [
    "#RENDER_DATA",
    "#SIGI_STATE",
    "#__UNIVERSAL_DATA_FOR_REHYDRATION__",
    'script[type="application/json"]',
    'script[type="application/ld+json"]',
    "script",
  ];

  for (const script of Array.from(
    document.querySelectorAll<HTMLScriptElement>(selectors.join(",")),
  )) {
    const parsed = parsePossiblyEncodedJson(script.textContent || "");
    if (parsed) {
      values.push(parsed);
    }
    values.push(...parseAssignedJson(script.textContent || ""));
  }

  return values;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = stringValue(value);
    if (found) {
      return found;
    }
  }
  return null;
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
    ...urlsFromValue(record.url_list),
    ...urlsFromValue(record.urlList),
    ...urlsFromValue(record.url),
    ...urlsFromValue(record.src),
  ];
}

function firstUrl(baseUrl: string, ...values: unknown[]) {
  return (
    uniqueUrls(
      values.flatMap((value) => urlsFromValue(value)),
      baseUrl,
    )[0] || null
  );
}

function getByPath(record: JsonRecord | null, path: string[]): unknown {
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

function collectKnownImageUrls(item: JsonRecord, baseUrl: string): string[] {
  const imagePostInfo =
    recordValue(item.image_post_info) || recordValue(item.imagePostInfo);
  const imagePostImages = [
    ...arrayValue(imagePostInfo?.images),
    ...arrayValue(imagePostInfo?.imageList),
  ];
  const genericImages = [
    ...arrayValue(item.images),
    ...arrayValue(item.image_list),
    ...arrayValue(item.imageList),
  ];
  const imageUrls = [...imagePostImages, ...genericImages].flatMap((image) => {
    const record = recordValue(image);
    if (!record) {
      return urlsFromValue(image);
    }
    return [
      ...urlsFromValue(record.display_image),
      ...urlsFromValue(record.displayImage),
      ...urlsFromValue(record.origin_image),
      ...urlsFromValue(record.originImage),
      ...urlsFromValue(record.image),
      ...urlsFromValue(record.url_list),
      ...urlsFromValue(record.urlList),
      ...urlsFromValue(record.url),
    ];
  });

  return uniqueUrls(
    [
      ...imageUrls,
      ...urlsFromValue(getByPath(item, ["video", "cover"])),
      ...urlsFromValue(getByPath(item, ["video", "origin_cover"])),
      ...urlsFromValue(getByPath(item, ["video", "originCover"])),
      ...urlsFromValue(getByPath(item, ["video", "dynamic_cover"])),
      ...urlsFromValue(getByPath(item, ["video", "dynamicCover"])),
      ...urlsFromValue(item.cover),
      ...urlsFromValue(item.cover_url),
      ...urlsFromValue(item.coverUrl),
    ],
    baseUrl,
  );
}

function collectVideoUrls(item: JsonRecord, baseUrl: string): string[] {
  return uniqueUrls(
    [
      ...urlsFromValue(getByPath(item, ["video", "play_addr"])),
      ...urlsFromValue(getByPath(item, ["video", "playAddr"])),
      ...urlsFromValue(getByPath(item, ["video", "download_addr"])),
      ...urlsFromValue(getByPath(item, ["video", "downloadAddr"])),
    ],
    baseUrl,
  );
}

function parseAuthor(item: JsonRecord): string | null {
  const author =
    recordValue(item.author) ||
    recordValue(item.authorInfo) ||
    recordValue(item.user);
  return (
    firstString(
      author?.nickname,
      author?.name,
      author?.unique_id,
      author?.uniqueId,
      item.author_name,
      item.authorName,
    ) || null
  );
}

function scoreDouyinItem(value: unknown): number {
  const item = recordValue(value);
  if (!item) {
    return 0;
  }

  let score = 0;
  if (
    firstString(item.aweme_id, item.awemeId, item.item_id, item.itemId, item.id)
  ) {
    score += 3;
  }
  if (firstString(item.desc, item.description, item.title, item.content)) {
    score += 3;
  }
  if (
    recordValue(item.author) ||
    recordValue(item.authorInfo) ||
    recordValue(item.user)
  ) {
    score += 2;
  }
  if (
    recordValue(item.video) ||
    recordValue(item.image_post_info) ||
    item.images
  ) {
    score += 2;
  }
  if (item.create_time || item.createTime || item.createTimeMs) {
    score += 1;
  }
  return score;
}

function findBestDouyinItem(value: unknown): JsonRecord | null {
  const candidates: { score: number; item: JsonRecord }[] = [];

  function visit(current: unknown) {
    const record = recordValue(current);
    if (record) {
      const score = scoreDouyinItem(record);
      if (score >= 5) {
        candidates.push({ score, item: record });
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
  return candidates.sort((a, b) => b.score - a.score)[0]?.item ?? null;
}

function parseDouyinItem(
  item: JsonRecord,
  baseUrl: string,
  source: string,
): ParsedDouyinItem {
  const shareInfo = recordValue(item.share_info) || recordValue(item.shareInfo);
  const statistics = recordValue(item.statistics);
  const description =
    firstString(
      item.desc,
      item.description,
      item.content,
      shareInfo?.share_desc,
    ) || null;
  const title =
    firstString(item.title, shareInfo?.share_title, shareInfo?.title) ||
    (description
      ? `${description.slice(0, 80)}${description.length > 80 ? "..." : ""}`
      : null);
  const imageList = collectKnownImageUrls(item, baseUrl);
  const videoUrls = collectVideoUrls(item, baseUrl);
  const mediaType =
    recordValue(item.image_post_info) || imageList.length > 1
      ? "image"
      : recordValue(item.video) || videoUrls.length > 0
        ? "video"
        : "unknown";
  const music = recordValue(item.music);

  return {
    id: firstString(
      item.aweme_id,
      item.awemeId,
      item.item_id,
      item.itemId,
      item.id,
      statistics?.aweme_id,
    ),
    title,
    description,
    author: parseAuthor(item),
    datePublished:
      timestampToIso(item.create_time) ||
      timestampToIso(item.createTime) ||
      timestampToIso(item.createTimeMs),
    coverImageUrl:
      firstUrl(
        baseUrl,
        getByPath(item, ["video", "cover"]),
        item.cover,
        item.cover_url,
        item.coverUrl,
      ) ||
      imageList[0] ||
      null,
    imageList,
    mediaType,
    musicTitle: firstString(music?.title, music?.music_name, music?.name),
    videoUrlCount: videoUrls.length,
    source,
  };
}

function parseJsonLd(
  document: Document,
  baseUrl: string,
): ParsedDouyinItem | null {
  for (const script of Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  )) {
    const parsed = parsePossiblyEncodedJson(script.textContent || "");
    const record = recordValue(parsed);
    if (!record) {
      continue;
    }
    const author = recordValue(record.author);
    const images = uniqueUrls(urlsFromValue(record.image), baseUrl);
    const description = firstString(
      record.description,
      record.text,
      record.articleBody,
    );
    if (!description && !record.name && images.length === 0) {
      continue;
    }
    return {
      id: null,
      title: firstString(record.name, record.headline) || description,
      description,
      author: firstString(author?.name, author?.alternateName),
      datePublished: stringValue(record.datePublished),
      coverImageUrl: images[0] || null,
      imageList: images,
      mediaType: "unknown",
      musicTitle: null,
      videoUrlCount: 0,
      source: "json-ld",
    };
  }

  return null;
}

function parseMetaFallback(
  document: Document,
  url: string,
): ParsedDouyinItem | null {
  const title = stripProductSuffix(
    metaContent(document, 'meta[property="og:title"]') ||
      metaContent(document, 'meta[name="twitter:title"]') ||
      document.title.trim() ||
      null,
  );
  const description =
    metaContent(document, 'meta[property="og:description"]') ||
    metaContent(document, 'meta[name="description"]') ||
    metaContent(document, 'meta[name="twitter:description"]') ||
    null;
  const imageList = uniqueUrls(
    [
      metaContent(document, 'meta[property="og:image"]'),
      metaContent(document, 'meta[name="twitter:image"]'),
      metaContent(document, 'meta[name="twitter:image:src"]'),
    ],
    url,
  );

  if (!title && !description && imageList.length === 0) {
    return null;
  }

  return {
    id: null,
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
    musicTitle: null,
    videoUrlCount: 0,
    source: "meta",
  };
}

function buildDouyinHtml({
  title,
  description,
  author,
  datePublished,
  imageList,
}: {
  title: string | null;
  description: string | null;
  author: string | null;
  datePublished: string | null;
  imageList: string[];
}) {
  const dom = new JSDOM("<article></article>");
  const { document } = dom.window;
  const article = document.querySelector("article")!;
  article.setAttribute("data-platform", DOUYIN_ADAPTER_ID);

  if (author || datePublished) {
    const header = document.createElement("header");
    if (author) {
      const byline = document.createElement("p");
      const displayName = document.createElement("strong");
      displayName.textContent = author;
      byline.append(displayName);
      header.append(byline);
    }
    if (datePublished) {
      const time = document.createElement("time");
      time.setAttribute("datetime", datePublished);
      time.textContent = datePublished;
      header.append(time);
    }
    article.append(header);
  }

  if (title && title !== description) {
    const heading = document.createElement("h1");
    heading.textContent = title;
    article.append(heading);
  }

  if (description) {
    for (const line of description.split(/\n{2,}/)) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line.trim();
      article.append(paragraph);
    }
  }

  for (const imageUrl of imageList) {
    const img = document.createElement("img");
    img.setAttribute("src", imageUrl);
    article.append(img);
  }

  return article.outerHTML;
}

export function parseDouyinHtml(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const hydrationValues = extractHydrationJson(document);
  const jsonItem = hydrationValues
    .map((value) => findBestDouyinItem(value))
    .find((item): item is JsonRecord => !!item);
  const parsed =
    (jsonItem ? parseDouyinItem(jsonItem, url, "hydration-json") : null) ||
    parseJsonLd(document, url) ||
    parseMetaFallback(document, url);

  if (
    !parsed ||
    (!parsed.title && !parsed.description && parsed.imageList.length === 0)
  ) {
    throw new Error("Douyin page did not contain public metadata");
  }

  const title = parsed.title || parsed.description || "Douyin";
  const imageList = parsed.coverImageUrl
    ? uniqueUrls([parsed.coverImageUrl, ...parsed.imageList], url)
    : parsed.imageList;

  return {
    title,
    description: parsed.description,
    author: parsed.author,
    publisher: "Douyin",
    datePublished: parsed.datePublished,
    dateModified: null,
    coverImageUrl: parsed.coverImageUrl || imageList[0] || null,
    htmlContent: buildDouyinHtml({
      title,
      description: parsed.description,
      author: parsed.author,
      datePublished: parsed.datePublished,
      imageList,
    }),
    imageList,
    platform: DOUYIN_ADAPTER_ID,
    rawExtraction: {
      douyinId: parsed.id,
      mediaType: parsed.mediaType,
      source: parsed.source,
      imageList,
      coverImageUrl: parsed.coverImageUrl || imageList[0] || null,
      musicTitle: parsed.musicTitle,
      hasVideoUrls: parsed.videoUrlCount > 0,
      videoUrlCount: parsed.videoUrlCount,
    },
    adapterVersion: DOUYIN_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: DOUYIN_IMAGE_REFERER,
  };
}

export const douyinAdapter: PlatformAdapter = {
  id: DOUYIN_ADAPTER_ID,
  version: DOUYIN_ADAPTER_VERSION,
  priority: 80,
  match(url: URL) {
    if (SHORT_LINK_HOSTS.has(url.hostname)) {
      return url.pathname !== "/";
    }
    if (!DOUYIN_HOSTS.has(url.hostname)) {
      return false;
    }
    return (
      DIRECT_PATH_PATTERN.test(url.pathname) ||
      SHARE_PATH_PATTERN.test(url.pathname) ||
      (url.pathname === "/discover" && url.searchParams.has("modal_id"))
    );
  },
  async extract({
    url,
    abortSignal,
    runProxy,
  }: AdapterExtractInput): Promise<ExtractedContent> {
    const response = await fetchWithProxy(
      url,
      {
        signal: abortSignal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: DOUYIN_IMAGE_REFERER,
        },
      },
      runProxy,
    );
    if (!response.ok) {
      throw new Error(`Douyin adapter fetch failed: ${response.status}`);
    }
    const html = await response.text();
    return {
      ...parseDouyinHtml(html, response.url || url),
      statusCode: response.status,
      url: response.url || url,
    };
  },
};
