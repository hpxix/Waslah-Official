import type { AccountProfile } from "./directus";

export type AuthUser = {
  id: string;
  email?: string;
  organizationId?: string;
  name: string;
  business: string;
  phone: string;
  avatarTone: string;
  verifiedPhone: boolean;
  freeCreditSar: number;
  createdAt: string;
  isAdmin: boolean;
};

export function createAvatarTone(name: string) {
  const tones = ["cedar", "sky", "rose", "lime"];
  const score = Array.from(name || "Wasla").reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return tones[score % tones.length];
}

export function accountToAuthUser(account: AccountProfile): AuthUser {
  return {
    id: account.id,
    email: account.email,
    organizationId: account.organization_id,
    name: account.name,
    business: account.business,
    phone: account.phone,
    avatarTone: createAvatarTone(account.avatar_seed || account.name),
    verifiedPhone: account.phone_verified,
    freeCreditSar: account.wallet.balance,
    createdAt: account.created_at,
    isAdmin: account.is_admin,
  };
}
