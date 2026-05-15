import { SigninForm } from "@/components/signin-form"
import Link from "next/link"

export default function SigninPage() {
    return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
            <Link href="/" className="absolute top-4 left-4 text-sm text-muted-foreground hover:text-foreground transition-colors">
                ← Về trang chủ
            </Link>
            <div className="w-full max-w-sm md:max-w-4xl">
                <SigninForm signupHref="/signup" />
            </div>
        </div>
    )
}
