import { describe, expect, test } from "vitest";

import { findPlatformAdapter, platformAdapters } from "./registry";

describe("platform adapter registry", () => {
  test("matches WeChat article URLs", () => {
    expect(findPlatformAdapter("https://mp.weixin.qq.com/s/example")?.id).toBe(
      "wechat",
    );
    expect(
      findPlatformAdapter("https://mp.weixin.qq.com/s?__biz=test")?.id,
    ).toBe("wechat");
  });

  test("matches X/Twitter status URLs", () => {
    expect(findPlatformAdapter("https://x.com/example/status/123")?.id).toBe(
      "x",
    );
    expect(
      findPlatformAdapter("https://twitter.com/example/statuses/123")?.id,
    ).toBe("x");
    expect(
      findPlatformAdapter("https://mobile.twitter.com/example/status/123")?.id,
    ).toBe("x");
  });

  test("matches Douyin share, short, video, and note URLs", () => {
    expect(findPlatformAdapter("https://v.douyin.com/iABC123/")?.id).toBe(
      "douyin",
    );
    expect(
      findPlatformAdapter("https://www.iesdouyin.com/share/video/123/")?.id,
    ).toBe("douyin");
    expect(
      findPlatformAdapter("https://www.iesdouyin.com/share/slides/123/")?.id,
    ).toBe("douyin");
    expect(findPlatformAdapter("https://www.douyin.com/video/123")?.id).toBe(
      "douyin",
    );
    expect(findPlatformAdapter("https://www.douyin.com/note/123")?.id).toBe(
      "douyin",
    );
    expect(
      findPlatformAdapter("https://www.douyin.com/discover?modal_id=123")?.id,
    ).toBe("douyin");
  });

  test("matches Xiaohongshu short, explore, and discovery item URLs", () => {
    expect(findPlatformAdapter("https://xhslink.com/a/abc123")?.id).toBe(
      "xiaohongshu",
    );
    expect(
      findPlatformAdapter("https://www.xiaohongshu.com/explore/abc123")?.id,
    ).toBe("xiaohongshu");
    expect(
      findPlatformAdapter(
        "https://m.xiaohongshu.com/discovery/item/abc123?xsec_token=token",
      )?.id,
    ).toBe("xiaohongshu");
  });

  test("does not match generic URLs", () => {
    expect(findPlatformAdapter("https://example.com/s/example")).toBeNull();
    expect(findPlatformAdapter("https://x.com/example")).toBeNull();
    expect(
      findPlatformAdapter("https://www.douyin.com/user/example"),
    ).toBeNull();
    expect(
      findPlatformAdapter("https://www.xiaohongshu.com/user/profile/abc"),
    ).toBeNull();
  });

  test("keeps adapters sorted by priority", () => {
    const priorities = platformAdapters.map((adapter) => adapter.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
  });
});
