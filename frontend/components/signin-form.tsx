'use client'
import { toast } from "sonner";
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
import { useAuthStore } from "@/stores/auth.store";
import { z } from "zod"
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(4, "Mật khẩu phải có ít nhất 4 ký tự"),
})

type SigninFormValues = z.infer<typeof loginSchema>

type SigninFormProps = {
    signupHref?: string
} & React.ComponentProps<"div">

export function SigninForm({
    className,
    signupHref,
    ...props
}: SigninFormProps) {
    const { login } = useAuthStore();
    const router = useRouter();

    const { register, handleSubmit, formState: { errors } } = useForm<SigninFormValues>({
        resolver: zodResolver(loginSchema),
    })

    const onSubmit = async (data: SigninFormValues) => {
        const { email, password } = data;

        try {
            console.log("before login");

            await login(email, password);



            console.log("after login");

            router.push("/quiz");
        } catch (error: any) {
            console.error("Login error:", error);

            toast.error(
                error?.response?.data?.message ||
                "Đăng nhập thất bại. Vui lòng thử lại."
            );
        }
    }
    const onFormError = (errors: any) => {
        const firstError = Object.values(errors)[0] as any;

        if (firstError) {
            toast.error(firstError.message);
        }
    };

    return (
        <div className={cn("w-full", className)} {...props}>
            <Card className="overflow-hidden border-4 border-black shadow-[6px_6px_0px_0px_#000] sm:shadow-[8px_8px_0px_0px_#000]">
                <CardContent className="grid p-0 min-h-[580px]">
                    {/* Form Side - Always visible */}
                    <form className="p-5 sm:p-8 md:p-10" onSubmit={handleSubmit(onSubmit, onFormError)}>
                        <FieldGroup className="space-y-4 sm:space-y-5">
                            {/* Header */}
                            <div className="flex flex-col items-center gap-2 text-center mb-4 sm:mb-6">
                                <div className="bg-neon-pink border-2 sm:border-4 border-black shadow-[2px_2px_0px_0px_#000] sm:shadow-[4px_4px_0px_0px_#000] p-2 sm:p-3 mb-1 sm:mb-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <h1 className="text-xl sm:text-3xl font-black uppercase tracking-tight">ĐĂNG NHẬP</h1>
                                <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                                    Chào mừng bạn quay trở lại!
                                </p>
                            </div>

                            {/* Email Field */}
                            <Field>
                                <FieldLabel htmlFor="email" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">Email</FieldLabel>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    className="h-10 sm:h-12 text-sm sm:text-base border-2 sm:border-4"
                                    {...register("email")}
                                />
                            </Field>

                            {/* Password Field */}
                            <Field>
                                <FieldLabel htmlFor="password" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1.5 sm:mb-2">Mật khẩu</FieldLabel>
                                <Input
                                    id="password"
                                    type="password"
                                    className="h-10 sm:h-12 text-sm sm:text-base border-2 sm:border-4"
                                    {...register("password")}
                                />
                            </Field>

                            {/* Submit Button */}
                            <Field>
                                <Button type="submit" className="w-full h-11 sm:h-14 text-sm sm:text-lg font-black border-2 sm:border-4 border-black shadow-[3px_3px_0px_0px_#000] sm:shadow-[6px_6px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] sm:hover:translate-x-[3px] sm:hover:translate-y-[3px] hover:shadow-none transition-all cursor-pointer">
                                    ĐĂNG NHẬP
                                </Button>
                            </Field>


                            {/* Footer Link */}
                            <FieldDescription className="text-center font-bold text-xs sm:text-sm">
                                Bạn chưa có tài khoản? <Link href={signupHref || ''} className="text-neon-pink font-black hover:underline decoration-2 underline-offset-4">ĐĂNG KÝ</Link>
                            </FieldDescription>
                        </FieldGroup>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
