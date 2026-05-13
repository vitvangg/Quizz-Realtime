"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Gamepad2,
  Flag,
  Bell,
  Settings,
  ShieldCheck,
  FileClock,
  LogOut,
  ChevronDown,
  ChevronRight,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth.store";
import { useRouter } from "next/navigation";

const navGroups = [
  {
    title: 'Quản trị (IT Admin)',
    roles: ['IT_ADMIN', 'SUPER_ADMIN'],
    items: [
      { name: "Quản lý User", href: "/admin/it/users", icon: Users },
      { name: "Quản lý Quiz", href: "/admin/it/quizzes", icon: BookOpen },
      { name: "Phân quyền (RBAC)", href: "/admin/it/roles", icon: ShieldCheck },
      { name: "Moderation / Report", href: "/admin/it/reports", icon: Flag },
    ]
  },
  {
    title: 'Hệ thống (OPS Admin)',
    roles: ['OPS_ADMIN', 'SUPER_ADMIN'],
    items: [
      { name: "System Dashboard", href: "/admin/system", icon: Activity },
      { name: "Game Session", href: "/admin/sessions", icon: Gamepad2 },
      { name: "Notification", href: "/admin/notifications", icon: Bell },
      { name: "Audit Log", href: "/admin/audit-logs", icon: FileClock },
      { name: "Cấu hình", href: "/admin/settings", icon: Settings },
    ]
  }
];

function NavGroup({ group, pathname }: { group: any, pathname: string }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="mb-4">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span>{group.title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {isOpen && (
        <nav className="mt-1 space-y-1 px-4">
          {group.items.map((item: any) => {
            const isActive = item.href === "/admin" 
              ? pathname === "/admin" 
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted",
                  isActive ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push("/signin");
  };

  // Giả sử user.role hoặc user.roles chứa role hiện tại. Mặc định cho hiện cả 2 nếu không có role.
  const userRole = (user as any)?.role || 'SUPER_ADMIN';

  const visibleGroups = navGroups.filter(group => group.roles.includes(userRole));

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-bold tracking-tight">Quizz Admin</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        {/* Dashboard chung */}
        <nav className="space-y-1 px-4 mb-4">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:bg-muted",
              pathname === "/admin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            Tổng quan chung
          </Link>
        </nav>

        {visibleGroups.map((group, idx) => (
          <NavGroup key={idx} group={group} pathname={pathname} />
        ))}
      </div>

      <div className="border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleLogout}>
          <LogOut className="h-4 w-4 text-red-500" />
          <span className="text-red-500 font-medium">Đăng xuất</span>
        </Button>
      </div>
    </div>
  );
}
