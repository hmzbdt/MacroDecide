import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { subscribeAuthState } from '../services/firebaseService';
import {
  configure as configurePurchases,
  logIn as rcLogIn,
  addCustomerInfoListener,
  getCustomerInfo,
  hasEntitlement,
} from '../services/billingService';

const AuthContext = createContext(null);

// Initialize RevenueCat once at module load
try { configurePurchases(); } catch {}

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [isPremium,  setIsPremium]  = useState(false);
  const [scanTokens, setScanTokens] = useState(3);
  const isAdminRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeAuthState(async (u, profile) => {
      setUser(u);
      if (u) {
        const adminFlag = profile?.isAdmin === true;
        isAdminRef.current = adminFlag;
        setIsAdmin(adminFlag);
        setScanTokens(profile?.scanTokens ?? 3);
        if (adminFlag) setIsPremium(true);

        try {
          await rcLogIn(u.uid);
          const info = await getCustomerInfo();
          if (!isAdminRef.current) setIsPremium(hasEntitlement(info));
        } catch {}
      } else {
        isAdminRef.current = false;
        setIsAdmin(false);
        setIsPremium(false);
        setScanTokens(3);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Live RevenueCat entitlement listener
  useEffect(() => {
    let remove;
    try {
      remove = addCustomerInfoListener((info) => {
        if (!isAdminRef.current) setIsPremium(hasEntitlement(info));
      });
    } catch {}
    return () => { try { remove?.(); } catch {} };
  }, []);

  const signup = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  return (
    <AuthContext.Provider value={{
      user, loading, isAdmin,
      isPremium, setIsPremium,
      scanTokens, setScanTokens,
      signup, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
