import { describe, expect, test } from "vitest";

import { DOUYIN_IMAGE_REFERER, parseDouyinHtml } from "./douyin";

describe("parseDouyinHtml", () => {
  test("extracts Douyin video metadata from encoded RENDER_DATA", () => {
    const renderData = encodeURIComponent(
      JSON.stringify({
        loaderData: {
          "video_7350000000000000000/page": {
            videoInfoRes: {
              item_list: [
                {
                  aweme_id: "7350000000000000000",
                  desc: "第一段视频文案\n\n第二段 #话题",
                  create_time: 1712448000,
                  author: {
                    nickname: "抖音作者",
                    unique_id: "douyin_author",
                  },
                  music: {
                    title: "示例 BGM",
                  },
                  video: {
                    cover: {
                      url_list: [
                        "https://p3-sign.douyinpic.com/video-cover.jpeg",
                      ],
                    },
                    play_addr: {
                      url_list: ["https://video.example.com/play.mp4"],
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    );

    const extracted = parseDouyinHtml(
      `
        <!doctype html>
        <html>
          <head>
            <script id="RENDER_DATA" type="application/json">${renderData}</script>
          </head>
        </html>
      `,
      "https://www.iesdouyin.com/share/video/7350000000000000000/",
    );

    expect(extracted).toMatchObject({
      title: "第一段视频文案\n\n第二段 #话题",
      description: "第一段视频文案\n\n第二段 #话题",
      author: "抖音作者",
      publisher: "Douyin",
      datePublished: "2024-04-07T00:00:00.000Z",
      coverImageUrl: "https://p3-sign.douyinpic.com/video-cover.jpeg",
      platform: "douyin",
      imageReferer: DOUYIN_IMAGE_REFERER,
    });
    expect(extracted.imageList).toEqual([
      "https://p3-sign.douyinpic.com/video-cover.jpeg",
    ]);
    expect(extracted.rawExtraction).toMatchObject({
      douyinId: "7350000000000000000",
      mediaType: "video",
      source: "hydration-json",
      musicTitle: "示例 BGM",
      hasVideoUrls: true,
      videoUrlCount: 1,
    });
    expect(extracted.htmlContent).toContain("<strong>抖音作者</strong>");
    expect(extracted.htmlContent).toContain(
      'src="https://p3-sign.douyinpic.com/video-cover.jpeg"',
    );
    expect(extracted.htmlContent).not.toContain("video.example.com");
  });

  test("extracts Douyin image post metadata and gallery images", () => {
    const extracted = parseDouyinHtml(
      `
        <html>
          <head>
            <script>
              window._ROUTER_DATA = {
                "loaderData": {
                  "note_7350000000000000001/page": {
                    "aweme": {
                      "aweme_id": "7350000000000000001",
                      "title": "图文标题",
                      "desc": "图文正文",
                      "create_time": "1712524800",
                      "author": { "nickname": "图文作者" },
                      "image_post_info": {
                        "images": [
                          {
                            "display_image": {
                              "url_list": ["/image-one.webp"]
                            }
                          },
                          {
                            "display_image": {
                              "url_list": ["https://p6.douyinpic.com/image-two.webp"]
                            }
                          }
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
      "https://www.douyin.com/note/7350000000000000001",
    );

    expect(extracted).toMatchObject({
      title: "图文标题",
      description: "图文正文",
      author: "图文作者",
      coverImageUrl: "https://www.douyin.com/image-one.webp",
    });
    expect(extracted.imageList).toEqual([
      "https://www.douyin.com/image-one.webp",
      "https://p6.douyinpic.com/image-two.webp",
    ]);
    expect(extracted.rawExtraction).toMatchObject({
      douyinId: "7350000000000000001",
      mediaType: "image",
      source: "hydration-json",
    });
  });

  test("falls back to open graph metadata", () => {
    const extracted = parseDouyinHtml(
      `
        <html>
          <head>
            <title>Fallback title - 抖音</title>
            <meta property="og:description" content="OG 描述" />
            <meta property="og:image" content="/cover.jpeg" />
          </head>
        </html>
      `,
      "https://www.douyin.com/video/7350000000000000002",
    );

    expect(extracted).toMatchObject({
      title: "Fallback title",
      description: "OG 描述",
      coverImageUrl: "https://www.douyin.com/cover.jpeg",
      publisher: "Douyin",
    });
    expect(extracted.rawExtraction).toMatchObject({
      mediaType: "unknown",
      source: "meta",
      hasVideoUrls: false,
    });
  });
});
