"use client";

import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef, useState } from "react";
import Link from "next/link";
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
import { useClientConfig } from "@/lib/clientConfig";
import { zodResolver } from "@hookform/resolvers/zod";
import { Turnstile } from "@marsidev/react-turnstile";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { AlertCircle, UserX } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { zSignUpSchema } from "@karakeep/shared/types/users";
import { isMobileAppRedirect } from "@karakeep/shared/utils/redirectUrl";

const VERIFY_EMAIL_ERROR = "Please verify your email address before signing in";

interface SignUpFormProps {
  redirectUrl: string;
}

export default function SignUpForm({ redirectUrl }: SignUpFormProps) {
  const api = useTRPC();
  const form = useForm<z.infer<typeof zSignUpSchema>>({
    resolver: zodResolver(zSignUpSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      confirmPassword: "",
      turnstileToken: "",
    },
  });
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();
  const clientConfig = useClientConfig();
  const turnstileSiteKey = clientConfig.turnstile?.siteKey;
  const turnstileRef = useRef<TurnstileInstance>(null);

  const createUserMutation = useMutation(api.users.create.mutationOptions());

  if (
    clientConfig.auth.disableSignups ||
    clientConfig.auth.disablePasswordAuth
  ) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">暂时无法注册</CardTitle>
          <CardDescription>当前已禁用账号注册</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Alert>
              <UserX className="h-4 w-4" />
              <AlertDescription>
                当前已关闭注册。请联系管理员开通访问权限。
              </AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link href="/signin">返回登录</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">创建你的账号</CardTitle>
        <CardDescription>
          加入 AI Lens，开始收集、标注和管理 AI 资讯
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(async (value) => {
              if (turnstileSiteKey && !value.turnstileToken) {
                form.setError("turnstileToken", {
                  type: "manual",
                  message: "请先完成验证",
                });
                return;
              }
              form.clearErrors("turnstileToken");
              try {
                await createUserMutation.mutateAsync({
                  ...value,
                  redirectUrl,
                });
              } catch (e) {
                if (e instanceof TRPCClientError) {
                  setErrorMessage(e.message);
                }
                // Reset turnstile widget on error to get a new token
                if (turnstileSiteKey) {
                  turnstileRef.current?.reset();
                  form.setValue("turnstileToken", "");
                }
                return;
              }
              const resp = await signIn("credentials", {
                redirect: false,
                email: value.email.trim(),
                password: value.password,
              });
              if (!resp || !resp.ok || resp.error) {
                if (resp?.error === VERIFY_EMAIL_ERROR) {
                  router.replace(
                    `/check-email?email=${encodeURIComponent(value.email.trim())}&redirectUrl=${encodeURIComponent(redirectUrl)}`,
                  );
                } else {
                  setErrorMessage(resp?.error ?? "登录时遇到意外错误");
                }
                // Reset turnstile widget on error to get a new token
                if (turnstileSiteKey) {
                  turnstileRef.current?.reset();
                  form.setValue("turnstileToken", "");
                }
                return;
              }
              if (isMobileAppRedirect(redirectUrl)) {
                window.location.href = redirectUrl;
              } else {
                router.replace(redirectUrl);
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="请输入邮箱" {...field} />
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

            {turnstileSiteKey && (
              <FormField
                control={form.control}
                name="turnstileToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>验证</FormLabel>
                    <FormControl>
                      <Turnstile
                        ref={turnstileRef}
                        siteKey={turnstileSiteKey}
                        onSuccess={(token) => {
                          field.onChange(token);
                          form.clearErrors("turnstileToken");
                        }}
                        onExpire={() => field.onChange("")}
                        onError={() => {
                          field.onChange("");
                          form.setError("turnstileToken", {
                            type: "manual",
                            message: "验证失败，请重新加载验证",
                          });
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <ActionButton
              type="submit"
              loading={
                form.formState.isSubmitting || createUserMutation.isPending
              }
              className="w-full"
            >
              注册
            </ActionButton>

            {(clientConfig.legal.termsOfServiceUrl ||
              clientConfig.legal.privacyPolicyUrl) && (
              <p className="text-center text-xs text-muted-foreground">
                点击上方“注册”即表示你同意
                {clientConfig.legal.termsOfServiceUrl && (
                  <Link
                    href={clientConfig.legal.termsOfServiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    服务条款
                  </Link>
                )}
                {clientConfig.legal.termsOfServiceUrl &&
                  clientConfig.legal.privacyPolicyUrl &&
                  " 和 "}
                {clientConfig.legal.privacyPolicyUrl && (
                  <Link
                    href={clientConfig.legal.privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    隐私政策
                  </Link>
                )}
                .
              </p>
            )}
          </form>
        </Form>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            已有账号？{" "}
            <Link
              href="/signin"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              登录
            </Link>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
