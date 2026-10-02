'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShieldCheck,
  FileCheck2,
  Building2,
  Lock,
  History,
  Activity,
  HeartPulse,
  GraduationCap,
  Briefcase,
  Landmark,
  Shield
} from 'lucide-react';
import { cn, getDomainBadgeStyle } from '../../lib/utils';
import { useRoleContext } from '../../hooks/useRoleContext';
import { Badge } from '../ui/Badge';
import { CredLinkLogo } from '../ui/CredLinkLogo';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ isOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser } = useRoleContext();
  const userRole = currentUser?.role || 'CITIZEN';
  const orgName = currentUser?.organizationName || 'Unaffiliated Citizen';
  const domainBadge = getDomainBadgeStyle(userRole);

  const getDomainIcon = (role: string) => {
    switch (role) {
      case 'HOSPITAL':
        return <HeartPulse className="w-4 h-4 text-health-600 dark:text-health-500" />;
      case 'COLLEGE':
        return <GraduationCap className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'BANK':
        return <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'EMPLOYER':
        return <Briefcase className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      default:
        return <Shield className="w-4 h-4 text-forest-800 dark:text-sage-500" />;
    }
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard Overview', icon: LayoutDashboard },
    { href: '/credentials', label: 'Credential Management', icon: FileCheck2 },
    { href: '/verification', label: 'Verification Center', icon: ShieldCheck },
    { href: '/trust-registry', label: 'Trust Registry', icon: Lock },
    { href: '/organizations', label: 'Issuer Directory', icon: Building2 },
    { href: '/audit', label: 'Audit Trail', icon: History }
  ];

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900/95 border-r border-slate-200/80 dark:border-slate-800/80 flex flex-col transition-transform duration-150 ease-in-out md:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Brand Header */}
      <div className="h-16 px-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center group">
          <CredLinkLogo size="sm" showText subtitle="Verifiable Identity Network" />
        </Link>
      </div>

      {/* Active Context Card */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/40">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Active Context
          </span>
          {getDomainIcon(userRole)}
        </div>
        <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-md">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {orgName}
          </p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {userRole}
            </span>
            <Badge variant="neutral" size="sm" className={cn('text-xs py-0 px-1.5', domainBadge.bg, domainBadge.text, domainBadge.border)}>
              {userRole === 'HOSPITAL' ? 'Healthcare Provider' : domainBadge.label.split('/')[0]}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-2 py-1 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Main Menu
        </div>
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-150',
                isActive
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-200'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-current' : 'text-slate-400 dark:text-slate-500')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Footer Info */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium">Network Status: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Operational</span></span>
        </div>
      </div>
    </aside>
  );
}
