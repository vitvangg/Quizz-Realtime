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
    <div className="mb-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-black uppercase tracking-wider text-black bg-neon-yellow border-b-4 border-black hover:bg-neon-orange transition-colors"
      >
        <span>{group.title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {isOpen && (
        <nav className="mt-1 space-y-1 px-2 py-2">
          {group.items.map((item: any) => {
            const isActive = item.href === "/admin" 
              ? pathname === "/admin" 
              : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition-all border-4 border-transparent",
                  isActive 
                    ? "bg-black text-white border-black shadow-brutal-sm" 
                    : "text-black hover:bg-neon-blue hover:border-black"
                )}
              >
                <item.icon className="h-5 w-5" />
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

  const userRole = (user as any)?.role || 'SUPER_ADMIN';
  const visibleGroups = navGroups.filter(group => group.roles.includes(userRole));

  return (
    <div className="flex h-screen w-72 flex-col bg-white border-r-4 border-black">
      {/* Logo */}
      <div className="flex h-20 items-center border-b-4 border-black bg-neon-pink px-6">
        <div className="flex items-center gap-3">
          <div className="bg-black border-4 border-black shadow-brutal-sm p-2">
            <Gamepad2 className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-black">QUIZZ ADMIN</span>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4 bg-neon-yellow/30">
        {/* Dashboard Link */}
        <nav className="px-2 mb-3">
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition-all border-4 border-transparent",
              pathname === "/admin" 
                ? "bg-black text-white border-black shadow-brutal-sm" 
                : "text-black hover:bg-neon-blue hover:border-black"
            )}
          >
            <LayoutDashboard className="h-5 w-5" />
            Tổng quan chung
          </Link>
        </nav>

        {visibleGroups.map((group, idx) => (
          <NavGroup key={idx} group={group} pathname={pathname} />
        ))}
      </div>

      {/* Footer / Logout */}
      <div className="border-t-4 border-black p-4 bg-neon-green">
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 font-bold text-black border-4 border-transparent hover:bg-white hover:border-black" 
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Đăng xuất
        </Button>
      </div>
    </div>
  );
}
