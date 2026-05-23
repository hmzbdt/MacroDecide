import { getFirestore, collection, addDoc } from 'firebase/firestore';
import app from '../config/firebase';

export const COMMUNITY_COLLECTION = 'community_submissions';

export async function submitMenuToCommunity({ restaurantName, address, items, uid }) {
  const db = getFirestore(app);
  const payload = {
    submittedByUid: uid ?? null,
    restaurantName: restaurantName.trim(),
    address:        address.trim(),
    menuData: items.map(i => ({
      name:    i.name,
      protein: i.protein ?? 0,
      carbs:   i.carbs   ?? 0,
      fat:     i.fat     ?? 0,
    })),
    status:    'pending_review',
    timestamp: new Date(),
  };
  const ref = await addDoc(collection(db, COMMUNITY_COLLECTION), payload);
  return ref.id;
}
