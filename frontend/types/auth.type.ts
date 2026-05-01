import { User } from "./user.type";

export interface authState {
    accessToken: string | null;
    user: User | null;
    loading: boolean;
    isHydrated: boolean;

    setAccessToken: (accessToken: string | null) => void;
    setHydrated: (value: boolean) => void;
    clearState: () => void;
    register: (email: string, password: string) => Promise<void>;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    getProfile: () => Promise<User>;
    refresh: () => Promise<void>;
    initAuth: () => Promise<void>;
}