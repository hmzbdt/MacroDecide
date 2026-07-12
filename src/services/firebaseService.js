import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, increment, getDoc,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// ─── Auth state ───────────────────────────────────────────────────────────
// Wraps onAuthStateChanged + the /users/{uid} profile fetch (isAdmin, scanTokens).
// onChange receives (user, profile) where profile is null when signed out.
export function subscribeAuthState(onChange) {
  return onAuthStateChanged(auth, async (u) => {
    if (!u) { onChange(u, null); return; }
    try {
      const snap = await getDoc(doc(db, 'users', u.uid));
      onChange(u, snap.data() ?? {});
    } catch {
      onChange(u, {});
    }
  });
}

// ─── Meal history ─────────────────────────────────────────────────────────
export function subscribeMealHistory(uid, onData, onError) {
  const q = query(
    collection(db, 'meal_history'),
    where('uid', '==', uid),
    orderBy('timestamp', 'desc'),
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    onError,
  );
}

export function logMealEntries(entries, uid) {
  entries.forEach(e => addDoc(collection(db, 'meal_history'), { ...e, uid }));
}

export function deleteMealEntry(id) {
  return deleteDoc(doc(db, 'meal_history', id));
}

// ─── Scan tokens ──────────────────────────────────────────────────────────
export function decrementScanToken(uid) {
  return updateDoc(doc(db, 'users', uid), { scanTokens: increment(-1) }).catch(() => {});
}
