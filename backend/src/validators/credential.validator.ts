import { z } from 'zod';

export const normalizeCredentialDomain = (val: unknown) => {
  if (typeof val !== 'string') return val;
  const lower = val.toLowerCase();
  if (lower === 'college' || lower === 'education') return 'education';
  if (lower === 'hospital' || lower === 'healthcare') return 'healthcare';
  if (lower === 'bank' || lower === 'finance') return 'finance';
  if (lower === 'employer' || lower === 'employment') return 'employment';
  return lower;
};

export const credentialDomainEnum = z.preprocess(
  normalizeCredentialDomain,
  z.enum(['education', 'employment', 'finance', 'healthcare'])
);
export const credentialStatusEnum = z.enum(['VALID', 'REVOKED', 'EXPIRED']);

export const createCredentialSchema = z
  .object({
    subjectId: z.string().uuid(),
    issuerOrgId: z.string().uuid(),
    domain: credentialDomainEnum,
    credentialType: z.string().min(2, 'Credential type must be at least 2 characters long'),
    title: z.string().min(2, 'Credential title must be at least 2 characters long'),
    claims: z.union([z.record(z.string(), z.any()), z.array(z.any())]),
    expirationDate: z.string().datetime().optional().nullable(),
    // Forbid client override of system-controlled fields
    status: z.never({ message: 'Credential status cannot be self-assigned' }).optional(),
    issuerSignature: z.never({ message: 'Issuer signature is system-generated' }).optional(),
    qrPayload: z.never({ message: 'QR payload is system-generated' }).optional(),
    issuanceDate: z.never({ message: 'Issuance date is system-generated' }).optional(),
    id: z.never({ message: 'ID is system-generated' }).optional(),
  })
  .strict();

export const getCredentialsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10))),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(50, Math.max(1, parseInt(val || '10', 10)))),
  domain: credentialDomainEnum.optional(),
  status: credentialStatusEnum.optional(),
  subjectId: z.string().uuid().optional(),
  issuerOrgId: z.string().uuid().optional(),
});

export const revokeCredentialSchema = z
  .object({
    reason: z.string().min(3, 'Revocation reason must be at least 3 characters long'),
  })
  .strict();

export const verifyCredentialSchema = z.object({
  credentialId: z.string().uuid().optional(),
  credentialPayload: z.record(z.string(), z.any()).optional(),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type GetCredentialsQuery = z.infer<typeof getCredentialsQuerySchema>;
export type RevokeCredentialInput = z.infer<typeof revokeCredentialSchema>;
export type VerifyCredentialInput = z.infer<typeof verifyCredentialSchema>;
