'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { useNameModal, getInitials } from './NameModal';

// ---------------------------------------------------------------------------
// Inline SVG icons — no external sprite sheet required
// ---------------------------------------------------------------------------

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 15, height: 15, flexShrink: 0 }}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 15, height: 15, flexShrink: 0 }}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ width: 16, height: 16 }}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Header component
// ---------------------------------------------------------------------------

export function Header() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { openModal, userName } = useNameModal();

  const initials = userName ? getInitials(userName) : '?';
  const displayName = userName || 'Set your name';

  return (
    <header className="header">
      <div className="container">
        <div className="header-inner">
          {/* Logo */}
          <Link href="/" className="logo">
            <div className="logo-mark">R</div>
            Requestr
          </Link>

          {/* Nav */}
          <nav className="nav">
            <Link href="/" className={`nav-link${pathname === '/' ? ' active' : ''}`}>
              <SearchIcon />
              <span className="nav-label">Search</span>
            </Link>
            <Link href="/wishlist" className={`nav-link${pathname === '/wishlist' ? ' active' : ''}`}>
              <ListIcon />
              <span className="nav-label">Wish List</span>
            </Link>
          </nav>

          {/* Right: name chip + theme toggle */}
          <div className="header-right">
            <button
              className="name-btn"
              onClick={openModal}
              title="Change your name"
            >
              <div className="name-avatar">{initials}</div>
              <span>{displayName}</span>
            </button>
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
