import Purchases from 'react-native-purchases';

const RC_API_KEY = 'test_nSFEZdzhaPhqzdQrQztKqhpvCRz';

export function configure() {
  Purchases.configure({ apiKey: RC_API_KEY });
}

export async function logIn(userId) {
  return Purchases.logIn(userId);
}

export async function getOfferings() {
  const o = await Purchases.getOfferings();
  return o.current;
}

export async function purchasePackage(pkg) {
  return Purchases.purchasePackage(pkg);
}

export async function getCustomerInfo() {
  return Purchases.getCustomerInfo();
}

export function addCustomerInfoListener(callback) {
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => Purchases.removeCustomerInfoUpdateListener(callback);
}

export function hasEntitlement(customerInfo) {
  return !!customerInfo?.entitlements?.active?.['premium_access'];
}
