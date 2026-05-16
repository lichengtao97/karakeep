"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";

const createInviteSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

interface CreateInviteDialogProps {
  children: React.ReactNode;
}

export default function CreateInviteDialog({
  children,
}: CreateInviteDialogProps) {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const form = useForm<z.infer<typeof createInviteSchema>>({
    resolver: zodResolver(createInviteSchema),
    defaultValues: {
      email: "",
    },
  });

  const createInviteMutation = useMutation(
    api.invites.create.mutationOptions({
      onSuccess: () => {
        toast({
          description: "Invite sent successfully",
        });
        queryClient.invalidateQueries(api.invites.list.pathFilter());
        setOpen(false);
        form.reset();
        setErrorMessage("");
      },
      onError: (e) => {
        if (e instanceof TRPCClientError) {
          setErrorMessage(e.message);
        } else {
          setErrorMessage("发送邀请失败");
        }
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>发送用户邀请</DialogTitle>
          <DialogDescription>
            邀请新用户加入 AI Lens。对方会收到账号创建说明，并默认分配为
            &quot;user&quot; 角色。
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (value) => {
              setErrorMessage("");
              await createInviteMutation.mutateAsync(value);
            })}
            className="space-y-4"
          >
            {errorMessage && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱地址</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="user@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2">
              <ActionButton
                type="button"
                variant="outline"
                loading={false}
                onClick={() => setOpen(false)}
              >
                取消
              </ActionButton>
              <ActionButton
                type="submit"
                loading={createInviteMutation.isPending}
              >
                发送邀请
              </ActionButton>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
