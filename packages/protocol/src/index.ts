import { z } from 'zod';
import { actionSchema, configSchema } from '@siteframe/shared-types';
export const scannerRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CAPTURE'),
    config: configSchema,
    resolveAssets: z.boolean().optional(),
  }),
  z.object({ type: z.literal('ACT'), action: actionSchema, config: configSchema }),
  z.object({ type: z.literal('PING') }),
  z.object({ type: z.literal('PICK_ELEMENT'), config: configSchema }),
]);
export type ScannerRequest = z.infer<typeof scannerRequestSchema>;
export type Response<T> = { ok: true; data: T } | { ok: false; error: string };
export const launchRequestSchema = z.object({
  type: z.literal('START_SCAN'),
  tabId: z.number().int(),
  config: configSchema,
});
