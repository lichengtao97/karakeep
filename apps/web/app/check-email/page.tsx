"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { validateRedirectUrl } from "@karakeep/shared/utils/redirectUrl";

export default function CheckEmailPage() {
  const api = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState("");

  const email = searchParams.get("email");
  const redirectUrl =
    validateRedirectUrl(searchParams.get("redirectUrl")) ?? "/";

  const resendEmailMutation = useMutation(
    api.users.resendVerificationEmail.mutationOptions({
      onSuccess: () => {
        setMessage("新的验证邮件已发送到你的邮箱。");
      },
      onError: (error) => {
        setMessage(error.message || "重新发送验证邮件失败。");
      },
    }),
  );

  const handleResendEmail = () => {
    if (email) {
      resendEmailMutation.mutate({ email, redirectUrl });
    }
  };

  const handleBackToSignIn = () => {
    router.push("/signin");
  };

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">请求无效</CardTitle>
            <CardDescription>没有提供邮箱地址，请重新注册。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleBackToSignIn} className="w-full">
              返回登录
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">请查收邮箱</CardTitle>
          <CardDescription>我们已向你的邮箱发送验证链接</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Mail className="h-12 w-12 text-blue-600" />
          </div>

          <div className="space-y-2 text-center">
            <p className="text-sm text-muted-foreground">验证邮件已发送至：</p>
            <p className="font-medium text-foreground">{email}</p>
            <p className="text-sm text-muted-foreground">
              请点击邮件中的链接完成账号验证和注册。
            </p>
          </div>

          {message && (
            <Alert>
              <AlertDescription className="text-center">
                {message}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleResendEmail}
              variant="outline"
              className="w-full"
              disabled={resendEmailMutation.isPending}
            >
              {resendEmailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在发送...
                </>
              ) : (
                "重新发送验证邮件"
              )}
            </Button>
            <Button
              onClick={handleBackToSignIn}
              variant="ghost"
              className="w-full"
            >
              返回登录
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
