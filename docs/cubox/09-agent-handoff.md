# Cubox 化开发交接说明

> 面向后续接手本项目的子 agent。本文记录项目目标、已完成进度、下一阶段建议、关键代码入口和验证要求。

## 1. 项目目标

本阶段目标是在 Karakeep 现有书签、抓取、AI 推理、搜索和资产存储体系上，逐步补齐 Cubox 类产品体验：

- 中国/社交平台内容可稳定抓取：微信公众号、X、抖音、小红书。
- 抓取优先走平台适配器，失败时回退 Karakeep 原有通用抓取链路。
- 平台正文、封面、正文图片进入 Karakeep 资产体系，预览和阅读尽量不依赖原站图片热链。
- 中文内容有更好的 AI 自动标签。
- 后续补齐语义检索，让收藏内容可按语义召回。

总体原则：

- 最小侵入主链路，只在必要路由点扩展。
- 适配器放 worker 侧，避免把正文清洗、媒体转存、失败降级塞进 metascraper metadata plugin。
- 所有 AI 调用必须走 `packages/shared/inference.ts`。
- 所有 schema 改动必须走 Drizzle migration。
- 不提交本地 API key、cookie、`.env` 或用户私有数据。

## 2. 当前分支和发布状态

当前实现分支：

- 本地分支：`codex/cubox-m1-m2`
- fork 分支：`lichengtao97/karakeep:codex/cubox-m1-m2`
- Draft PR：`https://github.com/karakeep-app/karakeep/pull/2775`
- 已提交 commit：`31dc3fbc Add Cubox platform adapters and Chinese tagging`

当前本地仍有未纳入 PR 的用户资料：

- `docs/cubox/`：用户提供和后续新增的设计/交接文档目录。
- `apps/web/lib/i18n/locales/zh/translation.json`：用户既有未提交改动，不属于 Cubox M1/M2 代码实现。

后续 agent 不要默认 revert 或覆盖这些文件。

## 3. 已完成范围

### M1：适配器底座 + 微信公众号适配器

已完成：

- 新增 worker 侧平台适配器目录：`apps/workers/workers/adapters/`。
- 新增适配器 registry，支持按 URL 命中、按 priority 排序。
- 新增微信公众号适配器：
  - 命中 `mp.weixin.qq.com/s/*` 和 `mp.weixin.qq.com/s?*`。
  - HTTP 拉取 HTML，不强依赖浏览器。
  - 抽取 `#activity-name`、`#js_name`、`#publish_time`、`#js_content`。
  - OG title/description/image 作为兜底。
  - 清理正文 script/style/iframe/on* 事件属性。
- 在 `crawlAndParseUrl` 前置一个适配器路由点：
  - 命中适配器则优先用适配器结果。
  - 适配器失败记录日志和 metric，然后回退通用抓取。
  - 未命中适配器完全保留原逻辑。
- 新增统一抽取结果结构 `ExtractedContent`。
- 微信正文图片同步转存到 assetdb：
  - 下载请求带 `Referer: https://mp.weixin.qq.com/`。
  - 正文 HTML 中图片改写为 `/api/assets/{assetId}`。
  - 图片下载失败保留原 URL，不使 bookmark 整体失败。
- 微信封面图使用同一套带 Referer 下载逻辑。
- 新增 asset type：`LINK_INLINE_IMAGE`。
- 数据库扩展：
  - `bookmarkLinks.platform`
  - `bookmarkLinks.rawExtraction`
  - `bookmarkLinks.adapterVersion`
  - `adapterExtractionLog`
- 新增 adapter 指标：
  - `adapterExtractionCounter`
  - `adapterExtractionLatencyHistogram`
- 新增配置：
  - `ADAPTER_TIMEOUT_MS`
  - `ADAPTER_DEFAULT_RATE_LIMIT`
- 优化 worker 启动速度：
  - adblocker 改为真正需要 Playwright 页面时 lazy load。
  - 微信适配器 HTTP 抓取不再被 adblocker 初始化拖慢。

关键文件：

- `apps/workers/workers/adapters/types.ts`
- `apps/workers/workers/adapters/registry.ts`
- `apps/workers/workers/adapters/wechat.ts`
- `apps/workers/workers/crawlerWorker.ts`
- `apps/workers/metrics.ts`
- `packages/db/schema.ts`
- `packages/db/drizzle/0085_loving_sir_ram.sql`
- `packages/shared/config.ts`
- `.env.sample`
- `docs/docs/03-configuration/01-environment-variables.md`

