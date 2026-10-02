'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import { CredLinkLogo } from '../ui/CredLinkLogo';
import { PWAInstallInlineButton } from '../pwa/PWAInstallButton';

export function LandingNavbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center group">
          <CredLinkLogo size="sm" showText />
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            How It Works
          </a>
          <a href="#for-citizens" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            For Citizens
          </a>
          <a href="#for-institutions" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            For Institutions
          </a>
          <a href="#domains" className="hover:text-slate-900 dark:hover:text-slate-100 transition-colors">
            Core Domains
          </a>
        </nav>

        {/* Action Button */}
        <div className="hidden md:flex items-center gap-3">
          <PWAInstallInlineButton />
          <Link href="/login">
            <Button variant="outline" size="sm" className="text-xs">
              Institutional Login
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="forest" size="sm" className="text-xs gap-1.5">
              <span>Launch Demo Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>

        {/* Mobile Hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-4 space-y-3 text-sm font-medium">
          <a
            href="#how-it-works"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1.5 text-slate-700 dark:text-slate-300"
          >
            How It Works
          </a>
          <a
            href="#for-citizens"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1.5 text-slate-700 dark:text-slate-300"
          >
            For Citizens
          </a>
          <a
            href="#for-institutions"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1.5 text-slate-700 dark:text-slate-300"
          >
            For Institutions
          </a>
          <a
            href="#domains"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-1.5 text-slate-700 dark:text-slate-300"
          >
            Core Domains
          </a>
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="outline" size="sm" className="w-full text-xs">
                Institutional Login
              </Button>
            </Link>
            <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
              <Button variant="forest" size="sm" className="w-full text-xs gap-1.5">
                <span>Launch Demo Portal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
