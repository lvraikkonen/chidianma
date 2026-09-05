import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PoiCandidate } from '@lunch/shared';
import { CandidateSchema } from './schemas.js';
import { OnboardingError } from './errors.js';
export interface PoiTicketSubject { groupId: string; membershipId: string; identityId: string; authVersion: number }
const domain = 'restaurant-poi-import/v1';
const ClaimsSchema = z.object({
  type: z.literal(domain), groupId: z.string().min(1), membershipId: z.string().min(1), identityId: z.string().min(1),
  authVersion: z.number().int().nonnegative(), exp: z.number().int().nonnegative(), candidate: CandidateSchema
}).strict();
const signature = (body: string, secret: string) => createHmac('sha256', secret).update(`${domain}.${body}`).digest('base64url');
export function signPoiTicket(candidate: Omit<PoiCandidate, 'ticket'>, subject: PoiTicketSubject, secret: string, now = Date.now()): string {
  const claims = ClaimsSchema.parse({ ...subject, type: domain, exp: now + 30 * 60_000, candidate });
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${signature(body, secret)}`;
}
export function verifyPoiTicket(ticket: string, subject: PoiTicketSubject, secret: string, now = Date.now()): Omit<PoiCandidate, 'ticket'> {
  const invalid = () => new OnboardingError('invalid_poi_ticket', 400, '搜索结果无效，请重新搜索');
  if (ticket.length > 8192) throw invalid();
  const pieces = ticket.split('.');
  const [body, supplied] = pieces;
  if (pieces.length !== 2 || !body || !supplied || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(supplied)) throw invalid();
  const expected = signature(body, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw invalid();
  let claims: z.infer<typeof ClaimsSchema>;
  try { claims = ClaimsSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))); }
  catch { throw invalid(); }
  if (claims.groupId !== subject.groupId || claims.membershipId !== subject.membershipId || claims.identityId !== subject.identityId || claims.authVersion !== subject.authVersion) throw invalid();
  if (claims.exp <= now) throw new OnboardingError('poi_ticket_expired', 400, '搜索结果已过期，请重新搜索');
  return claims.candidate;
}
