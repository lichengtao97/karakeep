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
  return (
    <Bookmarks
      query={{ archived: false, readFilter: "unread" }}
      showEditorCard={true}
    />
  );
}