### M2：中文 AI 打标增强

已完成：

- 新增中文文本打标 prompt。
- 触发条件：
  - `INFERENCE_LANG` / 用户设置为 `zh`、`zh-cn`、`zh-hans`、`chinese`、`中文`。
  - 或平台为 `wechat`、`weixin`、`xhs`、`xiaohongshu`、`douyin`。
- 将平台元数据注入 prompt：
  - `platform`
  - `author`
  - `publisher`
  - `rawExtraction` 中的受控摘要字段，例如 `imageCount`、`hasContentElement`
- 图片打标 prompt 支持注入已有 OCR 文本 `imageOcrText`。
- 新增中文标签同义词归一化，覆盖 30+ 高频组：
  - `AI` / `人工智能` / `机器学习` -> `人工智能`
  - `LLM` / `大模型` -> `大语言模型`
  - `Open Source` / `开源` -> `开源`
  - `Startup` / `创业` -> `创业`
- 中文内容或中国平台内容完成推理后会执行标签归一化。

关键文件：

- `packages/shared/prompts.ts`
- `packages/shared/prompts.server.ts`
- `packages/shared/prompts.test.ts`
- `apps/workers/workers/inference/tagging.ts`
- `apps/workers/workers/inference/tagNormalization.ts`
- `apps/workers/workers/inference/tagNormalization.test.ts`

## 4. 本地验证记录

已通过的聚焦验证：

```bash
npx pnpm@9.15.9 --filter @karakeep/workers run format
npx pnpm@9.15.9 --filter @karakeep/workers run lint
npx pnpm@9.15.9 --filter @karakeep/workers run typecheck
npx pnpm@9.15.9 --filter @karakeep/workers run test

npx pnpm@9.15.9 --filter @karakeep/shared run format
npx pnpm@9.15.9 --filter @karakeep/shared run lint
npx pnpm@9.15.9 --filter @karakeep/shared run typecheck
npx pnpm@9.15.9 --filter @karakeep/shared run test

npx pnpm@9.15.9 --filter @karakeep/db run typecheck
npx pnpm@9.15.9 --filter @karakeep/trpc run typecheck
```

已做过的手工验证：

- 本地启动 web + workers。
- 添加微信公众号文章。
- 验证 adapter 命中 `wechat`。
- 验证封面和正文图进入 assetdb。
- 验证正文 HTML 图片 URL 改写为 `/api/assets/{assetId}`。
- 验证 `bookmarkLinks.platform/rawExtraction/adapterVersion` 写入。
- 验证 `adapterExtractionLog` 写入成功记录。
- 接入 OpenAI 兼容的智谱端点后，验证 AI 标签可写入。

已知全量验证限制：

- 本地 root `pnpm typecheck` 曾被 `apps/landing` 阻塞，因为 Astro 要求 Node `>=22.12.0`，当前 shell 是 Node `20.17.0`。
- Docker 未运行时，Meilisearch/Chrome 相关回归不能完整覆盖。
- Search 当前本地未配置时，worker 日志会显示 `Search is not configured, nothing to do now`。

## 5. 本地运行参考

开发时使用的本地数据目录：

```bash
DATA_DIR=/tmp/karakeep-dev-data
```

web：

```bash
DATA_DIR=/tmp/karakeep-dev-data \
NEXTAUTH_SECRET=dev-secret \
NEXTAUTH_URL=http://localhost:3000 \
API_URL=http://localhost:3000 \
NO_COLOR=false \
npx pnpm@9.15.9 --filter @karakeep/web run dev
```

workers：

```bash
DATA_DIR=/tmp/karakeep-dev-data \
NEXTAUTH_SECRET=dev-secret \
NEXTAUTH_URL=http://localhost:3000 \
API_URL=http://localhost:3000 \
NO_COLOR=false \
npx pnpm@9.15.9 --filter @karakeep/workers run start
```

如果需要验证 AI 打标，可使用 OpenAI 兼容 provider。不要把 key 写进仓库文件。运行时环境变量示例：

