import { SignupForm } from "@/components/signup-form"
import Link from "next/link"

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-neon-green flex flex-col items-center justify-center p-4 md:p-8">
      {/* Back Link */}
      <Link href="/" className="absolute top-4 left-4 flex items-center gap-2 font-bold text-black hover:text-black/70 transition-colors">
        <span className="bg-white border-4 border-black shadow-brutal-sm px-4 py-2 rounded-lg hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all">
          ← VỀ TRANG CHỦ
        </span>
      </Link>

      <div className="w-full max-w-md">
        <SignupForm loginHref="/signin" />
      </div>
    </div>
  )
}
