import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("common.unread")} | AI Lens`,
  };
}

export default async function UnreadBookmarkPage() {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();

  return (
    <Bookmarks
      header={
        <div className="flex items-center justify-between">
          <p className="text-2xl">📖 {String(t("common.unread"))}</p>
        </div>
      }
      query={{ archived: false, readFilter: "unread" }}
      showDivider={true}
      showEditorCard={true}
    />
  );
}
