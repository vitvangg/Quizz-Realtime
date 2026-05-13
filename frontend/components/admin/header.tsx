"use client";

import { useAuthStore } from "@/stores/auth.store";
import { User, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminHeader() {
  const { user } = useAuthStore();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background px-6">
      <div className="flex flex-1 items-center justify-end gap-4">
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </Button>
        <div className="flex items-center gap-2 border-l pl-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user?.username || "Admin User"}</span>
            <span className="text-xs text-muted-foreground">{user?.email || "admin@quizz.com"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
