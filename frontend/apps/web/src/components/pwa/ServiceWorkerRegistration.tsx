'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register after the page loads to avoid blocking initial render
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('[CredLink PWA] Service Worker registered:', registration.scope);

            // Check for updates periodically
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'activated') {
                    console.log('[CredLink PWA] New service worker activated');
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.warn('[CredLink PWA] Service Worker registration failed:', error);
          });
      });
    }
  }, []);

  return null;
}
