'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Building2, UserPlus, CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { CredLinkLogo } from '../../../components/ui/CredLinkLogo';
import { apiClient } from '../../../../../../packages/api-client';

type AccountRole = 'CITIZEN' | 'COLLEGE' | 'HOSPITAL' | 'BANK' | 'EMPLOYER';

const ROLE_OPTIONS: { value: AccountRole; label: string; description: string }[] = [
  { value: 'CITIZEN', label: 'Citizen', description: 'Individual credential holder' },
  { value: 'COLLEGE', label: 'College / University', description: 'Issue academic credentials' },
  { value: 'HOSPITAL', label: 'Hospital / Healthcare', description: 'Issue medical credentials' },
  { value: 'BANK', label: 'Bank / Finance', description: 'Verify financial credentials' },
  { value: 'EMPLOYER', label: 'Employer', description: 'Verify employment credentials' },
];

const DOMAIN_MAP: Record<string, string> = {
  COLLEGE: 'college',
  HOSPITAL: 'hospital',
  BANK: 'bank',
  EMPLOYER: 'employer',
};

export default function RegisterPage() {
  const router = useRouter();

  // Step 1: Account
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<AccountRole>('CITIZEN');

  // Step 2: Organization (for non-CITIZEN roles)
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');

  // UI state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const needsOrg = role !== 'CITIZEN';

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!email || !email.includes('@')) { setError('Please enter a valid email address.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }

    if (needsOrg) {
      // Go to step 2 for organization setup
      setStep(2);
    } else {
      // Citizens: register immediately
      await registerAccount();
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!orgName.trim()) { setError('Organization name is required.'); return; }
    if (!orgCode.trim() || orgCode.trim().length < 2) { setError('Organization code must be at least 2 characters.'); return; }

    await registerAccount();
  };

  const registerAccount = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Step 1: Create user account
      const regRes = await apiClient.register({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
      });

      if (!regRes.success || !regRes.data) {
        setError(regRes.error || 'Registration failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Store auth token
      const token = regRes.data.session?.access_token;
      if (token) {
        localStorage.setItem('credlink_auth_token', token);
        apiClient.setToken(token);
      }

      // Step 2: Create organization (if non-CITIZEN)
      if (needsOrg && orgName.trim() && orgCode.trim()) {
        try {
          const orgRes = await apiClient.createOrganization({
            name: orgName.trim(),
            code: orgCode.trim().toUpperCase(),
            domain: DOMAIN_MAP[role] || 'college',
          });

          if (!orgRes.success) {
            // Account created but org failed — still let them through
            console.warn('Organization creation failed:', orgRes.error);
          }
        } catch (orgErr) {
          console.warn('Organization creation error:', orgErr);
          // Account is created, they can set up org later
        }
      }

      setStep(3); // Success step

      // Redirect to dashboard after a brief delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <CredLinkLogo size="lg" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Create Account
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xs sm:max-w-sm mx-auto">
          Join the CredLink Verifiable Credential Network
        </p>

        {/* Step indicator */}
        {needsOrg && step < 3 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 1 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
              <UserPlus className="w-3.5 h-3.5" />
              Account
            </div>
            <div className="w-8 h-px bg-slate-300 dark:bg-slate-700" />
            <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 2 ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>
              <Building2 className="w-3.5 h-3.5" />
              Organization
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 py-8 px-6 sm:px-8 shadow-sm rounded-xl">

          {/* ──── Step 3: Success ──── */}
          {step === 3 && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Account Created!</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Redirecting to dashboard...
              </p>
            </div>
          )}

          {/* ──── Step 1: Account Details ──── */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <Input
                label="Full Name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Rajesh Kumar"
                required
              />

              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institution.edu"
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />

              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Account Type
                </label>
                <div className="space-y-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        role === opt.value
                          ? 'border-slate-900 bg-slate-50 dark:border-slate-400 dark:bg-slate-800'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        value={opt.value}
                        checked={role === opt.value}
                        onChange={() => setRole(opt.value)}
                        className="sr-only"
                      />
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        role === opt.value ? 'border-slate-900 dark:border-slate-300' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {role === opt.value && (
                          <div className="w-2 h-2 rounded-full bg-slate-900 dark:bg-slate-300" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{opt.label}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 rounded-md text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" isLoading={isLoading} className="w-full h-10 mt-2 gap-2 text-sm font-semibold">
                <span>{needsOrg ? 'Next: Organization Setup' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          )}

          {/* ──── Step 2: Organization Setup ──── */}
          {step === 2 && (
            <form onSubmit={handleStep2} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                <strong>Organization Setup</strong> — Register your institution to start issuing or verifying credentials on the CredLink network.
              </div>

              <Input
                label="Organization Name"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Mumbai University"
                required
              />

              <Input
                label="Organization Code"
                type="text"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                placeholder="e.g. MU-001"
                required
              />

              <div className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
                Domain: <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{DOMAIN_MAP[role]}</span> (auto-set from account type)
              </div>

              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 rounded-md text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => { setStep(1); setError(''); }}
                  className="flex-1 h-10 gap-2 text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </Button>
                <Button type="submit" isLoading={isLoading} className="flex-1 h-10 gap-2 text-sm font-semibold">
                  <span>Create Account & Org</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </form>
          )}

          {/* Footer */}
          {step < 3 && (
            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Already have an account?{' '}
                <Link href="/login" className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                  Sign In
                </Link>
              </p>
              <Badge variant="neutral" size="sm" className="text-xs uppercase font-mono tracking-wider">
                PROTECTED — SUPABASE AUTH JWT SESSION
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
