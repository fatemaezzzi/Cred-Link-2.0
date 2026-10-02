'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (typeof window !== 'undefined') {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsInstalled(true);
        return;
      }

      // Check if user previously dismissed
      const dismissedAt = localStorage.getItem('credlink_pwa_dismissed');
      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt, 10);
        // Re-show after 24 hours
        if (Date.now() - dismissedTime < 24 * 60 * 60 * 1000) {
          setDismissed(true);
        }
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }

    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    setDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('credlink_pwa_dismissed', Date.now().toString());
    }
  };

  // Don't render if already installed, dismissed, or no install prompt available
  if (isInstalled || dismissed || !showInstallBanner) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md animate-in slide-in-from-bottom-4 duration-500">
      <div className="relative bg-gradient-to-r from-[#1B6B4A] via-[#22805A] to-[#38BF8F] rounded-2xl p-[1px] shadow-2xl shadow-emerald-900/30">
        <div className="bg-slate-950/95 backdrop-blur-xl rounded-2xl p-4 flex items-start gap-3.5">
          {/* Icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-[#1B6B4A] to-[#38BF8F] flex items-center justify-center shadow-lg shadow-emerald-800/30">
            <Smartphone className="w-5 h-5 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-white leading-tight">
              Install CredLink App
            </h4>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Get instant access to credentials, verification & trust registry right on your device.
            </p>
            <button
              onClick={handleInstallClick}
              className="mt-2.5 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#1B6B4A] to-[#2D9D6A] hover:from-[#22805A] hover:to-[#38BF8F] text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-emerald-900/30 hover:shadow-lg hover:shadow-emerald-800/40 active:scale-[0.97]"
            >
              <Download className="w-3.5 h-3.5" />
              Install on Device
            </button>
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
            aria-label="Dismiss install prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline install button for embedding in the landing page navbar or hero section.
 * Shows only when the app is installable and not already installed.
 */
export function PWAInstallInlineButton({ className = '' }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsInstalled(true);
        return;
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !deferredPrompt) return null;

  return (
    <button
      onClick={handleInstallClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#1B6B4A] to-[#2D9D6A] hover:from-[#22805A] hover:to-[#38BF8F] text-white text-xs font-semibold transition-all duration-200 shadow-md shadow-emerald-900/20 hover:shadow-lg hover:shadow-emerald-800/30 active:scale-[0.97] ${className}`}
    >
      <Download className="w-3.5 h-3.5" />
      Install App
    </button>
  );
}
