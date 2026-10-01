import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters long').optional(),
    phone: z.string().nullable().optional(),
    // Explicitly reject prohibited administrative fields if passed
    role: z.never({ message: 'Role modification is not permitted' }).optional(),
    email: z.never({ message: 'Email modification is not permitted via profile endpoint' }).optional(),
    accountStatus: z.never({ message: 'Account status modification is not permitted' }).optional(),
    id: z.never({ message: 'User ID cannot be altered' }).optional(),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
