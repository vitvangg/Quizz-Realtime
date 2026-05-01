'use client';

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth.store";

export function AuthBootstrap() {
  const initAuth = useAuthStore((state) => state.initAuth);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  return null;
}
