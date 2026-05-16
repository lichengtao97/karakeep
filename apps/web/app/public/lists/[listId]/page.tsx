import type { Metadata } from "next";
import { notFound } from "next/navigation";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import PublicBookmarkGrid from "@/components/public/lists/PublicBookmarkGrid";
import PublicListHeader from "@/components/public/lists/PublicListHeader";
import { api } from "@/server/api/client";
import { TRPCError } from "@trpc/server";

export async function generateMetadata(props: {
  params: Promise<{ listId: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  try {
    const resp = await api.publicBookmarks.getPublicListMetadata({
      listId: params.listId,
    });
    return {
      title: `${resp.name} - ${resp.ownerName} 的 AI Lens 列表`,
      description:
        resp.description && resp.description.length > 0
          ? `${resp.description}，由 ${resp.ownerName} 通过 AI Lens 分享`
          : undefined,
      applicationName: "AI Lens",
      authors: [
        {
          name: resp.ownerName,
        },
      ],
    };
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
  }
  return {
    title: "AI Lens",
  };
}

export default async function PublicListPage(props: {
  params: Promise<{ listId: string }>;
}) {
  const params = await props.params;
  try {
    const { list, bookmarks, nextCursor } =
      await api.publicBookmarks.getPublicBookmarksInList({
        listId: params.listId,
      });
    return (
      <div className="space-y-3">
        <PublicListHeader
          list={{
            id: params.listId,
            name: list.name,
            description: list.description,
            icon: list.icon,
            numItems: list.numItems,
            ownerName: list.ownerName,
          }}
        />
        {list.numItems > 0 ? (
          <PublicBookmarkGrid
            list={{
              id: params.listId,
              name: list.name,
              description: list.description,
              icon: list.icon,
              numItems: list.numItems,
              ownerName: list.ownerName,
            }}
            bookmarks={bookmarks}
            nextCursor={nextCursor}
          />
        ) : (
          <NoBookmarksBanner />
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") {
      notFound();
    }
  }
}
