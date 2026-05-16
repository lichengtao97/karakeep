import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.recently_read")} | AI Lens`,
  };
}

export default async function RecentlyReadBookmarkPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <Bookmarks
      header={
        <div className="flex items-center justify-between">
          <p className="text-2xl">🕘 {String(t("common.recently_read"))}</p>
        </div>
      }
      query={{ archived: false, readFilter: "recentlyRead" }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
