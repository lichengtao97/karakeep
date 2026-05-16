"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function ErrorFallback() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg bg-slate-50 p-8 shadow-sm dark:bg-slate-700/50 dark:shadow-md">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-balance text-2xl font-semibold text-foreground">
            出现了一些问题
          </h1>
          <p className="text-pretty leading-relaxed text-muted-foreground">
            抱歉，页面遇到了意外错误。请重试；如果问题持续存在，请联系管理员。
          </p>
        </div>

        <div className="space-y-3">
          <Button className="w-full" onClick={() => window.location.reload()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重试
          </Button>

          <Link href="/" className="block">
            <Button variant="outline" className="w-full">
              <Home className="mr-2 h-4 w-4" />
              返回首页
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
