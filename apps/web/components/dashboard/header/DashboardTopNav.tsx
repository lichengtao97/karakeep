"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "今日", path: "/dashboard/bookmarks" },
  { name: "商报", path: "/dashboard/lists" },
  { name: "阅读库", path: "/dashboard/bookmarks" },
  { name: "我的 / 偏好", path: "/settings" },
];

export default function DashboardTopNav({
  searchEnabled,
}: {
  searchEnabled: boolean;
}) {
  const pathname = usePathname();
  const items = searchEnabled
    ? [
        ...navItems.slice(0, 3),
        { name: "搜索", path: "/dashboard/search" },
        ...navItems.slice(3),
      ]
    : navItems;

  return (
    <nav className="hidden h-full items-center gap-8 text-sm font-medium text-slate-700 lg:flex">
      {items.map((item) => {
        const active =
          item.name === "阅读库"
            ? pathname.startsWith("/dashboard") &&
              !pathname.startsWith("/dashboard/search")
            : item.name !== "今日" && pathname.startsWith(item.path);

        return (
          <Link
            key={item.name}
            href={item.path}
            prefetch={false}
            className={cn(
              "relative flex h-full items-center whitespace-nowrap px-1 transition-colors hover:text-blue-600",
              active ? "text-blue-600" : "text-slate-700",
            )}
          >
            {item.name}
            {active && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
