import { useAuthStore } from '@/stores/auth.store';
import axios from 'axios';

// tao ra instance axios với cấu hình mặc định
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_API_URL : '/api', // URL cơ sở cho tất cả yêu cầu
  timeout: 8000, // thời gian chờ tối đa cho mỗi yêu cầu (ms)
  withCredentials: true, // gửi cookie cùng với yêu cầu
});

let refreshPromise: Promise<string> | null = null;

// Set token (clean, không phụ thuộc Zustand)
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// tự động gọi refresh api khi access token hết hạn
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url ?? "";

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // những api không cần check
    if (
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register") ||
      requestUrl.includes("/auth/refresh-token")
    ) {
      return Promise.reject(error);
    }

    originalRequest._retryCount = originalRequest._retryCount || 0;

    if (error.response?.status === 401 && originalRequest._retryCount < 4) {
      originalRequest._retryCount += 1;

      try {
        if (!refreshPromise) {
          refreshPromise = api
            .post("/auth/refresh-token", {}, { withCredentials: true })
            .then((res) => res.data.accessToken as string)
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newAccessToken = await refreshPromise;

        useAuthStore.getState().setAccessToken(newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().clearState();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

