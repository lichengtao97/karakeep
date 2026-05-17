"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import GlobalActions from "@/components/dashboard/GlobalActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Archive, Filter, Tag } from "lucide-react";

const tabs = [
  { name: "收藏", path: "/dashboard/bookmarks" },
  { name: "稍后读", path: "/dashboard/unread" },
  { name: "已读", path: "/dashboard/recently-read" },
  { name: "高亮", path: "/dashboard/highlights" },
  { name: "归档", path: "/dashboard/archive" },
];

export default function ReadingLibraryHeader() {
  const pathname = usePathname();

  return (
    <div className="space-y-5 border-b border-slate-200 bg-white pb-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-slate-950">
          阅读库
        </h1>
        <div className="mt-4 flex gap-8 overflow-x-auto text-sm font-medium">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.path);
            return (
              <Link
                key={tab.path}
                href={tab.path}
                prefetch={false}
                className={cn(
                  "relative whitespace-nowrap pb-3 transition-colors hover:text-blue-600",
                  active ? "text-blue-600" : "text-slate-700",
                )}
              >
                {tab.name}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-md border-slate-200 bg-white px-4 text-slate-700 shadow-sm"
          >
            <Filter size={16} />
            筛选
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-md border-slate-200 bg-white px-4 text-slate-700 shadow-sm"
          >
            <Archive size={16} />
            批量归档
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-md border-slate-200 bg-white px-4 text-slate-700 shadow-sm"
          >
            <Tag size={16} />
            标签
          </Button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-1 py-1 shadow-sm">
          <GlobalActions />
        </div>
      </div>
    </div>
  );
}
