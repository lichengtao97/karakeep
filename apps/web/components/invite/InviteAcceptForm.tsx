"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { AlertCircle, Clock, Loader2, Mail, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";

const inviteAcceptSchema = z
  .object({
    name: z.string().min(1, "请输入姓名"),
    password: z.string().min(8, "密码至少需要 8 个字符"),
    confirmPassword: z.string().min(8, "密码至少需要 8 个字符"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

interface InviteAcceptFormProps {
  token: string;
}

export default function InviteAcceptForm({ token }: InviteAcceptFormProps) {
  const api = useTRPC();
  const router = useRouter();

  const form = useForm<z.infer<typeof inviteAcceptSchema>>({
    resolver: zodResolver(inviteAcceptSchema),
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    isPending: loading,
    data: inviteData,
    error,
  } = useQuery(api.invites.get.queryOptions({ token }));

  useEffect(() => {
    if (error) {
      setErrorMessage(error.message);
    }
  }, [error]);

  const acceptInviteMutation = useMutation(
    api.invites.accept.mutationOptions(),
  );

  const handleBackToSignIn = () => {
    router.push("/signin");
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">正在加载邀请</CardTitle>
          <CardDescription>正在验证你的邀请，请稍候...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!inviteData) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">邀请无效</CardTitle>
          <CardDescription>这个邀请链接无效，或已被移除。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
          </div>

          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button onClick={handleBackToSignIn} className="w-full">
            返回登录
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (inviteData.expired) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">邀请已过期</CardTitle>
          <CardDescription>这个邀请链接已过期，无法继续使用。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Clock className="h-12 w-12 text-orange-500" />
          </div>

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              请联系管理员重新发送邀请。
            </p>
          </div>

          <Button
            onClick={handleBackToSignIn}
            variant="outline"
            className="w-full"
          >
            返回登录
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">接受邀请</CardTitle>
        <CardDescription>完成账号设置，加入 AI Lens</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-center">
          <UserPlus className="h-12 w-12 text-primary" />
        </div>

        <div className="space-y-2 text-center">
          <div className="flex items-center justify-center space-x-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">受邀邮箱：</p>
          </div>
          <p className="font-medium text-foreground">{inviteData.email}</p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (value) => {
              try {
                await acceptInviteMutation.mutateAsync({
                  token,
                  name: value.name,
                  password: value.password,
                });

                // Sign in the user after successful account creation
                const resp = await signIn("credentials", {
                  redirect: false,
                  email: inviteData.email,
                  password: value.password,
                });

                if (!resp || !resp.ok || resp.error) {
                  setErrorMessage(
                    resp?.error ?? "账号已创建，但自动登录失败。请手动登录。",
                  );
                  return;
                }

                router.replace("/");
              } catch (e) {
                if (e instanceof TRPCClientError) {
                  setErrorMessage(e.message);
                } else {
                  setErrorMessage("发生了意外错误");
                }
              }
            })}
            className="space-y-4"
          >
            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="请输入姓名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="请创建密码"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>确认密码</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="请再次输入密码"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <ActionButton
              type="submit"
              loading={
                form.formState.isSubmitting || acceptInviteMutation.isPending
              }
              className="w-full"
            >
              {form.formState.isSubmitting || acceptInviteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在创建账号...
                </>
              ) : (
                "创建账号并登录"
              )}
            </ActionButton>

            <Button
              type="button"
              variant="ghost"
              onClick={handleBackToSignIn}
              className="w-full"
            >
              返回登录
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
