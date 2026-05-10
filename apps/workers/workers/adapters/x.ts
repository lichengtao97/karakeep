import { JSDOM } from "jsdom";
import { fetchWithProxy } from "network";

import type {
  AdapterExtractInput,
  ExtractedContent,
  PlatformAdapter,
} from "./types";

export const X_ADAPTER_ID = "x";
export const X_ADAPTER_VERSION = "2026-05-10";
export const X_IMAGE_REFERER = "https://x.com/";

const TWITTER_EPOCH_MS = 1288834974657n;
const STATUS_PATH_PATTERN = /^\/([^/]+)\/status(?:es)?\/(\d+)(?:\/|$)/;
const X_HOSTS = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);
const X_SYNDICATION_ENDPOINT = "https://cdn.syndication.twimg.com/tweet-result";
const X_OEMBED_ENDPOINT = "https://publish.x.com/oembed";
const X_SYNDICATION_FEATURES = [
  "tfw_timeline_list:",
  "tfw_follower_count_sunset:true",
  "tfw_tweet_edit_backend:on",
  "tfw_refsrc_session:on",
  "tfw_fosnr_soft_interventions_enabled:on",
  "tfw_show_birdwatch_pivots_enabled:on",
  "tfw_show_business_verified_badge:on",
  "tfw_duplicate_scribes_to_settings:on",
  "tfw_use_profile_image_shape_enabled:on",
  "tfw_show_blue_verified_badge:on",
  "tfw_legacy_timeline_sunset:true",
  "tfw_show_gov_verified_badge:on",
  "tfw_show_business_affiliate_badge:on",
  "tfw_tweet_edit_frontend:on",
].join(";");

interface XEntity {
  indices?: [number, number];
  expanded_url?: string;
  display_url?: string;
  url?: string;
}

interface XMediaDetails {
  media_url_https?: string;
  type?: "photo" | "video" | "animated_gif" | string;
}

interface XSyndicationTweet {
  __typename?: string;
  id_str?: string;
  text?: string;
  created_at?: string;
  user?: {
    name?: string;
    screen_name?: string;
  };
  entities?: {
    urls?: XEntity[];
    media?: XEntity[];
  };
  mediaDetails?: XMediaDetails[];
}

interface XOEmbedResponse {
  url?: string;
  author_name?: string;
  author_url?: string;
  html?: string;
  provider_name?: string;
  error?: string;
}

type XFetchInput = Pick<
  AdapterExtractInput,
  "abortSignal" | "runProxy" | "url"
>;

function metaContent(document: Document, selector: string): string | null {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content?.trim() || null
  );
}

