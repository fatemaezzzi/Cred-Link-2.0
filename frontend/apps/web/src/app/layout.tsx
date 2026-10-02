import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RoleProvider } from '../hooks/useRoleContext';
import { ServiceWorkerRegistration } from '../components/pwa/ServiceWorkerRegistration';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';

export const metadata: Metadata = {
  title: 'CredLink — Unified Digital Identity & Record Network',
  description: 'Citizen-centric cross-domain digital identity & verifiable credential management platform.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'CredLink',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export const viewport: Viewport = {
  themeColor: '#1B6B4A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CredLink" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body className="h-full bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 antialiased">
        <RoleProvider>
          <ServiceWorkerRegistration />
          {children}
          <PWAInstallButton />
        </RoleProvider>
      </body>
    </html>
  );
}
