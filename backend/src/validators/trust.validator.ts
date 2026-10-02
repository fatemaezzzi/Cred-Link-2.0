import { z } from 'zod';

export const trustStatusEnum = z.enum(['VERIFIED', 'SUSPENDED', 'REVOKED']);

export const registerTrustIssuerSchema = z
  .object({
    organizationId: z.string().uuid(),
    trustStatus: trustStatusEnum.default('VERIFIED'),
    verificationMetadata: z.record(z.string(), z.any()).optional().default({}),
  })
  .strict();

export const updateTrustStatusSchema = z
  .object({
    trustStatus: trustStatusEnum,
    reason: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const getTrustRegistryQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10))),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(50, Math.max(1, parseInt(val || '10', 10)))),
  trustStatus: trustStatusEnum.optional(),
  domain: z.enum(['college', 'employer', 'bank', 'hospital', 'network_admin']).optional(),
});

export const comprehensiveVerifySchema = z.object({
  credentialId: z.string().uuid().optional(),
  credentialPayload: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
  consentId: z.string().uuid().optional(),
  verifierOrgId: z.string().uuid().optional(),
});

export type RegisterTrustIssuerInput = z.infer<typeof registerTrustIssuerSchema>;
export type UpdateTrustStatusInput = z.infer<typeof updateTrustStatusSchema>;
export type GetTrustRegistryQuery = z.infer<typeof getTrustRegistryQuerySchema>;
export type ComprehensiveVerifyInput = z.infer<typeof comprehensiveVerifySchema>;
