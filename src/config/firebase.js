import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            'AIzaSyAYsPSyjqsRQvyczKS4fi5vVhdEK4ga1cw',
  authDomain:        'macrodecide-62bec.firebaseapp.com',
  projectId:         'macrodecide-62bec',
  storageBucket:     'macrodecide-62bec.firebasestorage.app',
  messagingSenderId: '31289495581',
  appId:             '1:31289495581:web:a27bbf6edc028e914d36f4',
  measurementId:     'G-79T8M1B350',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export const db = getFirestore(app);
export { auth };
export default app;
