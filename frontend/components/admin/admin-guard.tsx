"use client";

import { useAuthStore } from "@/stores/auth.store";
import { useRouter } from "next/navigation";
import { useEffect, ReactNode, useState } from "react";
import { Loader2 } from "lucide-react";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, isHydrated, loading } = useAuthStore();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (!isHydrated) return; // Wait until auth state is loaded

    // Check if user is logged in
    if (!user) {
      router.replace("/signin");
      return;
    }

    // Temporary: If user exists, we assume they have some admin access for now,
    // until we fully implement roles on the backend.
    // In production, uncomment the role check:
    /*
    if (user.role !== "Admin" && user.role !== "Moderator") {
      router.replace("/403"); // Or redirect to home
      return;
    }
    */
    
    setIsAuthorized(true);

  }, [user, isHydrated, router]);

  if (!isHydrated || !isAuthorized) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
