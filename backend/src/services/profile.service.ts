import { supabaseAdmin } from '../config/supabase';
import { UpdateProfileInput } from '../validators/profile.validator';
import { AppError } from '../types';

export class ProfileService {
  /**
   * Retrieves profile details for the authenticated user ID.
   */
  async getProfile(userId: string) {
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, role, account_status, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      throw new AppError('Profile not found', 404);
    }

    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      phone: profile.phone,
      role: profile.role,
      accountStatus: profile.account_status,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }

  /**
   * Updates allowed profile fields for the authenticated user ID.
   */
  async updateProfile(userId: string, input: UpdateProfileInput) {
    const updatePayload: Record<string, any> = {};

    if (input.fullName !== undefined) {
      updatePayload.full_name = input.fullName;
    }
    if (input.phone !== undefined) {
      updatePayload.phone = input.phone;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new AppError('No valid profile fields provided for update', 400);
    }

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select('id, full_name, email, phone, role, account_status, created_at, updated_at')
      .single();

    if (error || !updatedProfile) {
      throw new AppError('Failed to update profile details', 500);
    }

    return {
      id: updatedProfile.id,
      fullName: updatedProfile.full_name,
      email: updatedProfile.email,
      phone: updatedProfile.phone,
      role: updatedProfile.role,
      accountStatus: updatedProfile.account_status,
      createdAt: updatedProfile.created_at,
      updatedAt: updatedProfile.updated_at,
    };
  }

  /**
   * Retrieves all active citizen profiles for authorized issuers to select as credential subjects.
   */
  async listCitizens() {
    const { data: citizens, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, role, account_status, created_at')
      .eq('role', 'CITIZEN')
      .eq('account_status', 'ACTIVE')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('[ProfileService] List citizens error:', error);
      throw new AppError('Failed to fetch citizen profiles', 500);
    }

    return (citizens || []).map((c) => ({
      id: c.id,
      fullName: c.full_name,
      email: c.email,
      phone: c.phone,
      role: c.role,
      accountStatus: c.account_status,
      createdAt: c.created_at,
    }));
  }
}

export const profileService = new ProfileService();