function metaContents(document: Document, selector: string): string[] {
  return Array.from(document.querySelectorAll<HTMLMetaElement>(selector))
    .map((meta) => meta.content.trim())
    .filter(Boolean);
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

function parseStatusPath(url: string): { handle: string; tweetId: string } {
  const parsed = new URL(url);
  const match = parsed.pathname.match(STATUS_PATH_PATTERN);
  if (!match) {
    throw new Error("X/Twitter URL is not a status URL");
  }
  return { handle: match[1], tweetId: match[2] };
}

function dateFromTweetId(tweetId: string): string | null {
  try {
    const id = BigInt(tweetId);
    if (id <= 0n) {
      return null;
    }
    const timestampMs = (id >> 22n) + TWITTER_EPOCH_MS;
    return new Date(Number(timestampMs)).toISOString();
  } catch {
    return null;
  }
}

function getSyndicationToken(tweetId: string) {
  return ((Number(tweetId) / 1e15) * Math.PI)
    .toString(6 ** 2)
    .replace(/(0+|\.)/g, "");
}

function buildSyndicationUrl(tweetId: string) {
  const endpoint = new URL(X_SYNDICATION_ENDPOINT);
  endpoint.searchParams.set("id", tweetId);
  endpoint.searchParams.set("lang", "en");
  endpoint.searchParams.set("features", X_SYNDICATION_FEATURES);
  endpoint.searchParams.set("token", getSyndicationToken(tweetId));
  return endpoint.toString();
}

function stripTrailingProductName(value: string): string {
  return value
    .replace(/\s+\/\s+(?:X|Twitter)\s*$/i, "")
    .replace(/\s+on\s+(?:X|Twitter)\s*$/i, "")
    .trim();
}

function extractTitleParts(rawTitle: string | null): {
  author: string | null;
  tweetText: string | null;
} {
  if (!rawTitle) {
    return { author: null, tweetText: null };
  }

  const title = stripTrailingProductName(rawTitle);
  const match = title.match(
    /^(.*?)\s+on\s+(?:X|Twitter):\s*["“](.*)["”]\s*$/is,
  );
  if (match) {
    return {
      author: match[1].trim() || null,
      tweetText: match[2].trim() || null,
    };
  }

  return { author: null, tweetText: title || null };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function findJsonLdPosting(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const types = arrayValue(record["@type"]).filter(
    (type): type is string => typeof type === "string",
  );
  if (
    types.some((type) =>
      ["SocialMediaPosting", "BlogPosting", "CreativeWork"].includes(type),
    )
  ) {
    return record;
  }

  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findJsonLdPosting(item);
        if (found) {
          return found;
        }
      }
    } else {
      const found = findJsonLdPosting(nested);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractJsonLd(document: Document): {
  text: string | null;
  author: string | null;
  datePublished: string | null;
  images: string[];
} {
  for (const script of Array.from(
    document.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  )) {
    try {
      const json = JSON.parse(script.textContent || "null") as unknown;
      const posting = findJsonLdPosting(json);
      if (!posting) {
        continue;
      }

      const authorRecord =
        posting.author && typeof posting.author === "object"
          ? (posting.author as Record<string, unknown>)
          : null;
      const images = arrayValue(posting.image)
        .map((image) =>
          typeof image === "object" && image
            ? stringValue((image as Record<string, unknown>).url)
            : stringValue(image),
        )
        .filter((image): image is string => !!image);

      return {
        text:
          stringValue(posting.articleBody) ||
          stringValue(posting.text) ||
          stringValue(posting.description) ||
          null,
        author:
          (authorRecord
            ? stringValue(authorRecord.name) ||
              stringValue(authorRecord.alternateName)
            : null) || null,
        datePublished: stringValue(posting.datePublished),
        images,
      };
    } catch {
      continue;
    }
  }

  return { text: null, author: null, datePublished: null, images: [] };
}

function textWithLineBreaks(element: Element): string {
  let text = "";
  function walk(node: Node) {
    if (node.nodeType === node.TEXT_NODE) {
      text += node.textContent || "";
      return;
    }
    if (node instanceof element.ownerDocument.defaultView!.HTMLBRElement) {
      text += "\n";
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  }
  walk(element);
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTweetText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replaceTextRange(
  text: string,
  range: [number, number],
  value: string,
) {
  const chars = Array.from(text);
  chars.splice(range[0], range[1] - range[0], value);
  return chars.join("");
}

function cleanSyndicationText(tweet: XSyndicationTweet) {
  let text = tweet.text || "";
  const replacements = [
    ...(tweet.entities?.media || []).map((entity) => ({
      entity,
      value: "",
    })),
    ...(tweet.entities?.urls || []).map((entity) => ({
      entity,
      value: entity.expanded_url || entity.display_url || "",
    })),
  ]
    .filter((replacement): replacement is { entity: XEntity; value: string } =>
      Array.isArray(replacement.entity.indices),
    )
    .sort((a, b) => b.entity.indices![0] - a.entity.indices![0]);

  for (const { entity, value } of replacements) {
    text = replaceTextRange(text, entity.indices!, value);
  }

  return normalizeTweetText(text);
}

function mediaImageUrl(media: XMediaDetails) {
  if (!media.media_url_https) {
    return null;
  }
  try {
    const url = new URL(media.media_url_https);
    const extension = url.pathname.split(".").pop();
    if (!extension) {
      return media.media_url_https;
    }
    url.pathname = url.pathname.replace(`.${extension}`, "");
    url.searchParams.set("format", extension);
    url.searchParams.set("name", "large");
    return url.toString();
  } catch {
    return media.media_url_https;
  }
}

function buildTweetHtml({
  author,
  handle,
  tweetText,
  datePublished,
  imageList,
}: {
  author: string | null;
  handle: string;
  tweetText: string | null;
  datePublished: string | null;
  imageList: string[];
}) {
  const dom = new JSDOM("<article></article>");
  const { document } = dom.window;
  const article = document.querySelector("article")!;
  article.setAttribute("data-platform", X_ADAPTER_ID);

  const header = document.createElement("header");
  const byline = document.createElement("p");
  const displayName = document.createElement("strong");
  displayName.textContent = author || `@${handle}`;
  byline.append(displayName);
  if (handle) {
    byline.append(" ");
    const handleElement = document.createElement("span");
    handleElement.textContent = `@${handle}`;
    byline.append(handleElement);
  }
  header.append(byline);

  if (datePublished) {
    const time = document.createElement("time");
    time.setAttribute("datetime", datePublished);
    time.textContent = datePublished;
    header.append(time);
  }
  article.append(header);

  if (tweetText) {
    for (const line of tweetText.split(/\n{2,}/)) {
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

export function parseXStatusHtml(html: string, url: string): ExtractedContent {
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;
  const { handle, tweetId } = parseStatusPath(url);
  const jsonLd = extractJsonLd(document);
  const rawTitle =
    metaContent(document, 'meta[property="og:title"]') ||
    metaContent(document, 'meta[name="twitter:title"]') ||
    document.title.trim() ||
    null;
  const titleParts = extractTitleParts(rawTitle);
  const description =
    jsonLd.text ||
    metaContent(document, 'meta[property="og:description"]') ||
    metaContent(document, 'meta[name="twitter:description"]') ||
    titleParts.tweetText ||
    null;
  const author = jsonLd.author || titleParts.author || handle;
  const datePublished =
    jsonLd.datePublished ||
    metaContent(document, 'meta[property="article:published_time"]') ||
    dateFromTweetId(tweetId);
  const imageList = [
    ...new Set(
      [
        ...jsonLd.images,
        ...metaContents(document, 'meta[property="og:image"]'),
        ...metaContents(document, 'meta[name="twitter:image"]'),
        ...metaContents(document, 'meta[name="twitter:image:src"]'),
      ]
        .map((imageUrl) => absolutizeUrl(imageUrl, url))
        .filter((imageUrl): imageUrl is string => !!imageUrl),
    ),
  ];
  const tweetText = description || titleParts.tweetText;
  const title =
    tweetText && author
      ? `${author}: ${tweetText.slice(0, 80)}${tweetText.length > 80 ? "..." : ""}`
      : stripTrailingProductName(rawTitle || "") || null;

  if (!tweetText && !title) {
    throw new Error("X/Twitter status page did not contain tweet text");
  }

  return {
    title,
    description: tweetText,
    author,
    publisher: "X",
    datePublished,
    dateModified: null,
    coverImageUrl: imageList[0] || null,
    htmlContent: buildTweetHtml({
      author,
      handle,
      tweetText,
      datePublished,
      imageList,
    }),
    imageList,
    platform: X_ADAPTER_ID,
    rawExtraction: {
      tweetId,
      handle,
      source: jsonLd.text ? "json-ld" : "meta",
      imageList,
    },
    adapterVersion: X_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: X_IMAGE_REFERER,
  };
}

export function parseXSyndicationTweet(
  tweet: XSyndicationTweet,
  fallbackUrl: string,
): ExtractedContent {
  const parsed = parseStatusPath(fallbackUrl);
  const tweetId = tweet.id_str || parsed.tweetId;
  const handle = tweet.user?.screen_name || parsed.handle;
  const author = tweet.user?.name || handle;
  const tweetText = cleanSyndicationText(tweet);
  const datePublished = tweet.created_at || dateFromTweetId(tweetId);
  const imageList = [
    ...new Set(
      (tweet.mediaDetails || [])
        .map(mediaImageUrl)
        .filter((imageUrl): imageUrl is string => !!imageUrl),
    ),
  ];
  const title =
    tweetText && author
      ? `${author}: ${tweetText.slice(0, 80)}${tweetText.length > 80 ? "..." : ""}`
      : author
        ? `${author} on X`
        : null;

  if (!tweetText && !title) {
    throw new Error(
      "X/Twitter syndication response did not contain tweet text",
    );
  }

  return {
    title,
    description: tweetText || null,
    author,
    publisher: "X",
    datePublished,
    dateModified: null,
    coverImageUrl: imageList[0] || null,
    htmlContent: buildTweetHtml({
      author,
      handle,
      tweetText,
      datePublished,
      imageList,
    }),
    imageList,
    platform: X_ADAPTER_ID,
    rawExtraction: {
      tweetId,
      handle,
      source: "syndication",
      imageList,
      mediaCount: tweet.mediaDetails?.length || 0,
    },
    adapterVersion: X_ADAPTER_VERSION,
    statusCode: 200,
    url: `https://x.com/${handle}/status/${tweetId}`,
    imageReferer: X_IMAGE_REFERER,
  };
}

export function parseXRestrictedTweet(
  fallbackUrl: string,
  reason: string,
): ExtractedContent {
  const { handle, tweetId } = parseStatusPath(fallbackUrl);
  const author = `@${handle}`;
  const datePublished = dateFromTweetId(tweetId);
  const description =
    "X restricted this post. It may require login, age verification, content settings, or permission to view the original media.";

  return {
    title: `${author} on X`,
    description,
    author,
    publisher: "X",
    datePublished,
    dateModified: null,
    coverImageUrl: null,
    htmlContent: buildTweetHtml({
      author,
      handle,
      tweetText: description,
      datePublished,
      imageList: [],
    }),
    imageList: [],
    platform: X_ADAPTER_ID,
    rawExtraction: {
      tweetId,
      handle,
      source: "restricted",
      restricted: true,
      restrictedReason: reason,
      imageList: [],
    },
    adapterVersion: X_ADAPTER_VERSION,
    statusCode: 200,
    url: `https://x.com/${handle}/status/${tweetId}`,
    imageReferer: X_IMAGE_REFERER,
  };
}

async function extractFromSyndication({
  url,
  abortSignal,
  runProxy,
}: XFetchInput): Promise<ExtractedContent> {
  const { tweetId } = parseStatusPath(url);
  const response = await fetchWithProxy(
    buildSyndicationUrl(tweetId),
    {
      signal: abortSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        Referer: X_IMAGE_REFERER,
      },
    },
    runProxy,
  );
  if (!response.ok) {
    throw new Error(`X/Twitter syndication fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as XSyndicationTweet;
  if (body.__typename === "TweetTombstone") {
    return parseXRestrictedTweet(
      url,
      "X/Twitter syndication response is a tombstone",
    );
  }
  if (!body.id_str && !body.text) {
    throw new Error(
      "X/Twitter syndication response did not contain tweet data",
    );
  }
  return parseXSyndicationTweet(body, url);
}

export function parseXOEmbed(
  response: XOEmbedResponse,
  fallbackUrl: string,
): ExtractedContent {
  if (response.error) {
    throw new Error(`X/Twitter oEmbed failed: ${response.error}`);
  }
  if (!response.html) {
    throw new Error("X/Twitter oEmbed response did not contain HTML");
  }

  const url = response.url || fallbackUrl;
  const { handle, tweetId } = parseStatusPath(url);
  const dom = new JSDOM(response.html, { url });
  const { document } = dom.window;
  const tweetText = document.querySelector("blockquote p")
    ? textWithLineBreaks(document.querySelector("blockquote p")!)
    : null;
  const author = response.author_name?.trim() || handle;
  const datePublished = dateFromTweetId(tweetId);
  const title =
    tweetText && author
      ? `${author}: ${tweetText.slice(0, 80)}${tweetText.length > 80 ? "..." : ""}`
      : author
        ? `${author} on X`
        : null;

  if (!tweetText && !title) {
    throw new Error("X/Twitter oEmbed response did not contain tweet text");
  }

  return {
    title,
    description: tweetText,
    author,
    publisher: "X",
    datePublished,
    dateModified: null,
    coverImageUrl: null,
    htmlContent: buildTweetHtml({
      author,
      handle,
      tweetText,
      datePublished,
      imageList: [],
    }),
    imageList: [],
    platform: X_ADAPTER_ID,
    rawExtraction: {
      tweetId,
      handle,
      source: "oembed",
      providerName: response.provider_name || null,
      authorUrl: response.author_url || null,
      imageList: [],
    },
    adapterVersion: X_ADAPTER_VERSION,
    statusCode: 200,
    url,
    imageReferer: X_IMAGE_REFERER,
  };
}

async function extractFromOEmbed({
  url,
  abortSignal,
  runProxy,
}: XFetchInput): Promise<ExtractedContent> {
  const endpoint = new URL(X_OEMBED_ENDPOINT);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("omit_script", "true");
  endpoint.searchParams.set("dnt", "true");
  const response = await fetchWithProxy(
    endpoint.toString(),
    {
      signal: abortSignal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json,text/plain,*/*",
        Referer: X_IMAGE_REFERER,
      },
    },
    runProxy,
  );
  const body = (await response.json()) as XOEmbedResponse;
  if (!response.ok) {
    throw new Error(
      `X/Twitter oEmbed fetch failed: ${response.status} ${body.error || ""}`.trim(),
    );
  }
  return parseXOEmbed(body, url);
}

export const xAdapter: PlatformAdapter = {
  id: X_ADAPTER_ID,
  version: X_ADAPTER_VERSION,
  priority: 90,
  match(url: URL) {
    return X_HOSTS.has(url.hostname) && STATUS_PATH_PATTERN.test(url.pathname);
  },
  async extract({
    url,
    abortSignal,
    runProxy,
  }: AdapterExtractInput): Promise<ExtractedContent> {
    try {
      const response = await fetchWithProxy(
        url,
        {
          signal: abortSignal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            Referer: X_IMAGE_REFERER,
          },
        },
        runProxy,
      );
      if (!response.ok) {
        throw new Error(`X/Twitter adapter fetch failed: ${response.status}`);
      }
      const html = await response.text();
      return {
        ...parseXStatusHtml(html, response.url || url),
        statusCode: response.status,
        url: response.url || url,
      };
    } catch (error) {
      try {
        return await extractFromSyndication({ url, abortSignal, runProxy });
      } catch (syndicationError) {
        try {
          return await extractFromOEmbed({ url, abortSignal, runProxy });
        } catch (fallbackError) {
          const primaryMessage =
            error instanceof Error ? error.message : String(error);
          const syndicationMessage =
            syndicationError instanceof Error
              ? syndicationError.message
              : String(syndicationError);
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          throw new Error(
            `X/Twitter adapter failed: ${primaryMessage}; syndication fallback failed: ${syndicationMessage}; oEmbed fallback failed: ${fallbackMessage}`,
          );
        }
      }
    }
  },
};
