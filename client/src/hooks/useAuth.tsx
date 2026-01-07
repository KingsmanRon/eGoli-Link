import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, getAccessToken, clearTokens } from '../services/api';
import type { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  isTechnician: boolean;
  canUploadPDF: boolean;
  canManageJobs: boolean;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const userData = await authApi.getProfile();
      setUser(userData);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      clearTokens();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const logout = () => {
    clearTokens();
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const role = user?.role;
  const isAdmin = role === 'ADMIN';
  const isSupervisor = role === 'SUPERVISOR';
  const isTechnician = role === 'TECHNICIAN';
  const canUploadPDF = isAdmin || isSupervisor;
  const canManageJobs = isAdmin || isSupervisor;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        isSupervisor,
        isTechnician,
        canUploadPDF,
        canManageJobs,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
