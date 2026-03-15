'use client';

/**
 * Providers wraps the entire app with:
 *   - ThemeProvider  — dark/light mode (localStorage)
 *   - ToastProvider  — toast notifications
 *   - NameModalProvider — name-entry modal (also provides name context)
 *
 * All are client components.  This file lets layout.tsx (a Server Component)
 * stay a pure server component while still wrapping children with context.
 */

import { type ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { ToastProvider } from './ToastProvider';
import { NameModalProvider } from './NameModal';
import { Header } from './Header';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NameModalProvider>
          <Header />
          {children}
        </NameModalProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
