import { redirect } from "next/navigation";
import DashboardSidebarInsights from "@/components/dashboard/DashboardSidebarInsights";
import MobileSidebar from "@/components/shared/sidebar/MobileSidebar";
import Sidebar from "@/components/shared/sidebar/Sidebar";
import SidebarLayout from "@/components/shared/sidebar/SidebarLayout";
import { ReaderSettingsProvider } from "@/lib/readerSettings";
import { UserSettingsContextProvider } from "@/lib/userSettings";
import { api } from "@/server/api/client";
import { getServerAuthSession } from "@/server/auth";
import { TRPCError } from "@trpc/server";
import { TFunction } from "i18next";
import {
  Archive,
  BookOpen,
  ClipboardList,
  CheckCircle2,
  Highlighter,
  Inbox,
  Search,
  Star,
} from "lucide-react";

import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { tryCatch } from "@karakeep/shared/tryCatch";

export default async function Dashboard({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  const userSettings = await tryCatch(api.users.settings());

  if (userSettings.error) {
    if (userSettings.error instanceof TRPCError) {
      if (
        userSettings.error.code === "NOT_FOUND" ||
        userSettings.error.code === "UNAUTHORIZED"
      ) {
        redirect("/logout");
      }
    }
    throw userSettings.error;
  }

  const items = (t: TFunction) =>
    [
      {
        name: "全部",
        icon: <Inbox size={18} />,
        path: "/dashboard/bookmarks",
      },
      {
        name: t("lists.favourites"),
        icon: <Star size={18} />,
        path: "/dashboard/favourites",
      },
      {
        name: t("common.unread"),
        icon: <BookOpen size={18} />,
        path: "/dashboard/unread",
      },
      {
        name: "已读",
        icon: <CheckCircle2 size={18} />,
        path: "/dashboard/recently-read",
      },
      {
        name: "高亮",
        icon: <Highlighter size={18} />,
        path: "/dashboard/highlights",
      },
      {
        name: t("common.archive"),
        icon: <Archive size={18} />,
        path: "/dashboard/archive",
      },
      PluginManager.isRegistered(PluginType.Search)
        ? [
            {
              name: t("common.search"),
              icon: <Search size={18} />,
              path: "/dashboard/search",
            },
          ]
        : [],
    ].flat();

  const mobileSidebar = (t: TFunction) => [
    ...items(t),
    {
      name: t("lists.all_lists"),
      icon: <ClipboardList size={18} />,
      path: "/dashboard/lists",
    },
  ];

  return (
    <UserSettingsContextProvider userSettings={userSettings.data}>
      <ReaderSettingsProvider>
        <SidebarLayout
          sidebar={
            <Sidebar
              items={items}
              extraSections={<DashboardSidebarInsights />}
            />
          }
          mobileSidebar={<MobileSidebar items={mobileSidebar} />}
          modal={modal}
        >
          {children}
        </SidebarLayout>
      </ReaderSettingsProvider>
    </UserSettingsContextProvider>
  );
}
