import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import type { PoiGeocodeResponse, PoiSearchResponse } from '@lunch/shared';
import type { AppEnv } from '../env.js';
import { prisma } from '../plugins/prisma.js';
import { AuthError } from '../services/auth/errors.js';
import { authorizeOnboarding, requireOnboardingFeature } from '../services/onboarding/authorization.js';
import { OnboardingError, requestCancelled } from '../services/onboarding/errors.js';
import { importRestaurants } from '../services/onboarding/import.js';
import { AmapPoiProvider, MockPoiProvider } from '../services/onboarding/provider.js';
import { GeocodeRequestSchema, SearchRequestSchema } from '../services/onboarding/schemas.js';
import { signPoiTicket } from '../services/onboarding/tickets.js';

export async function registerGroupOnboardingRoutes(app: FastifyInstance, env: AppEnv) {
  const providerId = env.POI_PROVIDER ?? 'mock';
  const provider = providerId === 'amap' ? new AmapPoiProvider(env.AMAP_WEB_SERVICE_KEY ?? '') : new MockPoiProvider();
  const attribution = providerId === 'amap' ? '数据来源：高德地图' : '模拟数据，仅供测试';
  for (const operation of ['geocode', 'search'] as const) {
    app.post<{ Params: { groupId: string }; Body: unknown }>(`/api/groups/:groupId/poi/${operation}`, {
      bodyLimit: 16_384,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
    }, async (request, reply) => {
      const controller = new AbortController();
      const cancelled = () => { if (!reply.raw.writableEnded) controller.abort(); };
      request.raw.on('aborted', cancelled);
      reply.raw.on('close', cancelled);
      try {
        const subject = await authorizeOnboarding({ prisma, env, groupId: request.params.groupId, authorization: request.headers.authorization });
        requireOnboardingFeature(env, request.params.groupId, 'search');
        if (operation === 'geocode') {
          const input = GeocodeRequestSchema.parse(request.body);
          const centers = await provider.geocode(input, controller.signal);
          if (controller.signal.aborted) throw requestCancelled();
          request.log.info({ operation: 'poi_geocode', groupId: subject.groupId, provider: providerId, resultCount: centers.length }, 'poi_completed');
          return { provider: providerId, attribution, centers } satisfies PoiGeocodeResponse;
        }
        const input = SearchRequestSchema.parse(request.body);
        const result = await provider.search(input, controller.signal);
        if (controller.signal.aborted) throw requestCancelled();
        const candidates = result.candidates.map(candidate => ({ ...candidate, ticket: signPoiTicket(candidate, subject, env.POI_TICKET_SECRET ?? '') }));
        request.log.info({ operation: 'poi_search', groupId: subject.groupId, provider: providerId, resultCount: candidates.length }, 'poi_completed');
        return { provider: providerId, attribution, page: input.page, radius: input.radius, hasMore: result.hasMore, candidates } satisfies PoiSearchResponse;
      } catch (error) {
        if (error instanceof OnboardingError) request.log.info({ operation: `poi_${operation}`, groupId: request.params.groupId, provider: providerId, errorCode: error.code }, 'poi_failed');
        return sendOnboardingError(reply, error);
      } finally {
        request.raw.off('aborted', cancelled);
        reply.raw.off('close', cancelled);
      }
    });
  }
  app.post<{ Params: { groupId: string }; Body: unknown }>('/api/groups/:groupId/restaurants/import', {
    bodyLimit: 600_000,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    try {
      const result = await importRestaurants({ prisma, env, groupId: request.params.groupId, authorization: request.headers.authorization, body: request.body });
      request.log.info({ operation: 'restaurant_import', groupId: request.params.groupId,
        createdCount: result.results.filter(row => row.status === 'created').length,
        existingCount: result.results.filter(row => row.status === 'existing').length,
        rejectedCount: result.results.filter(row => row.status === 'rejected').length
      }, 'restaurant_import_completed');
      return result;
    } catch (error) { return sendOnboardingError(reply, error); }
  });
}
function sendOnboardingError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    reply.code(error.code === 'unauthorized' ? 401 : error.code === 'forbidden' ? 403 : 400);
    return { error: error.error, message: error.message };
  }
  if (error instanceof OnboardingError) {
    reply.code(error.statusCode);
    return { error: error.code, message: error.message };
  }
  if (error instanceof ZodError) {
    reply.code(400);
    return { error: 'invalid_poi_request', message: '请检查搜索地址、中心、半径和页码' };
  }
  throw error;
}
