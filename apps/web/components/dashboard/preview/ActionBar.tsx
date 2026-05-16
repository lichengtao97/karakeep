import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Pencil, Trash2 } from "lucide-react";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useUpdateBookmark } from "@karakeep/shared-react/hooks/bookmarks";

import DeleteBookmarkConfirmationDialog from "../bookmarks/DeleteBookmarkConfirmationDialog";
import { EditBookmarkDialog } from "../bookmarks/EditBookmarkDialog";
import { ArchivedActionIcon, FavouritedActionIcon } from "../bookmarks/icons";

export default function ActionBar({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  const [deleteBookmarkDialogOpen, setDeleteBookmarkDialogOpen] =
    useState(false);

  const [isEditBookmarkDialogOpen, setEditBookmarkDialogOpen] = useState(false);

  const onError = () => {
    toast({
      variant: "destructive",
      title: "出现了一些问题",
      description: "处理请求时出现问题。",
    });
  };
  const { mutate: favBookmark, isPending: pendingFav } = useUpdateBookmark({
    onSuccess: () => {
      toast({
        description: "内容已更新。",
      });
    },
    onError,
  });
  const { mutate: archiveBookmark, isPending: pendingArchive } =
    useUpdateBookmark({
      onSuccess: (resp) => {
        toast({
          description: resp.archived ? "内容已归档。" : "内容已取消归档。",
        });
      },
      onError,
    });

  return (
    <div className="flex items-center justify-center gap-3 text-muted-foreground">
      <Tooltip delayDuration={0}>
        <EditBookmarkDialog
          bookmark={bookmark}
          open={isEditBookmarkDialogOpen}
          setOpen={setEditBookmarkDialogOpen}
        />

        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="none"
            className="size-8 rounded-md"
            onClick={() => {
              setEditBookmarkDialogOpen(true);
            }}
          >
            <Pencil size={18} strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.edit")}</TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            className="size-8 rounded-md"
            loading={pendingFav}
            onClick={() => {
              favBookmark({
                bookmarkId: bookmark.id,
                favourited: !bookmark.favourited,
              });
            }}
          >
            <FavouritedActionIcon
              favourited={bookmark.favourited}
              size={18}
              strokeWidth={1.5}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {bookmark.favourited
            ? t("actions.unfavorite")
            : t("actions.favorite")}
        </TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <ActionButton
            variant="ghost"
            size="none"
            loading={pendingArchive}
            className="size-8 rounded-md"
            onClick={() => {
              archiveBookmark({
                bookmarkId: bookmark.id,
                archived: !bookmark.archived,
              });
            }}
          >
            <ArchivedActionIcon
              archived={bookmark.archived}
              size={18}
              strokeWidth={1.5}
            />
          </ActionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {bookmark.archived ? t("actions.unarchive") : t("actions.archive")}
        </TooltipContent>
      </Tooltip>
      <Tooltip delayDuration={0}>
        <DeleteBookmarkConfirmationDialog
          bookmark={bookmark}
          open={deleteBookmarkDialogOpen}
          setOpen={setDeleteBookmarkDialogOpen}
        />
        <TooltipTrigger asChild>
          <Button
            className="size-8 rounded-md"
            variant="ghost"
            size="none"
            onClick={() => setDeleteBookmarkDialogOpen(true)}
          >
            <Trash2 size={18} strokeWidth={1.5} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("actions.delete")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
