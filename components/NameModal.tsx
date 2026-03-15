'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useToast } from './ToastProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getStoredName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('requestr_name') ?? '';
}

export function saveStoredName(name: string) {
  localStorage.setItem('requestr_name', name);
  window.dispatchEvent(new Event('requestr:name-changed'));
}

export function getInitials(name: string): string {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface NameModalContextValue {
  openModal: () => void;
  userName: string;
}

const NameModalContext = createContext<NameModalContextValue>({
  openModal: () => {},
  userName: '',
});

export function useNameModal() {
  return useContext(NameModalContext);
}

// ---------------------------------------------------------------------------
// Provider + Modal UI
// ---------------------------------------------------------------------------

export function NameModalProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [isOpen, setOpen] = useState(false);
  const [required, setRequired] = useState(false);
  const [userName, setUserName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = getStoredName();
    setUserName(stored);
    if (!stored) {
      setRequired(true);
      setOpen(true);
    }
    const handler = () => setUserName(getStoredName());
    window.addEventListener('requestr:name-changed', handler);
    return () => window.removeEventListener('requestr:name-changed', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  const openModal = useCallback(() => setOpen(true), []);

  const handleSubmit = () => {
    const val = inputRef.current?.value?.trim();
    if (!val) {
      inputRef.current?.focus();
      return;
    }
    saveStoredName(val);
    setUserName(val);
    setOpen(false);
    setRequired(false);
    toast(`Name set to "${val}"`, 'info');
  };

  const handleClose = () => {
    if (required) return; // can't dismiss until name is set
    setOpen(false);
  };

  return (
    <NameModalContext.Provider value={{ openModal, userName }}>
      {children}

      {/* Modal overlay */}
      <div
        className={`modal-overlay${isOpen ? ' open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Set your name"
      >
        <div className="modal">
          <div className="modal-emoji">👋</div>
          <h2>What&rsquo;s your name?</h2>
          <p>So your friends know who requested what. You can change it any time.</p>
          <input
            ref={inputRef}
            className="modal-input"
            type="text"
            placeholder="e.g. Alex, Sam, Jordan…"
            maxLength={64}
            defaultValue={userName}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <div className="modal-actions">
            {!required && (
              <button className="btn btn-outline" onClick={handleClose}>
                Cancel
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSubmit}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                style={{ width: 14, height: 14 }}
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Let&rsquo;s go
            </button>
          </div>
        </div>
      </div>
    </NameModalContext.Provider>
  );
}
