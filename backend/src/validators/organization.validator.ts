import { z } from 'zod';

export const orgDomainEnum = z.enum(['college', 'employer', 'bank', 'hospital', 'network_admin']);

export const createOrganizationSchema = z
  .object({
    name: z.string().min(2, 'Organization name must be at least 2 characters long'),
    code: z.string().min(2, 'Code must be at least 2 characters').max(20, 'Code must not exceed 20 characters'),
    domain: orgDomainEnum,
    registrationRef: z.string().optional(),
    // Strictly forbid clients from passing privileged verification or issuer overrides
    verificationStatus: z.never({ message: 'Verification status cannot be self-assigned' }).optional(),
    isIssuer: z.never({ message: 'Issuer status cannot be self-assigned' }).optional(),
    authorizedCredentialTypes: z.never({ message: 'Credential types cannot be self-authorized' }).optional(),
    did: z.never({ message: 'DID is system-generated' }).optional(),
    id: z.never({ message: 'ID is system-generated' }).optional(),
  })
  .strict();

export const getOrganizationsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => Math.max(1, parseInt(val || '1', 10))),
  limit: z
    .string()
    .optional()
    .transform((val) => Math.min(50, Math.max(1, parseInt(val || '10', 10)))),
  domain: orgDomainEnum.optional(),
});

export type CreateOrgInput = z.infer<typeof createOrganizationSchema>;
export type GetOrgsQuery = z.infer<typeof getOrganizationsQuerySchema>;
