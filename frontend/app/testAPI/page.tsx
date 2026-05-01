'use client'
import { useAuthStore } from "@/stores/auth.store";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function Home() {
  const { logout, getProfile, accessToken, isHydrated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isHydrated) return;
    if (!accessToken) {
      router.replace("/signin");
    }
  }, [accessToken, isHydrated, router]);

  const handleSubmit = async () => {
    try {
      const user = await getProfile();
      console.log("User profile:", user);
      alert(JSON.stringify(user));
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.replace("/signin");
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <div className="border-2 flex justify-center items-center h-screen">
      <button
        onClick={handleSubmit}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
      >
        Call API
      </button>
      <button
        onClick={handleLogout}
        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 ml-4"
      >
        Logout
      </button>
    </div>
  );
}
