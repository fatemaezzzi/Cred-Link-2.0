'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { CredLinkLogo } from '../../../components/ui/CredLinkLogo';
import { useRoleContext } from '../../../hooks/useRoleContext';

export default function LoginPage() {
  const router = useRouter();
  const { login, error: authContextError, clearError, enterDemoMode } = useRoleContext();

  const [email, setEmail] = useState('admin@credlink.org');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    if (!email || !email.includes('@')) {
      setLocalError('Please enter a valid organization email address.');
      return;
    }

    if (password.length < 1) {
      setLocalError('Password is required.');
      return;
    }

    setIsLoading(true);
    try {
      const success = await login({ email, password });
      if (success) {
        router.push('/dashboard');
      } else {
        setLocalError('Invalid credentials. You can use Launch Demo Portal below.');
      }
    } catch (err: unknown) {
      enterDemoMode();
      router.push('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const displayError = authContextError || localError;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-4">
          <CredLinkLogo size="lg" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          CredLink Admin Portal
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-xs sm:max-w-sm mx-auto">
          Unified Citizen-Centric Digital Identity & Verifiable Credential Platform
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 py-8 px-6 sm:px-8 shadow-sm rounded-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <Input
              label="Organization Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@credlink.org"
              required
            />

            {/* Password Field */}
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-8.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-500 dark:border-slate-700 dark:bg-slate-800"
                />
                <span>Remember session</span>
              </label>
              <span className="text-slate-400 text-xs">Protected Portal</span>
            </div>

            {displayError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-400 rounded-md text-sm">
                {displayError}
              </div>
            )}

            {/* Submit Button */}
            <Button type="submit" isLoading={isLoading} className="w-full h-10 mt-2 gap-2 text-sm font-semibold">
              <span>Sign In to CredLink</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="relative my-3 flex items-center justify-center">
              <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
              <span className="bg-white dark:bg-slate-900 px-2.5 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Or Instant Preview
              </span>
            </div>

            <Button
              type="button"
              variant="forest"
              onClick={() => {
                enterDemoMode();
                router.push('/dashboard');
              }}
              className="w-full h-10 gap-2 text-sm font-semibold shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Launch Demo Portal (Direct Access)</span>
            </Button>
          </form>

          {/* Security Notice Footer */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <Badge variant="neutral" size="sm" className="text-xs uppercase font-mono tracking-wider">
              PROTECTED — SUPABASE AUTH JWT SESSION
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
