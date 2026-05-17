"use client";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { z } from "zod"
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

const signupSchema = z.object({
  email: z.email(),
  password: z.string().min(6, "Mật khẩu phải có ít nhất 6 ký tự"),
  confirmPassword: z.string().min(6, "Xác nhận mật khẩu phải có ít nhất 6 ký tự"),
})
  .refine((data) => data.password === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

type SignupFormValues = z.infer<typeof signupSchema>;

type SignupFormProps = {
  loginHref?: string
} & React.ComponentProps<"div">

export function SignupForm({
  className,
  loginHref,
  ...props
}: SignupFormProps) {
  const { register } = useAuthStore();
  const router = useRouter();
  const { register: formRegister, handleSubmit, formState: { errors } } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupFormValues) => {
    const { email, password } = data;
    try {
      await register(email, password);
      router.push("/signin");
    } catch (error) {
      console.error("Signup error:", error);
    }
  }

  return (
    <div className={cn("w-full", className)} {...props}>
      <Card className="overflow-hidden border-4 border-black shadow-brutal-xl">
        <CardContent className="grid p-0">
          {/* Form Side - Always visible */}
          <form className="p-6 sm:p-8 md:p-10" onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup className="space-y-5">
              {/* Header */}
              <div className="flex flex-col items-center gap-2 text-center mb-6">
                <div className="bg-neon-green border-4 border-black shadow-brutal-sm p-3 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">TẠO TÀI KHOẢN</h1>
                <p className="text-sm font-medium text-muted-foreground">
                  Đăng ký để bắt đầu chơi ngay!
                </p>
              </div>

              {/* Email Field */}
              <Field>
                <FieldLabel htmlFor="email" className="text-xs font-bold uppercase tracking-wider mb-2">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  className="h-11 sm:h-12 text-sm sm:text-base"
                  {...formRegister("email")}
                />
                {errors.email && <p className="text-red-500 font-bold mt-1">{errors.email.message}</p>}
              </Field>

              {/* Password Fields - Stack on mobile, side by side on tablet+ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="password" className="text-xs font-bold uppercase tracking-wider mb-2">Mật khẩu</FieldLabel>
                  <Input id="password" type="password" className="h-11 sm:h-12 text-sm sm:text-base" {...formRegister("password")} />
                  {errors.password && <p className="text-red-500 font-bold mt-1">{errors.password.message}</p>}
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password" className="text-xs font-bold uppercase tracking-wider mb-2">Xác nhận</FieldLabel>
                  <Input id="confirm-password" type="password" className="h-11 sm:h-12 text-sm sm:text-base" {...formRegister("confirmPassword")} />
                  {errors.confirmPassword && <p className="text-red-500 font-bold mt-1">{errors.confirmPassword.message}</p>}
                </Field>
              </div>

              <FieldDescription className="text-xs font-medium -mt-2">
                Mật khẩu phải có ít nhất 6 ký tự
              </FieldDescription>

              {/* Submit Button */}
              <Field>
                <Button type="submit" className="w-full h-11 sm:h-12 text-sm sm:text-base font-bold cursor-pointer">
                  TẠO TÀI KHOẢN
                </Button>
              </Field>

              {/* Divider */}
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card font-medium">
                hoặc tiếp tục với
              </FieldSeparator>

              {/* Google Button */}
              <Field>
                <Button variant="outline" type="button" className="w-full h-11 sm:h-12 text-sm sm:text-base cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 mr-2">
                    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="currentColor"/>
                  </svg>
                  GOOGLE
                </Button>
              </Field>

              {/* Footer Link */}
              <FieldDescription className="text-center font-medium">
                Bạn đã có tài khoản? <Link href={loginHref || ''} className="text-neon-green font-bold hover:underline">ĐĂNG NHẬP</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