```bash
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
INFERENCE_TEXT_MODEL=glm-4.7
INFERENCE_IMAGE_MODEL=glm-4.6v
INFERENCE_OUTPUT_SCHEMA=json
INFERENCE_LANG=zh
INFERENCE_MAX_OUTPUT_TOKENS=8192
INFERENCE_JOB_TIMEOUT_SEC=120
```

## 6. 后续阶段建议

### M3：X / Twitter 适配器与平台预览闭环

已完成：

- 新增 X/Twitter 平台适配器。
- 命中：
  - `x.com/*/status/*`
  - `twitter.com/*/status/*`
  - `mobile.twitter.com/*/status/*`
  - `twitter.com/*/statuses/*`
- 支持从公开 HTML 中抽取：
  - tweet 文本
  - 作者
  - 媒体图片
  - `tweetId`
  - `handle`
- 支持解析 Open Graph / Twitter meta 和 JSON-LD。
- 使用 tweet Snowflake ID 兜底推算发布时间。
- 将 tweet 内容构造成 Karakeep 可缓存的 HTML，正文图片继续复用 crawler 的 assetdb 转存与 `/api/assets/{assetId}` 改写链路。
- 失败时沿用平台适配器框架回退 Karakeep 通用抓取链路。
- 不引入登录/cookie 支持；凭据架构仍留给小红书等后续阶段。
- 将平台提取元数据暴露给 bookmark link API / tRPC：
  - `content.platform`
  - `content.rawExtraction`
  - `content.adapterVersion`
- 新增前端 `Platform Capture` 预览：
  - 当 bookmark 存在 `content.platform` 时优先出现。
  - 默认展示 Karakeep 缓存/转存后的正文与图片。
  - X 原有 `react-tweet` 远程 embed 保留为可选对比视图。
- 增强 Admin Bookmark Debugger：
  - 展示 `platform/rawExtraction/adapterVersion`。
  - 展示最近 10 条 `adapterExtractionLog`，含 adapter、version、latency、success/failure、error、createdAt。

关键文件：

- `apps/workers/workers/adapters/x.ts`
- `apps/workers/workers/adapters/x.test.ts`
- `apps/workers/workers/adapters/registry.ts`
- `packages/shared/types/bookmarks.ts`
- `packages/trpc/models/bookmarks.ts`
- `packages/trpc/routers/bookmarks.test.ts`
- `apps/web/components/dashboard/preview/content-renderers/PlatformCaptureRenderer.tsx`
- `apps/web/components/dashboard/preview/content-renderers/index.ts`
- `apps/web/components/admin/BookmarkDebugger.tsx`
- `packages/trpc/routers/admin.ts`
- `packages/trpc/routers/admin.test.ts`

验证记录：

- `env -u NO_COLOR corepack pnpm --filter @karakeep/workers exec vitest run workers/adapters`
- `env -u NO_COLOR corepack pnpm --filter @karakeep/trpc exec vitest run routers/admin.test.ts routers/bookmarks.test.ts`
- `corepack pnpm --filter @karakeep/shared run typecheck`
- `corepack pnpm --filter @karakeep/trpc run typecheck`
- `corepack pnpm --filter @karakeep/web run typecheck`
- `corepack pnpm --filter @karakeep/workers run typecheck`
- 相关 lint 和 oxfmt check 已通过。

### M4：抖音适配器

已完成：

- 新增抖音平台适配器。
- 命中：
  - `v.douyin.com/*`
  - `iesdouyin.com/share/(video|note|slides)/*`
  - `www.iesdouyin.com/share/(video|note|slides)/*`
  - `douyin.com/(video|note)/*`
  - `www.douyin.com/(video|note)/*`
  - `www.douyin.com/discover?modal_id=*`
- 支持从公开页面中抽取：
  - 标题/正文描述
  - 作者
  - 发布时间
  - 封面
  - 图文/图集图片
  - BGM 标题摘要
- 支持解析：
  - URL 编码的 `<script id="RENDER_DATA">`
  - `window._ROUTER_DATA` 等 hydration JSON
  - JSON-LD
  - Open Graph / Twitter meta fallback
- 将抖音内容构造成 Karakeep 可缓存的 HTML，封面和正文图片继续复用 crawler 的 assetdb 转存与 `/api/assets/{assetId}` 改写链路。
- 视频只记录是否存在公开播放地址和数量摘要，不在 adapter 内做大文件下载；视频下载继续留给现有 video worker / yt-dlp 链路。
- 不引入登录/cookie 支持，不新增独立浏览器池；失败时沿用平台适配器框架回退 Karakeep 通用抓取链路。

