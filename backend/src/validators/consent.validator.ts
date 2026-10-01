import { z } from 'zod';

export const normalizeConsentDomain = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const lower = val.toLowerCase();
  if (lower === 'college' || lower === 'education') return 'education';
  if (lower === 'hospital' || lower === 'healthcare') return 'healthcare';
  if (lower === 'bank' || lower === 'finance') return 'finance';
  if (lower === 'employer' || lower === 'employment') return 'employment';
  if (lower === 'all') return 'all';
  return lower;
};

export const consentDomainEnum = z.preprocess(
  normalizeConsentDomain,
  z.enum(['education', 'employment', 'finance', 'healthcare', 'all'])
);
export const consentStatusEnum = z.enum(['PENDING', 'APPROVED', 'DENIED', 'REVOKED', 'EXPIRED']);

export const requestConsentSchema = z
  .object({
    citizenId: z.string().uuid(),
    requestingOrgId: z.string().uuid(),
    credentialId: z.string().uuid().optional().nullable(),
    domain: consentDomainEnum.default('all'),
    purpose: z.string().min(3, 'Purpose must be at least 3 characters long'),
    requestedClaims: z.array(z.string()).default([]),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export const grantConsentSchema = z
  .object({
    requestingOrgId: z.string().uuid(),
    credentialId: z.string().uuid().optional().nullable(),
    domain: consentDomainEnum.default('all'),
    purpose: z.string().min(3, 'Purpose must be at least 3 characters long'),
    approvedClaims: z.array(z.string()).default([]),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export const respondConsentSchema = z
  .object({
    action: z.enum(['APPROVE', 'DENY']),
    approvedClaims: z.array(z.string()).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .strict();

export const getConsentsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10))),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(50, Math.max(1, parseInt(val || '10', 10)))),
  status: consentStatusEnum.optional(),
  domain: consentDomainEnum.optional(),
  citizenId: z.string().uuid().optional(),
  requestingOrgId: z.string().uuid().optional(),
});

export const shareCredentialSchema = z
  .object({
    credentialId: z.string().uuid(),
    requestingOrgId: z.string().uuid(),
  })
  .strict();

export type RequestConsentInput = z.infer<typeof requestConsentSchema>;
export type GrantConsentInput = z.infer<typeof grantConsentSchema>;
export type RespondConsentInput = z.infer<typeof respondConsentSchema>;
export type GetConsentsQuery = z.infer<typeof getConsentsQuerySchema>;
export type ShareCredentialInput = z.infer<typeof shareCredentialSchema>;
