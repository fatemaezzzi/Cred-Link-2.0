import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { AppError } from '../types';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
  phone?: string;
  organizationId?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  token?: string;
}

/**
 * Authenticates requests by verifying the Supabase Bearer JWT token server-side.
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required. Missing Bearer token.', 401);
    }

    const token = authHeader.substring(7).trim();

    if (!token) {
      throw new AppError('Authentication required. Token payload is empty.', 401);
    }

    // Verify token using supported Supabase SDK method
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !authData.user) {
      throw new AppError('Invalid, revoked, or expired authentication token', 401);
    }

    const authUser = authData.user;

    // Retrieve corresponding user profile from DB
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, role, account_status')
      .eq('id', authUser.id)
      .single();

    if (profileError || !profile) {
      // Security: Do NOT silently default or downgrade to CITIZEN. Fail safely if profile is missing.
      throw new AppError('User profile not found. Please contact network administrator.', 403);
    }

    if (profile.account_status === 'SUSPENDED') {
      throw new AppError('Account is suspended. Access denied.', 403);
    }

    // Retrieve active organization membership if any
    const { data: membership } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', profile.id)
      .eq('status', 'ACTIVE')
      .maybeSingle();

    req.user = {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      fullName: profile.full_name,
      phone: profile.phone,
      organizationId: membership?.organization_id || null,
    };

    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
};
