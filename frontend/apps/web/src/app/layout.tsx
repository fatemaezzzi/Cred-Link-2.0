import type { Metadata } from 'next';
import './globals.css';
import { RoleProvider } from '../hooks/useRoleContext';

export const metadata: Metadata = {
  title: 'CredLink — Unified Digital Identity & Record Network',
  description: 'Citizen-centric cross-domain digital identity & verifiable credential management platform.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/logo.jpg',
    apple: '/logo.jpg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 antialiased">
        <RoleProvider>
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
