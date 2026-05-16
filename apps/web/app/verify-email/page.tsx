"use client";

import { useEffect, useState } from "react";
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
import { CheckCircle, Loader2, XCircle } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import {
  isMobileAppRedirect,
  validateRedirectUrl,
} from "@karakeep/shared/utils/redirectUrl";

export default function VerifyEmailPage() {
  const api = useTRPC();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const redirectUrl =
    validateRedirectUrl(searchParams.get("redirectUrl")) ?? "/";

  const verifyEmailMutation = useMutation(
    api.users.verifyEmail.mutationOptions({
      onSuccess: () => {
        setStatus("success");
        if (isMobileAppRedirect(redirectUrl)) {
          setMessage("邮箱验证成功，正在跳转到应用...");
          // Redirect to mobile app after a brief delay
          setTimeout(() => {
            window.location.href = redirectUrl;
          }, 1500);
        } else {
          setMessage("邮箱验证成功，现在可以登录。");
        }
      },
      onError: (error) => {
        setStatus("error");
        setMessage(error.message || "邮箱验证失败，链接可能无效或已过期。");
      },
    }),
  );

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

  const isMobileRedirect = isMobileAppRedirect(redirectUrl);

  useEffect(() => {
    if (token && email) {
      verifyEmailMutation.mutate({ token, email });
    } else {
      setStatus("error");
      setMessage("验证链接无效，缺少 token 或邮箱。");
    }
  }, [token, email]);

  const handleResendEmail = () => {
    if (email) {
      resendEmailMutation.mutate({ email, redirectUrl });
    }
  };

  const handleSignIn = () => {
    if (isMobileRedirect) {
      window.location.href = redirectUrl;
    } else if (redirectUrl !== "/") {
      router.push(`/signin?redirectUrl=${encodeURIComponent(redirectUrl)}`);
    } else {
      router.push("/signin");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">邮箱验证</CardTitle>
          <CardDescription>
            {status === "loading" && "正在验证邮箱..."}
            {status === "success" && "邮箱验证成功"}
            {status === "error" && "验证失败"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "loading" && (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {status === "success" && (
            <>
              <div className="flex items-center justify-center">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <Alert>
                <AlertDescription className="text-center">
                  {message}
                </AlertDescription>
              </Alert>
              <Button onClick={handleSignIn} className="w-full">
                {isMobileRedirect ? "打开应用" : "登录"}
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="flex items-center justify-center">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
              <Alert variant="destructive">
                <AlertDescription className="text-center">
                  {message}
                </AlertDescription>
              </Alert>
              {email && (
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
                    onClick={handleSignIn}
                    variant="ghost"
                    className="w-full"
                  >
                    返回登录
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
