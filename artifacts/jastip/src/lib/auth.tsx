import { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, login as apiLogin, register as apiRegister, logout as apiLogout, User, LoginInput, RegisterInput } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react/custom-fetch";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("jaj_token"));
  const [, setLocation] = useLocation();

  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem("jaj_token"));
  }, []);

  const { data: user, isLoading: isUserLoading, refetch } = useGetMe({
    query: {
      queryKey: ["me"],
      enabled: !!token,
      retry: false,
    }
  });

  const isLoading = isUserLoading;

  const handleLogin = async (data: LoginInput) => {
    try {
      const response = await apiLogin(data);
      localStorage.setItem("jaj_token", response.token);
      setToken(response.token);
      await refetch();
      if (response.user.role === 'owner') setLocation('/owner/dashboard');
      else setLocation('/admin/dashboard');
    } catch (error) {
      throw error;
    }
  };

  const handleRegister = async (data: RegisterInput) => {
    try {
      const response = await apiRegister(data);
      localStorage.setItem("jaj_token", response.token);
      setToken(response.token);
      await refetch();
      setLocation('/admin/dashboard');
    } catch (error) {
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await apiLogout();
      }
    } finally {
      localStorage.removeItem("jaj_token");
      setToken(null);
      setLocation('/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user: user || null, token, isLoading, login: handleLogin, register: handleRegister, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
