import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { getBookmarkRefreshInterval } from "@karakeep/shared/utils/bookmarkUtils";

import AssetCard from "./AssetCard";
import LinkCard from "./LinkCard";
import TextCard from "./TextCard";
import UnknownCard from "./UnknownCard";

const LIST_CARD_REFRESH_WINDOW_MS = 10 * 60 * 1000;

export default function BookmarkCard({
  bookmark: initialData,
  className,
}: {
  bookmark: ZBookmark;
  className?: string;
}) {
  const api = useTRPC();
  const isWithinListRefreshWindow =
    Date.now().valueOf() - initialData.createdAt.valueOf() <
    LIST_CARD_REFRESH_WINDOW_MS;
  const initialRefreshInterval = getBookmarkRefreshInterval(initialData);
  const { data: bookmark } = useQuery(
    api.bookmarks.getBookmark.queryOptions(
      {
        bookmarkId: initialData.id,
      },
      {
        enabled: initialRefreshInterval !== false && isWithinListRefreshWindow,
        initialData,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchInterval: (query) => {
          if (!isWithinListRefreshWindow) {
            return false;
          }
          const data = query.state.data;
          if (!data) {
            return false;
          }
          return getBookmarkRefreshInterval(data);
        },
        staleTime:
          initialRefreshInterval === false ? Infinity : initialRefreshInterval,
      },
    ),
  );

  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      return (
        <LinkCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.TEXT:
      return (
        <TextCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.ASSET:
      return (
        <AssetCard
          className={className}
          bookmark={{ ...bookmark, content: bookmark.content }}
        />
      );
    case BookmarkTypes.UNKNOWN:
      return <UnknownCard className={className} bookmark={bookmark} />;
  }
}
