'use client';

import React from 'react';
import Link from 'next/link';
import { Shield } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { CredLinkLogo } from '../ui/CredLinkLogo';

export function LandingFooter() {
  return (
    <footer className="bg-slate-900 text-slate-300 dark:bg-slate-950 py-12 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <Link href="/" className="flex items-center group">
              <CredLinkLogo size="sm" showText subtitle="Cross-Domain Digital Identity Network" />
            </Link>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Cross-domain verifiable digital identity and record network connecting education, employment, financial services, and healthcare.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-sm text-slate-300 font-medium">
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#for-citizens" className="hover:text-white transition-colors">For Citizens</a>
            <a href="#for-institutions" className="hover:text-white transition-colors">For Institutions</a>
            <Link href="/login" className="hover:text-white transition-colors">Institutional Login</Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">Portal Dashboard</Link>
          </div>
        </div>

        {/* Prototype Disclaimer */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>© 2026 CredLink Network. Synthetic Hackathon Demonstration Platform.</p>
          <Badge variant="neutral" className="bg-slate-800 text-slate-300 border-slate-700 text-xs">
            Demo Environment — No Production Keys
          </Badge>
        </div>
      </div>
    </footer>
  );
}
