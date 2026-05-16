"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { AlertCircle, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { zResetPasswordSchema } from "@karakeep/shared/types/users";

const resetPasswordSchema = z
  .object({
    confirmPassword: z.string(),
  })
  .extend(zResetPasswordSchema.pick({ newPassword: true }).shape)
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const api = useTRPC();
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const resetPasswordMutation = useMutation(
    api.users.resetPassword.mutationOptions(),
  );

  const onSubmit = async (values: z.infer<typeof resetPasswordSchema>) => {
    try {
      setErrorMessage("");
      await resetPasswordMutation.mutateAsync({
        token,
        newPassword: values.newPassword,
      });
      setIsSuccess(true);
    } catch (error) {
      if (error instanceof TRPCClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("发生了意外错误，请重试。");
      }
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">
          {isSuccess ? "密码重置成功" : "重置密码"}
        </CardTitle>
        <CardDescription>
          {isSuccess
            ? "你的密码已成功重置，现在可以使用新密码登录。"
            : "请在下方输入新密码。"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isSuccess ? (
          <>
            <div className="flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <Alert>
              <AlertDescription className="text-center">
                你的密码已成功重置，现在可以使用新密码登录。
              </AlertDescription>
            </Alert>
            <ActionButton
              loading={false}
              onClick={() => router.push("/signin")}
              className="w-full"
            >
              前往登录
            </ActionButton>
          </>
        ) : (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
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
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="请输入新密码"
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
                      <FormLabel>确认新密码</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="请再次输入新密码"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <ActionButton
                  type="submit"
                  loading={form.formState.isSubmitting}
                  className="w-full"
                >
                  重置密码
                </ActionButton>
              </form>
            </Form>

            <div className="text-center">
              <ActionButton
                variant="ghost"
                loading={false}
                onClick={() => router.push("/signin")}
                className="w-full"
              >
                返回登录
              </ActionButton>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
