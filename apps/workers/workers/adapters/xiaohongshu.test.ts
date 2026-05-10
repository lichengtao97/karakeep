import { describe, expect, test } from "vitest";

import { parseXhsHtml, XHS_IMAGE_REFERER } from "./xiaohongshu";

describe("parseXhsHtml", () => {
  test("extracts Xiaohongshu note metadata from INITIAL_STATE", () => {
    const extracted = parseXhsHtml(
      `
        <html>
          <head>
            <script>
              window.__INITIAL_STATE__ = {
                "note": {
                  "noteDetailMap": {
                    "64f000000000000000000001": {
                      "note": {
                        "noteId": "64f000000000000000000001",
                        "title": "小红书标题",
                        "desc": "第一段正文\\n\\n第二段正文",
                        "time": 1712448000000,
                        "type": "normal",
                        "user": { "nickname": "小红书作者" },
                        "tagList": [{ "name": "旅行" }, { "name": "咖啡" }],
                        "imageList": [
                          { "urlDefault": "https://sns-img-qc.xhscdn.com/image-one.webp" },
                          { "urlDefault": "/image-two.webp" }
                        ]
                      }
                    }
                  }
                }
              };
            </script>
          </head>
        </html>
      `,
      "https://www.xiaohongshu.com/explore/64f000000000000000000001?xsec_token=token",
    );

    expect(extracted).toMatchObject({
      title: "小红书标题",
      description: "第一段正文\n\n第二段正文",
      author: "小红书作者",
      publisher: "Xiaohongshu",
      datePublished: "2024-04-07T00:00:00.000Z",
      coverImageUrl: "https://sns-img-qc.xhscdn.com/image-one.webp",
      platform: "xiaohongshu",
      imageReferer: XHS_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://sns-img-qc.xhscdn.com/image-one.webp",
      "https://www.xiaohongshu.com/image-two.webp",
    ]);
    expect(extracted.rawExtraction).toMatchObject({
      noteId: "64f000000000000000000001",
      mediaType: "normal",
      source: "initial-state",
      tags: ["旅行", "咖啡"],
      hasVideoUrl: false,
    });
    expect(extracted.htmlContent).toContain("<strong>小红书作者</strong>");
    expect(extracted.htmlContent).toContain("#旅行 #咖啡");
  });

  test("extracts video note summary without embedding video downloads", () => {
    const extracted = parseXhsHtml(
      `
        <script>
          window.__INITIAL_STATE__ = {
            "note": {
              "noteDetailMap": {
                "video-note": {
                  "note": {
                    "id": "video-note",
                    "title": "视频笔记",
                    "desc": "视频正文",
                    "type": "video",
                    "userInfo": { "nickname": "视频作者" },
                    "imageList": [{ "urlDefault": "https://sns-img.xhscdn.com/cover.webp" }],
                    "video": {
                      "media": {
                        "stream": {
                          "h264": [{ "masterUrl": "https://video.example.com/master.mp4" }]
                        }
                      }
                    }
                  }
                }
              }
            }
          };
        </script>
      `,
      "https://www.xiaohongshu.com/explore/video-note",
    );

    expect(extracted.rawExtraction).toMatchObject({
      mediaType: "video",
      hasVideoUrl: true,
    });
    expect(extracted.htmlContent).not.toContain("video.example.com");
  });

  test("falls back to open graph metadata", () => {
    const extracted = parseXhsHtml(
      `
        <html>
          <head>
            <title>Fallback note</title>
            <meta property="og:description" content="OG desc" />
            <meta property="og:image" content="/cover.webp" />
          </head>
        </html>
      `,
      "https://www.xiaohongshu.com/explore/fallback",
    );

    expect(extracted).toMatchObject({
      title: "Fallback note",
      description: "OG desc",
      coverImageUrl: "https://www.xiaohongshu.com/cover.webp",
      publisher: "Xiaohongshu",
    });
    expect(extracted.rawExtraction).toMatchObject({
      source: "meta",
      mediaType: "unknown",
    });
  });
});
