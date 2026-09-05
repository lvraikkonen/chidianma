import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import { normalizeRestaurantText, type RestaurantImportResponse, type RestaurantImportRowResult } from '@lunch/shared';
import type { AppEnv } from '../../env.js';
import { authorizeOnboarding, requireOnboardingFeature } from './authorization.js';
import { OnboardingError } from './errors.js';
import { verifyPoiTicket } from './tickets.js';
const Identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const EnvelopeSchema = z.object({
  requestId: Identifier,
  rows: z.array(z.object({ rowId: Identifier, kind: z.enum(['manual', 'poi']) }).passthrough()).min(1).max(60)
}).strict().refine(value => new Set(value.rows.map(row => row.rowId)).size === value.rows.length);
const ManualRowSchema = z.object({
  rowId: Identifier, kind: z.literal('manual'), name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).default(''), confirmSeparateBranch: z.boolean().default(false)
}).strict();
const PoiRowSchema = z.object({ rowId: Identifier, kind: z.literal('poi'), ticket: z.string().min(1).max(8192), confirmSeparateBranch: z.boolean().default(false) }).strict();
// JSON object order is immaterial; row order and row IDs are part of the caller's receipt.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function importRestaurants(input: {
  prisma: PrismaClient; env: AppEnv; groupId: string; authorization?: string | undefined; body: unknown; now?: Date;
}): Promise<RestaurantImportResponse> {
  await authorizeOnboarding(input);
  const parsed = EnvelopeSchema.safeParse(input.body);
  if (!parsed.success) throw new OnboardingError('invalid_import_request', 400, '请提供有效请求编号和1至60条带唯一行编号的记录');
  const request = parsed.data;
  if (request.rows.some(row => row.kind === 'manual')) requireOnboardingFeature(input.env, input.groupId, 'bulk');
  if (request.rows.some(row => row.kind === 'poi')) requireOnboardingFeature(input.env, input.groupId, 'save');
  const hash = createHash('sha256').update(canonical(request)).digest('hex');
  return input.prisma.$transaction(async tx => {
    // A row lock provides cross-process serialization; READ COMMITTED observes the previous import after the lock.
    await tx.$queryRaw`SELECT id FROM lunch_groups WHERE id = ${input.groupId} FOR UPDATE`;
    const subject = await authorizeOnboarding({ ...input, prisma: tx });
    const key = { groupId: input.groupId, membershipId: subject.membershipId, requestId: request.requestId };
    const receipt = await tx.restaurantImportReceipt.findUnique({ where: { groupId_membershipId_requestId: key } });
    if (receipt) {
      if (receipt.requestHash !== hash) throw new OnboardingError('import_request_conflict', 409, '此请求编号已用于不同内容，请使用新的请求编号');
      return receipt.result as unknown as RestaurantImportResponse;
    }
    const now = input.now ?? new Date();
    const existing = await tx.restaurant.findMany({ where: { groupId: input.groupId }, select: { id: true, name: true, address: true, sourceProvider: true, sourcePlaceId: true } });
    const results: RestaurantImportRowResult[] = [];
    for (const raw of request.rows) {
      try {
        let data: Prisma.RestaurantUncheckedCreateInput;
        let separateBranch: boolean;
        if (raw.kind === 'manual') {
          const row = ManualRowSchema.safeParse(raw);
          if (!row.success) throw new OnboardingError('invalid_row', 400, '请检查餐馆名称、地址和分店确认');
          separateBranch = row.data.confirmSeparateBranch;
          data = { groupId: input.groupId, name: row.data.name, address: row.data.address || null, tags: [], createdByMembershipId: subject.membershipId };
        } else {
          const row = PoiRowSchema.safeParse(raw);
          if (!row.success) throw new OnboardingError('invalid_row', 400, '请重新选择有效的搜索结果');
          separateBranch = row.data.confirmSeparateBranch;
          const candidate = verifyPoiTicket(row.data.ticket, subject, input.env.POI_TICKET_SECRET ?? '', now.getTime());
          data = { groupId: input.groupId, name: candidate.name, address: candidate.address || null, tags: [], createdByMembershipId: subject.membershipId,
            sourceProvider: candidate.provider, sourcePlaceId: candidate.placeId, sourceCategory: candidate.category,
            sourceLatitude: candidate.latitude, sourceLongitude: candidate.longitude, sourceCoordinateSystem: candidate.coordinateSystem, sourceImportedAt: now };
        }
        const sourceMatch = data.sourceProvider && data.sourcePlaceId
          ? existing.find(item => item.sourceProvider === data.sourceProvider && item.sourcePlaceId === data.sourcePlaceId) : undefined;
        const sameName = existing.filter(item => normalizeRestaurantText(item.name) === normalizeRestaurantText(data.name));
        const address = normalizeRestaurantText(data.address ?? '');
        const match = sourceMatch ?? sameName.find(item => normalizeRestaurantText(item.address ?? '') === address);
        if (match) {
          results.push({ rowId: raw.rowId, status: 'existing', code: 'duplicate', message: '小组已收录，保留现有记录', restaurantId: match.id });
          continue;
        }
        if (!separateBranch && sameName.some(item => !address || !normalizeRestaurantText(item.address ?? ''))) {
          throw new OnboardingError('ambiguous_branch', 400, '同名餐馆地址不完整，请补充地址或确认是另一家分店');
        }
        const restaurant = await tx.restaurant.create({ data });
        existing.push(restaurant);
        results.push({ rowId: raw.rowId, status: 'created', code: 'created', message: '已收录', restaurantId: restaurant.id });
      } catch (error) {
        if (!(error instanceof OnboardingError)) throw error;
        results.push({ rowId: raw.rowId, status: 'rejected', code: error.code, message: error.message });
      }
    }
    const result: RestaurantImportResponse = { requestId: request.requestId, results };
    await tx.restaurantImportReceipt.create({ data: { ...key, requestHash: hash, result: result as unknown as Prisma.InputJsonValue } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 15_000, timeout: 20_000 });
}
