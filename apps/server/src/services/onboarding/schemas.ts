import { z } from 'zod';
export const SearchCenterSchema = z.object({
  label: z.string().trim().min(1).max(500),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  coordinateSystem: z.literal('GCJ02')
}).strict();
export const GeocodeRequestSchema = z.object({ address: z.string().trim().min(1).max(500), city: z.string().trim().min(1).max(100).optional() }).strict();
export const SearchRequestSchema = z.object({
  center: SearchCenterSchema,
  keyword: z.string().trim().max(100).optional(),
  radius: z.number().int().min(500).max(5000).default(3000),
  page: z.number().int().min(1).max(3).default(1)
}).strict();
export const CandidateSchema = z.object({
  provider: z.enum(['mock', 'amap']), placeId: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200), address: z.string().trim().max(500),
  category: z.string().max(500).nullable(), latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(), coordinateSystem: z.literal('GCJ02'),
  distanceMeters: z.number().finite().min(0).nullable()
}).strict().refine((value) => (value.latitude === null) === (value.longitude === null));
