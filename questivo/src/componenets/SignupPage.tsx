import { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";

import axios from "axios";
import toast, { Toaster } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import { FaFacebook } from "react-icons/fa";
import { motion } from "framer-motion";

// 1. IMPORT GOOGLE HOOK
import { useGoogleLogin } from "@react-oauth/google"; 

/* ================= TYPES ================= */

type Variant = "LOGIN" | "SIGNUP" | "FORGOT_PASSWORD";
type LoginMethod = "PASSWORD" | "OTP";
type AuthStep = 1 | 2; // 1 = Input Details, 2 = Verify OTP

interface AuthData {
  name?: string;
  email: string;
  password?: string;
  otp?: string;
  newPassword?: string;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: any;
}

/* ================= CONFIG ================= */
const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
  (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
  "http://localhost:4000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

/* ================= COMPONENT ================= */

const Signup = () => {
  const navigate = useNavigate();

  // --- STATE MANAGEMENT ---
  const [variant, setVariant] = useState<Variant>("LOGIN");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("PASSWORD");
  const [step, setStep] = useState<AuthStep>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [data, setData] = useState<AuthData>({
    name: "",
    email: "",
    password: "",
    otp: "",
    newPassword: "",
  });

  // --- CHECK AUTH ON MOUNT ---
  useEffect(() => {
    let mounted = true;
    const checkAuth = async () => {
      try {
        const res = await api.get("/api/auth/me");
        if (mounted && res.data?.user) {
          navigate("/", { replace: true });
        }
      } catch {
        // Not logged in
      }
    };
    checkAuth();
    return () => { mounted = false; };
  }, [navigate]);


  // --- HANDLERS ---
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setData({ ...data, [e.target.name]: e.target.value });
  };

  const toggleVariant = () => {
    if (variant === "LOGIN") setVariant("SIGNUP");
    else setVariant("LOGIN");
    
    // Reset states
    setLoginMethod("PASSWORD");
    setStep(1);
    setData((prev) => ({ ...prev, otp: "", password: "", newPassword: "" }));
  };

  const switchToForgotPass = () => {
    setVariant("FORGOT_PASSWORD");
    setStep(1);
    setData((prev) => ({ ...prev, otp: "", newPassword: "" }));
  };

  const toggleLoginMethod = () => {
    setLoginMethod(loginMethod === "PASSWORD" ? "OTP" : "PASSWORD");
    setStep(1);
    setData((prev) => ({ ...prev, otp: "", password: "" }));
  };

  // 2. GOOGLE LOGIN LOGIC
  // This function opens the popup, gets the token, and sends it to your backend
  const loginWithGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        // Send the access token to your backend controller
        // IMPORTANT: Ensure your backend route is exactly '/api/auth/google'
        const res = await api.post("/api/auth/oauth/google", { 
          accessToken: tokenResponse.access_token 
        });

        if (res.data.success) {
          finalizeAuth();
        }
      } catch (err) {
        console.error(err);
        toast.error("Google Login Failed");
      }
    },
    onError: () => {
      toast.error("Google Login Failed");
    }
  });

  const handleFacebookAuth = () => {
    toast.loading("Redirecting to Facebook...");
    // Facebook impl would go here
  };

  // --- API CALLS ---
  const handlePasswordLogin = async () => {
    const res = await api.post<ApiResponse>("/api/auth/signin", {
      email: data.email,
      password: data.password,
    });
    if (res.data.success) finalizeAuth();
  };

  const handleSendLoginOtp = async () => {
    const res = await api.post<ApiResponse>("/api/auth/signin/otp", { email: data.email });
    if (res.data.success) {
      toast.success(`OTP sent to ${data.email}`);
      setStep(2);
    }
  };

  const handleVerifyLoginOtp = async () => {
    const res = await api.post<ApiResponse>("/api/auth/signin/otp/verify", {
      email: data.email,
      otp: data.otp,
    });
    if (res.data.success) finalizeAuth();
  };

  const handleSignupInit = async () => {
    const res = await api.post<ApiResponse>("/api/auth/signup", {
      name: data.name,
      email: data.email,
      password: data.password,
    });
    if (res.data.success) {
      toast.success("Account created! Check email for OTP.");
      setStep(2);
    }
  };

  const handleVerifySignupOtp = async () => {
    const res = await api.post<ApiResponse>("/api/auth/signup/verify-otp", {
      email: data.email,
      otp: data.otp,
    });
    if (res.data.success) finalizeAuth();
  };

  // --- FORGOT PASSWORD HANDLERS ---
  const handleForgotPassInit = async () => {
    const res = await api.post<ApiResponse>("/api/auth/password/reset", { email: data.email });
    if (res.data.success) {
      toast.success(`Reset code sent to ${data.email}`);
      setStep(2);
    }
  };

  const handleForgotPassVerify = async () => {
    if (!data.otp) return toast.error("Please enter OTP");
    if (!data.newPassword) return toast.error("Please enter new password");

    const payload = {
      email: data.email.trim().toLowerCase(),
      otp: String(data.otp),   
      newPassword: data.newPassword,
    };

    const res = await api.post<ApiResponse>(
      "/api/auth/password/reset/verify",
      payload
    );

    if (res.data.success) {
      toast.success("Password reset successful! Please login.");
      setVariant("LOGIN");
      setLoginMethod("PASSWORD");
      setStep(1);
      setData(prev => ({ ...prev, password: "", otp: "", newPassword: "" }));
    }
  };

  // --- FINALIZATION ---
  const finalizeAuth = () => {
    toast.success("Welcome!");
    setTimeout(() => navigate("/", { replace: true }), 500);
  };

  // --- FORM SUBMISSION ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (variant === "SIGNUP") {
        if (step === 1) await handleSignupInit();
        else await handleVerifySignupOtp();
      } else if (variant === "FORGOT_PASSWORD") {
        if (step === 1) await handleForgotPassInit();
        else await handleForgotPassVerify();
      } else {
        // LOGIN
        if (loginMethod === "PASSWORD") await handlePasswordLogin();
        else {
          if (step === 1) await handleSendLoginOtp();
          else await handleVerifyLoginOtp();
        }
      }
    } catch (error: any) {
      console.error(error);
      const msg = error.response?.data?.message || "Something went wrong";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER HELPERS ---
  const getTitle = () => {
    if (variant === "FORGOT_PASSWORD") return "Reset Password";
    if (variant === "SIGNUP") return "Create Account";
    return "Welcome Back";
  };

  const getSubtitle = () => {
    if (variant === "FORGOT_PASSWORD") return step === 1 ? "Enter email to receive code" : "Set your new password";
    if (variant === "SIGNUP") return "Join us for free";
    return loginMethod === "OTP" ? "Login without password" : "Enter credentials to login";
  };

  const getButtonText = () => {
    if (isLoading) return "Processing...";
    if (variant === "FORGOT_PASSWORD") return step === 1 ? "Send Reset Code" : "Reset Password";
    if (variant === "SIGNUP") return step === 1 ? "Sign Up" : "Verify Email";
    if (loginMethod === "OTP") return step === 1 ? "Send Login Code" : "Verify & Login";
    return "Sign In";
  };

  return (
    <div className="min-h-screen w-full bg-[url('https://images.unsplash.com/photo-1497294815431-9365093b7331?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80')] bg-cover bg-center flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-0"></div>
      <Toaster position="top-center" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          
          {/* HEADER */}
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-800 tracking-tight">{getTitle()}</h2>
            <p className="text-gray-500 mt-2 text-sm">{getSubtitle()}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* NAME INPUT (Signup Only) */}
            {variant === "SIGNUP" && step === 1 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                <input
                  name="name"
                  type="text"
                  required
                  value={data.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white outline-none"
                  placeholder="Full Name"
                />
              </motion.div>
            )}

            {/* EMAIL INPUT (Always Step 1) */}
            {step === 1 && (
              <input
                name="email"
                type="email"
                required
                value={data.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white outline-none"
                placeholder="Email address"
              />
            )}

            {/* PASSWORD INPUT (Login or Signup) */}
            {step === 1 && variant !== "FORGOT_PASSWORD" && (variant === "SIGNUP" || loginMethod === "PASSWORD") && (
              <div className="relative">
                <input
                  name="password"
                  type="password"
                  required
                  value={data.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white outline-none"
                  placeholder="Password"
                />
                
                {/* LOGIN OPTIONS LINKS */}
                {variant === "LOGIN" && (
                  <div className="flex justify-between items-center mt-2 px-1">
                      <button
                       type="button"
                       onClick={switchToForgotPass}
                       className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
                     >
                       Forgot Password?
                     </button>
                    <button
                      type="button"
                      onClick={toggleLoginMethod}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      Login with OTP
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* OTP TOGGLE BACK TO PASSWORD */}
            {variant === "LOGIN" && loginMethod === "OTP" && step === 1 && (
              <div className="text-right -mt-2">
                <button
                  type="button"
                  onClick={toggleLoginMethod}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  Use Password instead
                </button>
              </div>
            )}

            {/* OTP & NEW PASSWORD INPUTS (Step 2) */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <input
                  name="otp"
                  type="text"
                  maxLength={6}
                  required
                  value={data.otp}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-center text-2xl tracking-[0.5em] font-bold rounded-lg border-2 border-indigo-500 bg-white text-gray-800 outline-none"
                  placeholder="000000"
                />
                
                {/* New Password Field (Only for Forgot Password flow) */}
                {variant === "FORGOT_PASSWORD" && (
                   <input
                    name="newPassword"
                    type="password"
                    required
                    value={data.newPassword}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 focus:border-indigo-500 focus:bg-white outline-none"
                    placeholder="Enter new password"
                  />
                )}

                <p className="text-center text-sm text-gray-500">
                  Enter the code sent to <span className="font-semibold">{data.email}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="block w-full text-center text-xs text-indigo-500 hover:underline"
                >
                  Change Email Address
                </button>
              </motion.div>
            )}

            {/* MAIN ACTION BUTTON */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                getButtonText()
              )}
            </button>
          </form>

          {/* SOCIAL LOGIN (Only Step 1 & NOT Forgot Password) */}
          {step === 1 && variant !== "FORGOT_PASSWORD" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
              <div className="relative mt-8 mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <div className="grid  gap-4">
                {/* 3. ATTACH THE GOOGLE LOGIN TRIGGER */}
                <button onClick={() => loginWithGoogle()} className="flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors bg-white shadow-sm">
                  <FcGoogle size={22} />
                  <span className="ml-2 text-sm font-medium text-gray-700">Google</span>
                </button>
                {/* <button onClick={handleFacebookAuth} className="flex items-center justify-center px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors bg-white shadow-sm">
                  <FaFacebook size={22} className="text-[#1877F2]" />
                  <span className="ml-2 text-sm font-medium text-gray-700">Facebook</span>
                </button> */}
              </div>
            </motion.div>
          )}

          {/* FOOTER TOGGLE */}
          <div className="mt-8 text-center text-sm text-gray-600">
            {variant === "FORGOT_PASSWORD" ? (
                <button onClick={toggleVariant} className="font-semibold text-indigo-600 hover:underline">
                    Back to Login
                </button>
            ) : (
                <>
                    {variant === "LOGIN" ? "New here? " : "Already have an account? "}
                    <button
                    onClick={toggleVariant}
                    className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline decoration-2 underline-offset-2 transition-all"
                    >
                    {variant === "LOGIN" ? "Create an account" : "Log in"}
                    </button>
                </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;