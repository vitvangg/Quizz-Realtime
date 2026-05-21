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
import { toast } from "sonner";

const signupSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
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

  // Hiển thị lỗi qua toast thay vì làm thay đổi kích thước form
  const onFormError = (errors: any) => {
    const firstError = Object.values(errors)[0] as any;
    if (firstError) {
      toast.error(firstError.message);
    }
  };

  const onSubmit = async (data: SignupFormValues) => {
    const { email, password } = data;
    try {
      await register(email, password);
      toast.success("Đăng ký thành công!");
      router.push("/signin");
    } catch (error) {
      toast.error("Đăng ký thất bại. Vui lòng thử lại.");
      console.error("Signup error:", error);
    }
  }

  return (
    <div className={cn("w-full", className)} {...props}>
      <Card className="overflow-hidden border-4 border-black shadow-[6px_6px_0px_0px_#000] sm:shadow-[8px_8px_0px_0px_#000]">
        <CardContent className="grid p-0 min-h-[300px]">
          {/* Form Side - Always visible */}
          <form className="p-5 sm:p-8 md:p-10" onSubmit={handleSubmit(onSubmit, onFormError)}>
            <FieldGroup className="space-y-1">
              {/* Header */}
              <div className="flex flex-col items-center gap-2 text-center mb-4 sm:mb-6">
                <div className="bg-neon-green border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[4px_4px_0px_0px_#000] p-2 sm:p-3 mb-1 sm:mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight">TẠO TÀI KHOẢN</h1>
                <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                  Đăng ký để bắt đầu chơi ngay!
                </p>
              </div>

              {/* Email Field */}
              <Field>
                <FieldLabel htmlFor="email" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  className={cn(
                    "h-10 sm:h-12 text-sm sm:text-base border-2 sm:border-4",
                    errors.email && "border-red-500 bg-red-50"
                  )}
                  {...formRegister("email")}
                />
              </Field>

              {/* Password Field */}
              <Field>
                <FieldLabel htmlFor="password" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">Mật khẩu</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className={cn(
                    "h-10 sm:h-12 text-sm sm:text-base border-2 sm:border-4",
                    errors.password && "border-red-500 bg-red-50"
                  )}
                  {...formRegister("password")}
                />
              </Field>

              {/* Confirm Password Field */}
              <Field>
                <FieldLabel htmlFor="confirm-password" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">Xác nhận mật khẩu</FieldLabel>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  className={cn(
                    "h-10 sm:h-12 text-sm sm:text-base border-2 sm:border-4",
                    errors.confirmPassword && "border-red-500 bg-red-50"
                  )}
                  {...formRegister("confirmPassword")}
                />
              </Field>

              <FieldDescription className="text-[10px] sm:text-xs font-bold -mt-1 sm:-mt-2 uppercase">
                Mật khẩu ít nhất 6 ký tự
              </FieldDescription>

              {/* Submit Button */}
              <Field>
                <Button type="submit" className="w-full h-11 sm:h-14 text-sm sm:text-lg font-black border-2 sm:border-4 border-black shadow-[3px_3px_0px_0px_#000] sm:shadow-[6px_6px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[3px] sm:hover:translate-y-[3px] hover:shadow-none transition-all cursor-pointer">
                  TẠO TÀI KHOẢN
                </Button>
              </Field>



              {/* Footer Link */}
              <FieldDescription className="text-center font-bold text-xs sm:text-sm">
                Bạn đã có tài khoản? <Link href={loginHref || ''} className="text-neon-green font-black hover:underline decoration-2 underline-offset-4">ĐĂNG NHẬP</Link>
              </FieldDescription>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
