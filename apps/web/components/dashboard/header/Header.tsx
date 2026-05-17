import Link from "next/link";
import { redirect } from "next/navigation";
import DashboardTopNav from "@/components/dashboard/header/DashboardTopNav";
import ProfileOptions from "@/components/dashboard/header/ProfileOptions";
import { SearchInput } from "@/components/dashboard/search/SearchInput";
import { getServerAuthSession } from "@/server/auth";
import { Bell } from "lucide-react";

import { PluginManager, PluginType } from "@karakeep/shared/plugins";

export default async function Header() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }
  const searchEnabled = PluginManager.isRegistered(PluginType.Search);

  return (
    <header className="sticky left-0 right-0 top-0 z-50 flex h-16 items-center justify-between gap-6 overflow-x-auto overflow-y-hidden border-b border-slate-200 bg-white px-6">
      <div className="flex min-w-max items-center gap-8">
        <Link
          href={"/dashboard/bookmarks"}
          prefetch={false}
          className="flex items-center gap-3"
        >
          <div className="flex size-10 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600 shadow-sm">
            <span className="text-lg font-semibold">AI</span>
          </div>
          <div className="hidden items-baseline gap-4 sm:flex">
            <span className="text-2xl font-semibold tracking-normal text-slate-950">
              AI Lens
            </span>
            <span className="text-sm text-slate-500">个性化 AI 资讯收件箱</span>
          </div>
        </Link>
        <DashboardTopNav searchEnabled={searchEnabled} />
      </div>
      <div className="ml-auto flex min-w-max items-center gap-4">
        {searchEnabled ? (
          <SearchInput className="h-10 w-80 rounded-full border border-slate-200 bg-white shadow-sm xl:w-96" />
        ) : (
          <div className="flex h-10 w-80 items-center rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-400 shadow-sm xl:w-96">
            搜索服务未配置
          </div>
        )}
        <button className="relative flex size-10 items-center justify-center rounded-full text-slate-600 hover:bg-slate-50">
          <Bell size={20} />
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
            3
          </span>
        </button>
        <ProfileOptions />
      </div>
    </header>
  );
}
