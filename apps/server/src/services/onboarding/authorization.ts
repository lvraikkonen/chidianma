import type { Prisma, PrismaClient } from '@prisma/client';
import type { AppEnv } from '../../env.js';
import { requireActiveMembership } from '../groups/memberships.js';
import { verifyGroupSessionToken } from '../auth/tokens.js';
import { isOnboardingEnabled } from '../features/groupCapabilities.js';
import { OnboardingError } from './errors.js';
import type { PoiTicketSubject } from './tickets.js';
export async function authorizeOnboarding(input: { prisma: PrismaClient | Prisma.TransactionClient; env: AppEnv; groupId: string; authorization?: string | undefined }): Promise<PoiTicketSubject> {
  const membership = await requireActiveMembership({ prisma: input.prisma, env: input.env, groupId: input.groupId, ...(input.authorization ? { authorization: input.authorization } : {}) });
  const claims = verifyGroupSessionToken(input.authorization!.slice('Bearer '.length), input.env.SESSION_SECRET);
  return { groupId: membership.groupId, identityId: membership.identityId, membershipId: membership.membershipId, authVersion: claims.authVersion };
}
export function requireOnboardingFeature(env: AppEnv, groupId: string, feature: 'bulk' | 'search' | 'save'): void {
  if (isOnboardingEnabled(env, groupId, feature)) return;
  const code = feature === 'bulk' ? 'restaurant_bulk_import_disabled' : feature === 'search' ? 'poi_search_disabled' : 'poi_save_disabled';
  throw new OnboardingError(code, 403, '此小组尚未开启此功能');
}
