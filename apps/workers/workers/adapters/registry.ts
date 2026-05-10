import { douyinAdapter } from "./douyin";
import { xAdapter } from "./x";
import { xiaohongshuAdapter } from "./xiaohongshu";
import { wechatAdapter } from "./wechat";

import type { PlatformAdapter } from "./types";

export const platformAdapters: PlatformAdapter[] = [
  wechatAdapter,
  xAdapter,
  douyinAdapter,
  xiaohongshuAdapter,
].sort((a, b) => b.priority - a.priority);

export function findPlatformAdapter(url: string): PlatformAdapter | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  return platformAdapters.find((adapter) => adapter.match(parsed)) ?? null;
}
