"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Archive, BookOpen, CheckCircle2, Star } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import type { zUserStatsResponseSchema } from "@karakeep/shared/types/users";
import type { z } from "zod";

type UserStats = z.infer<typeof zUserStatsResponseSchema>;

const statCards = [
  {
    label: "全部文章",
    key: "numBookmarks",
    icon: BookOpen,
    className: "text-blue-600",
  },
  {
    label: "稍后读",
    key: "bookmarksByType.link",
    icon: Archive,
    className: "text-orange-500",
  },
  {
    label: "已读",
    key: "bookmarksByType.text",
    icon: CheckCircle2,
    className: "text-emerald-500",
  },
  {
    label: "高亮",
    key: "numHighlights",
    icon: Star,
    className: "text-orange-400",
  },
] as const;

function statValue(stats: UserStats, key: (typeof statCards)[number]["key"]) {
  if (key === "bookmarksByType.link") return stats.bookmarksByType.link;
  if (key === "bookmarksByType.text") return stats.bookmarksByType.text;
  return stats[key];
}

export default function DashboardSidebarInsights() {
  const api = useTRPC();
  const { data: stats } = useQuery({
    ...api.users.stats.queryOptions(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: tags } = useQuery({
    ...api.tags.list.queryOptions({ limit: 6, sortBy: "usage" }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="mt-auto space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-700">阅读统计</p>
        <div className="grid grid-cols-2 gap-2">
          {statCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-lg border border-slate-100 bg-white p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={item.className} size={20} />
                  <span className="text-lg font-semibold text-slate-950">
                    {stats ? statValue(stats, item.key) : "-"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{item.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-slate-700">最近标签</p>
        <div className="space-y-2">
          {tags?.tags.slice(0, 6).map((tag) => (
            <Link
              key={tag.id}
              href={`/dashboard/tags/${tag.id}`}
              prefetch={false}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-600">
                {tag.name}
              </span>
              <span className="text-xs text-slate-500">{tag.numBookmarks}</span>
            </Link>
          ))}
          {tags?.tags.length === 0 && (
            <p className="text-sm text-slate-500">暂无标签</p>
          )}
          {!tags && <p className="text-sm text-slate-500">加载中...</p>}
        </div>
        <Link
          href="/dashboard/tags"
          prefetch={false}
          className="mt-4 block text-sm font-medium text-blue-600"
        >
          查看全部标签
        </Link>
      </section>
    </div>
  );
}