关键文件：

- `apps/workers/workers/adapters/douyin.ts`
- `apps/workers/workers/adapters/douyin.test.ts`
- `apps/workers/workers/adapters/registry.ts`
- `apps/workers/workers/adapters/registry.test.ts`

验证记录：

- `env -u NO_COLOR corepack pnpm --filter @karakeep/workers exec vitest run workers/adapters`
- `corepack pnpm --filter @karakeep/workers run typecheck`
- `corepack pnpm --filter @karakeep/workers run lint`
- `corepack pnpm exec oxfmt --check apps/workers/workers/adapters/registry.ts apps/workers/workers/adapters/registry.test.ts apps/workers/workers/adapters/douyin.ts apps/workers/workers/adapters/douyin.test.ts docs/cubox/09-agent-handoff.md`

风险：

- 短链跳转、反爬、移动端 HTML 差异仍可能导致部分真实页面只能走 fallback。
- Douyin hydration JSON 字段可能变化，解析层已做多字段容错，但后续需要用真实黄金集持续补 fixture。
- 超时和失败降级沿用现有适配器框架；后续仍需要用真实站点压测确认阈值。

### M5：小红书适配器

已完成：

- 新增小红书平台适配器。
- 命中：
  - `xhslink.com/*`
  - `www.xiaohongshu.com/explore/*`
  - `m.xiaohongshu.com/discovery/item/*`
- 支持从公开页面中抽取：
  - 笔记标题
  - 正文描述
  - 作者
  - 发布时间
  - 话题标签
  - 封面和图集图片
  - 视频笔记是否存在视频地址摘要
- 支持解析：
  - `window.__INITIAL_STATE__`
  - Open Graph / Twitter meta fallback
- 将小红书内容构造成 Karakeep 可缓存的 HTML，图片继续复用 crawler assetdb 转存链路。
- 视频只记录是否存在公开视频地址，不在 adapter 内做大文件下载。
- 新增用户级平台凭据存储：
  - `platformCredentials` 表。
  - tRPC `platformCredentials.get/upsert/delete`。
  - cookie 使用 `NEXTAUTH_SECRET` 派生密钥加密存储。
  - 适配器按 `userId` 注入用户 cookie，未配置时回退 `XHS_USER_COOKIE`。
- 不把 cookie/API key 写入日志、fixture 或文档。

关键文件：

- `apps/workers/workers/adapters/xiaohongshu.ts`
- `apps/workers/workers/adapters/xiaohongshu.test.ts`
- `packages/shared/platformCredentials.ts`
- `packages/trpc/routers/platformCredentials.ts`
- `packages/trpc/routers/platformCredentials.test.ts`
- `packages/db/schema.ts`
- `packages/db/drizzle/0086_loose_shockwave.sql`

限制：

- 暂未新增设置页 UI；当前通过 tRPC/API 写入凭据，后续可补一个设置页表单。
- 未接 PC 签名 API，不做 `x-s` / `x-t`。

### M6：媒体异步管线

已完成：

- 新增 `asyncMediaDownloads` 表记录异步图片下载任务。
- 新增 `AsyncMediaDownloadQueue` 和 `asyncMediaDownload` worker。
- 新增配置 `ADAPTER_ASYNC_MEDIA_DOWNLOADS`：
  - 默认 `false`，保持现有同步转存行为稳定。
  - 开启后，平台 adapter 正文图片先保留原 URL 和 `data-karakeep-async-media="pending"`，主 crawl job 不等待图片下载。
  - 后台 worker 下载图片、写入 assetdb，并把 `bookmarkLinks.htmlContent` 中的图片 URL 改写为 `/api/assets/{assetId}`。
- 图片请求继续走 `fetchWithProxy`，保持 SSRF 校验和代理支持。
- 下载失败写入任务状态，不阻塞卡片和正文可见。

关键文件：

- `apps/workers/workers/asyncMediaDownloadWorker.ts`
- `apps/workers/workers/crawlerWorker.ts`
- `packages/shared-server/src/queues.ts`
- `packages/db/schema.ts`
- `packages/db/drizzle/0086_loose_shockwave.sql`

