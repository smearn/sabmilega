
import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, db } from "../../firebase";
import { Screen, ToastType, UserProfile } from "../../types";
import { ValidatedInput } from "../Shared/ValidatedInput";

const LoginScreen = ({ onNavigate, showToast }: { onNavigate: (s: Screen) => void, showToast: (m: string, t: ToastType) => void }) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIdentifier = identifier.trim();
    
    if (!cleanIdentifier || !password) {
        showToast("Please fill all fields", "error");
        return;
    }
    setLoading(true);

    try {
      let emailToLogin = cleanIdentifier;
      const isEmail = cleanIdentifier.includes("@") && !cleanIdentifier.startsWith("@");

      if (!isEmail) {
        // Username login
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        let foundUser: UserProfile | null = null;
        if (snapshot.exists()) {
          const users = snapshot.val();
          Object.values(users).forEach((u: any) => {
            if (u.username === cleanIdentifier || u.username === '@' + cleanIdentifier.replace('@','')) {
               foundUser = u;
            }
          });
        }
        if (foundUser) {
          emailToLogin = foundUser.email;
        } else {
          throw new Error("Username not found.");
        }
      }

      await signInWithEmailAndPassword(auth, emailToLogin, password);
      showToast("Login Successful!", "success");
    } catch (err: any) {
      showToast(err.message || "Login failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-blue-600/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-orange-600/20 rounded-full blur-3xl"></div>

      <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-8 border border-slate-800 animate-[fade-enter_0.4s_ease-out] relative z-10">
        <div className="text-center mb-8">
           <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">SM EARN</h1>
           <p className="text-slate-400 font-medium text-sm">Welcome Back!</p>
        </div>

        <form onSubmit={handleLogin}>
          <ValidatedInput
            label="Username or Email"
            value={identifier}
            onChange={setIdentifier}
            placeholder="e.g. @john or john@email.com"
            icon="fa-user"
            required
          />
          <ValidatedInput
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            icon="fa-lock"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-900/50 font-bold rounded-xl text-md px-5 py-4 text-center mt-4 transition-all transform active:scale-95 disabled:opacity-70"
          >
            {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : "LOGIN"}
          </button>
        </form>
        <p className="text-center mt-6 text-slate-400 font-medium text-xs">
          New user? <span onClick={() => onNavigate('register')} className="text-orange-500 cursor-pointer hover:underline font-bold">Create Account</span>
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;
