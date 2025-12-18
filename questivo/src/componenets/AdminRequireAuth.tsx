// src/components/AdminRequireAuth.tsx
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { api } from "../lib/api"; 
import { Loader2 } from "lucide-react"; 

export const AdminRequireAuth = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        // This call will now automatically send the Cookie
        await api.get("/verify"); 
        setIsAuthorized(true);
      } catch (error) {
        setIsAuthorized(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAdmin();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAuthorized) {
    return <Navigate to="/signin" replace />;
  }

  return <Outlet />;
};