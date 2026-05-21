import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import app from './firebaseConfig';

export const COMMUNITY_COLLECTION = 'community_submissions';

export async function submitMenuToCommunity({ restaurantName, address, items }) {
  if (!process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error('Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* keys to your .env file.');
  }
  const db = getFirestore(app);
  const payload = {
    restaurantName: restaurantName.trim(),
    address:        address.trim(),
    items: items.map(i => ({
      name:     i.name,
      calories: Math.round((i.protein ?? 0) * 4 + (i.carbs ?? 0) * 4 + (i.fat ?? 0) * 9),
      protein:  Math.round((i.protein ?? 0) * 10) / 10,
      carbs:    Math.round((i.carbs   ?? 0) * 10) / 10,
      fat:      Math.round((i.fat     ?? 0) * 10) / 10,
    })),
    itemCount:   items.length,
    status:      'pending_review',
    submittedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COMMUNITY_COLLECTION), payload);
  return ref.id;
}
