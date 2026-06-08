import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          const data = snap.data() ?? {};
          setIsAdmin(data.isAdmin === true);
          setScanTokens(data.scanTokens ?? 3);
        } catch {
          setIsAdmin(false);
        }

        try {
          await rcLogIn(u.uid);
          const info = await getCustomerInfo();
          setIsPremium(hasEntitlement(info));
        } catch {}
      } else {
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
        setIsPremium(hasEntitlement(info));
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
