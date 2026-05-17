import type { Metadata } from "next";
import Bookmarks from "@/components/dashboard/bookmarks/Bookmarks";
import { useTranslation } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  return {
    title: `${t("lists.favourites")} | AI Lens`,
  };
}

export default async function FavouritesBookmarkPage() {
  return <Bookmarks query={{ favourited: true }} showEditorCard={true} />;
}