限制：

- 当前只异步处理 adapter 正文 inline images；banner 仍沿用现有同步下载路径。
- 大 HTML 已转存到 content asset 时，异步 worker 暂不改写 asset 内 HTML；默认配置仍保持同步路径避免这个边界影响现有体验。

### M7：语义检索

已完成：

- 复用既有 `packages/shared/inference.ts` embedding 接口：
  - OpenAI 走 `openAI.embeddings.create`。
  - Ollama 走 `ollama.embed`。
  - 没有绕过 inference provider 体系。
- 新增语义索引存储：
  - `bookmarkChunks`
  - `bookmarkEmbeddings`
- 新增 `SemanticIndexingQueue` 和 `semanticIndexing` worker：
  - `triggerSearchReindex` 会同步触发 BM25 index 和 semantic index。
  - bookmark 删除时同步 enqueue semantic delete。
  - chunk 策略为固定字符窗口 + overlap。
- 新增 `bookmarks.semanticSearchBookmarks` tRPC procedure：
  - query 先 embedding。
  - SQLite 中读取同模型 embeddings，应用层 cosine top-K。
  - 如果 Meilisearch 已配置，同时取 BM25 top-K。
  - 使用 RRF 融合后返回 bookmark 和命中 chunk。
- 向量存储使用 SQLite BLOB + Float32Array，暂不引入 `sqlite-vec` 扩展，避免新增部署依赖。

关键文件：

- `packages/shared/semanticSearch.ts`
- `packages/shared/semanticSearch.test.ts`
- `apps/workers/workers/semanticIndexingWorker.ts`
- `packages/trpc/routers/bookmarks.ts`
- `packages/shared-server/src/queues.ts`
- `packages/db/schema.ts`
- `packages/db/drizzle/0086_loose_shockwave.sql`

限制：

- 暂未新增前端智能搜索 toggle；当前先提供 tRPC procedure 供前端接入。
- 当前为 SQLite BLOB 应用层余弦，适合 MVP 和中小规模验证；10 万 chunks 级别建议继续评估 `sqlite-vec`。

## 7. Agent 开发规则

后续 agent 接手前必须做：

```bash
git status -sb
git branch --show-current
```

如果看到以下文件改动，不要默认处理，除非用户明确要求：

- `apps/web/lib/i18n/locales/zh/translation.json`
- `docs/cubox/*`

每个阶段的最小交付要求：

- 新适配器必须有 URL match 测试和 fixture 解析测试。
- 新数据库字段必须有 migration。
- 新 env 必须同步 `.env.sample`、`serverConfig`、配置文档。
- 新外部请求必须考虑 SSRF、防超时和失败降级。
- 新 AI 能力必须走 `packages/shared/inference.ts`。
- 不允许把用户 cookie/API key 写入日志、测试 fixture 或文档。

推荐验证顺序：

```bash
npx pnpm@9.15.9 --filter @karakeep/workers run format
npx pnpm@9.15.9 --filter @karakeep/workers run lint
npx pnpm@9.15.9 --filter @karakeep/workers run typecheck
npx pnpm@9.15.9 --filter @karakeep/workers run test
```

涉及共享包时追加：

```bash
npx pnpm@9.15.9 --filter @karakeep/shared run format
npx pnpm@9.15.9 --filter @karakeep/shared run lint
npx pnpm@9.15.9 --filter @karakeep/shared run typecheck
npx pnpm@9.15.9 --filter @karakeep/shared run test
```

涉及 DB/API 时追加：

```bash
npx pnpm@9.15.9 --filter @karakeep/db run typecheck
npx pnpm@9.15.9 --filter @karakeep/trpc run typecheck
```

## 8. 当前优先级建议

推荐下一位 agent 优先做：

1. 补前端入口：小红书凭据设置页和搜索框“全文 / 智能”切换。
2. 用真实黄金集验证小红书、抖音、微信长图文抓取质量和 P95。
3. 评估 `sqlite-vec` 替换当前 SQLite BLOB 应用层余弦方案的收益和迁移成本。

不建议立刻做：

- 大规模 UI 重构。
- 新增独立浏览器池或绕过现有 crawler Playwright 路径。
- 绕开现有 queue/inference/search 抽象的新基础设施。
