import { describe, expect, test } from "vitest";

import {
  parseXOEmbed,
  parseXRestrictedTweet,
  parseXStatusHtml,
  parseXSyndicationTweet,
  X_IMAGE_REFERER,
} from "./x";

describe("parseXStatusHtml", () => {
  test("extracts X metadata from open graph tags", () => {
    const extracted = parseXStatusHtml(
      `
        <!doctype html>
        <html>
          <head>
            <title>Fallback title / X</title>
            <meta property="og:title" content="Example User on X: &quot;第一段内容&#10;&#10;第二段内容&quot;" />
            <meta property="og:description" content="第一段内容&#10;&#10;第二段内容" />
            <meta property="og:image" content="https://pbs.twimg.com/media/example-one.jpg" />
            <meta name="twitter:image" content="https://pbs.twimg.com/media/example-two.jpg" />
          </head>
          <body></body>
        </html>
      `,
      "https://x.com/example/status/1796912526641512791",
    );

    expect(extracted).toMatchObject({
      title: "Example User: 第一段内容\n\n第二段内容",
      description: "第一段内容\n\n第二段内容",
      author: "Example User",
      publisher: "X",
      datePublished: "2024-06-01T14:31:46.028Z",
      coverImageUrl: "https://pbs.twimg.com/media/example-one.jpg",
      platform: "x",
      imageReferer: X_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://pbs.twimg.com/media/example-one.jpg",
      "https://pbs.twimg.com/media/example-two.jpg",
    ]);
    expect(extracted.htmlContent).toContain("<strong>Example User</strong>");
    expect(extracted.htmlContent).toContain("<span>@example</span>");
    expect(extracted.htmlContent).toContain(
      'src="https://pbs.twimg.com/media/example-one.jpg"',
    );
  });

  test("prefers JSON-LD status content when present", () => {
    const extracted = parseXStatusHtml(
      `
        <html>
          <head>
            <meta property="og:title" content="Meta User on X: &quot;Meta text&quot;" />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "SocialMediaPosting",
                "articleBody": "JSON-LD tweet text",
                "datePublished": "2026-05-09T01:02:03.000Z",
                "author": { "@type": "Person", "name": "JSON User" },
                "image": [{ "url": "/json-image.jpg" }]
              }
            </script>
          </head>
        </html>
      `,
      "https://twitter.com/json_user/status/1796912526641512791",
    );

    expect(extracted).toMatchObject({
      title: "JSON User: JSON-LD tweet text",
      description: "JSON-LD tweet text",
      author: "JSON User",
      datePublished: "2026-05-09T01:02:03.000Z",
      coverImageUrl: "https://twitter.com/json-image.jpg",
    });
    expect(extracted.rawExtraction).toMatchObject({
      tweetId: "1796912526641512791",
      handle: "json_user",
      source: "json-ld",
    });
  });

  test("extracts tweet text from oEmbed fallback HTML", () => {
    const extracted = parseXOEmbed(
      {
        url: "https://twitter.com/DtDt666/status/2052307717306429870",
        author_name: "看不懂的SOL",
        author_url: "https://twitter.com/DtDt666",
        provider_name: "Twitter",
        html: `<blockquote class="twitter-tweet"><p lang="zh" dir="ltr">第一行<br><br>第二行 <a href="https://t.co/example">pic.twitter.com/example</a></p>&mdash; 看不懂的SOL (@DtDt666) <a href="https://twitter.com/DtDt666/status/2052307717306429870?ref_src=twsrc%5Etfw">May 7, 2026</a></blockquote>`,
      },
      "https://x.com/dtdt666/status/2052307717306429870?s=46",
    );

    expect(extracted).toMatchObject({
      title: "看不懂的SOL: 第一行\n\n第二行 pic.twitter.com/example",
      description: "第一行\n\n第二行 pic.twitter.com/example",
      author: "看不懂的SOL",
      publisher: "X",
      platform: "x",
      imageReferer: X_IMAGE_REFERER,
    });
    expect(extracted.htmlContent).toContain("<strong>看不懂的SOL</strong>");
    expect(extracted.htmlContent).toContain("<span>@DtDt666</span>");
    expect(extracted.rawExtraction).toMatchObject({
      tweetId: "2052307717306429870",
      handle: "DtDt666",
      source: "oembed",
      providerName: "Twitter",
    });
  });

  test("extracts media from syndication fallback data", () => {
    const extracted = parseXSyndicationTweet(
      {
        __typename: "Tweet",
        id_str: "2052916806650884468",
        text: "卧槽，我的AI终于给我赚钱了\n\nCodex + Opus 无敌了 https://t.co/c9aONOvMmZ",
        created_at: "2026-05-09T01:01:22.000Z",
        user: {
          name: "比特币橙子Trader",
          screen_name: "oragnes",
        },
        entities: {
          media: [
            {
              url: "https://t.co/c9aONOvMmZ",
              display_url: "pic.x.com/c9aONOvMmZ",
              expanded_url:
                "https://x.com/oragnes/status/2052916806650884468/photo/1",
              indices: [33, 56],
            },
          ],
        },
        mediaDetails: [
          {
            type: "photo",
            media_url_https: "https://pbs.twimg.com/media/HH1s2oBbwAAc-1-.png",
          },
        ],
      },
      "https://x.com/oragnes/status/2052916806650884468?s=20",
    );

    expect(extracted).toMatchObject({
      title:
        "比特币橙子Trader: 卧槽，我的AI终于给我赚钱了\n\nCodex + Opus 无敌了",
      description: "卧槽，我的AI终于给我赚钱了\n\nCodex + Opus 无敌了",
      author: "比特币橙子Trader",
      publisher: "X",
      datePublished: "2026-05-09T01:01:22.000Z",
      coverImageUrl:
        "https://pbs.twimg.com/media/HH1s2oBbwAAc-1-?format=png&name=large",
      platform: "x",
      imageReferer: X_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://pbs.twimg.com/media/HH1s2oBbwAAc-1-?format=png&name=large",
    ]);
    expect(extracted.htmlContent).toContain(
      'src="https://pbs.twimg.com/media/HH1s2oBbwAAc-1-?format=png&amp;name=large"',
    );
    expect(extracted.rawExtraction).toMatchObject({
      tweetId: "2052916806650884468",
      handle: "oragnes",
      source: "syndication",
      mediaCount: 1,
    });
  });

  test("keeps X tombstones as restricted platform captures without warning images", () => {
    const extracted = parseXRestrictedTweet(
      "https://x.com/buonbella/status/2050207702773538903?s=20",
      "X/Twitter syndication response is a tombstone",
    );

    expect(extracted).toMatchObject({
      title: "@buonbella on X",
      author: "@buonbella",
      publisher: "X",
      datePublished: "2026-05-01T13:36:22.015Z",
      coverImageUrl: null,
      platform: "x",
      imageReferer: X_IMAGE_REFERER,
    });
    expect(extracted.description).toContain("X restricted this post");
    expect(extracted.imageList).toEqual([]);
    expect(extracted.htmlContent).toContain("X restricted this post");
    expect(extracted.rawExtraction).toMatchObject({
      tweetId: "2050207702773538903",
      handle: "buonbella",
      source: "restricted",
      restricted: true,
      restrictedReason: "X/Twitter syndication response is a tombstone",
      imageList: [],
    });
  });
});
