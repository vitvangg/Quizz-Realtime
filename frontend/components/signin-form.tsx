'use client'
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
        } catch (error) {
            console.error("Login error:", error);
        }
    }

    return (
        <div className={cn("flex flex-col gap-6", className)} {...props}>
            <Card className="overflow-hidden border-4 border-black shadow-brutal-xl">
                <CardContent className="grid p-0 md:grid-cols-2">
                    {/* Form Side */}
                    <form className="p-8 md:p-10" onSubmit={handleSubmit(onSubmit)}>
                        <FieldGroup className="space-y-6">
                            {/* Header */}
                            <div className="flex flex-col items-center gap-2 text-center">
                                <div className="bg-neon-pink border-4 border-black shadow-brutal-sm p-3 mb-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <h1 className="text-3xl font-black uppercase tracking-tight">ĐĂNG NHẬP</h1>
                                <p className="text-sm font-medium text-muted-foreground">
                                    Chào mừng bạn quay trở lại!
                                </p>
                            </div>

                            {/* Email Field */}
                            <Field>
                                <FieldLabel htmlFor="email" className="text-xs font-bold uppercase tracking-wider mb-2">Email</FieldLabel>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="m@example.com"
                                    className="h-12 text-base"
                                    {...register("email")}
                                />
                            </Field>

                            {/* Password Field */}
                            <Field>
                                <FieldLabel htmlFor="password" className="text-xs font-bold uppercase tracking-wider mb-2">Mật khẩu</FieldLabel>
                                <Input
                                    id="password"
                                    type="password"
                                    className="h-12 text-base"
                                    {...register("password")}
                                />
                            </Field>

                            {/* Submit Button */}
                            <Field>
                                <Button type="submit" className="w-full h-12 text-base font-bold cursor-pointer">
                                    ĐĂNG NHẬP
                                </Button>
                            </Field>

                            {/* Divider */}
                            <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card font-medium">
                                hoặc tiếp tục với
                            </FieldSeparator>

                            {/* Google Button */}
                            <Field>
                                <Button variant="outline" type="button" className="w-full h-12 cursor-pointer">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 mr-2">
                                        <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" fill="currentColor"/>
                                    </svg>
                                    ĐĂNG NHẬP VỚI GOOGLE
                                </Button>
                            </Field>

                            {/* Footer Link */}
                            <FieldDescription className="text-center font-medium">
                                Bạn chưa có tài khoản? <Link href={signupHref || ''} className="text-neon-pink font-bold hover:underline">ĐĂNG KÝ</Link>
                            </FieldDescription>
                        </FieldGroup>
                    </form>

                    {/* Image Side */}
                    <div className="relative hidden bg-neon-yellow md:block">
                        <div className="absolute inset-0 border-l-4 border-black flex flex-col items-center justify-center p-8 text-center">
                            <div className="bg-black border-4 border-black shadow-brutal p-6 mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-neon-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h2 className="text-3xl font-black text-black uppercase mb-2">CHƠI QUIZ</h2>
                            <p className="text-lg font-bold text-black/70">Thử thách bản thân cùng bạn bè!</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
