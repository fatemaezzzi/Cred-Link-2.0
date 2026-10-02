'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Toast, ToastProps } from '../ui/Toast';
import { useRoleContext } from '../../hooks/useRoleContext';
import { CredLinkLogo } from '../ui/CredLinkLogo';

export interface ShellProps {
  children: React.ReactNode;
}

export function Shell({ children }: ShellProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, currentUser, enterDemoMode } = useRoleContext();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Omit<ToastProps, 'onClose'>[]>([]);

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !currentUser)) {
      enterDemoMode();
    }
  }, [isLoading, isAuthenticated, currentUser, enterDemoMode]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (isLoading || !isAuthenticated || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] flex items-center justify-center p-4 antialiased">
        <div className="flex flex-col items-center gap-3">
          <CredLinkLogo size="md" className="animate-pulse" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Loading CredLink Portal...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 font-sans flex antialiased">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 z-30 md:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={mobileSidebarOpen} onCloseMobile={() => setMobileSidebarOpen(false)} />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0 min-h-screen">
        <Topbar onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          {children}
        </main>
      </div>

      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast {...toast} onClose={removeToast} />
          </div>
        ))}
      </div>
    </div>
  );
}
