import { toast } from "@/components/ui/sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmarkTags } from "@karakeep/shared-react/hooks/bookmarks";

import { TagsEditor } from "./TagsEditor";

export function BookmarkTagsEditor({
  bookmark,
  disabled,
}: {
  bookmark: ZBookmark;
  disabled?: boolean;
}) {
  const { mutate } = useUpdateBookmarkTags({
    onSuccess: () => {
      toast({
        description: "标签已更新。",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "出现了一些问题",
        description: "处理请求时出现问题。",
      });
    },
  });

  return (
    <TagsEditor
      tags={bookmark.tags}
      disabled={disabled}
      onAttach={({ tagName, tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [
            {
              tagName,
              tagId,
            },
          ],
          detach: [],
        });
      }}
      onDetach={({ tagId }) => {
        mutate({
          bookmarkId: bookmark.id,
          attach: [],
          detach: [{ tagId }],
        });
      }}
    />
  );
}
