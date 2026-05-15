"use client";

import { useAuthStore } from "@/stores/auth.store";
import { User, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminHeader() {
  const { user } = useAuthStore();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b-4 border-black bg-white px-6">
      <div className="flex flex-1 items-center justify-end gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          className="border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5 bg-neon-yellow"
        >
          <Bell className="h-5 w-5 text-black" />
        </Button>
        <div className="flex items-center gap-3 border-l-4 border-black pl-4">
          <div className="bg-black border-4 border-black shadow-brutal-sm p-2">
            <User className="h-5 w-5 text-neon-yellow" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black">{user?.username || "Admin User"}</span>
            <span className="text-xs font-medium text-black/50">{user?.email || "admin@quizz.com"}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
