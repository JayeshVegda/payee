import React, { useEffect } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardData } from '../../api/client';

export default function AppLayout() {
  const navigate = useNavigate();

  // Query dashboard data to keep the review count badge updated
  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
    refetchInterval: 15000
  });

  // Keyboard shortcuts (N -> record payment modal, / -> focus input, G -> T/L/P/R/A/O/S chord navigation)
  useEffect(() => {
    let gPressed = false;
    let gTimeout: number | undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      // Escape behavior: close drawer or blur active element if typing
      if (e.key === 'Escape') {
        if (isTyping && activeEl instanceof HTMLElement) {
          activeEl.blur();
        }
        window.dispatchEvent(new CustomEvent('close-all-overlays'));
        return;
      }

      // / key focuses quick input or search input
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        const firstInput = document.querySelector(
          'input[type="text"], input[role="combobox"]'
        ) as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
          firstInput.select();
        }
        return;
      }

      // N key opens Record Payment (focus quick input on Today page or trigger CTA)
      if ((e.key === 'n' || e.key === 'N') && !isTyping && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        navigate('/');
        setTimeout(() => {
          const quickInput = document.querySelector(
            'input[placeholder*="Payee"], input[placeholder*="payee"]'
          ) as HTMLInputElement;
          if (quickInput) {
            quickInput.focus();
            quickInput.select();
          }
        }, 50);
        return;
      }

      // Alt + 1..7 routing chords
      if (e.altKey) {
        const keyMap: Record<string, string> = {
          '1': '/',
          '2': '/ledger',
          '3': '/review',
          '4': '/payees',
          '5': '/activity',
          '6': '/system',
          '7': '/reports'
        };
        if (keyMap[e.key]) {
          e.preventDefault();
          navigate(keyMap[e.key]!);
          return;
        }
      }

      // Chord G then T/L/R/P/A/O/S
      if (!isTyping) {
        const key = e.key.toLowerCase();
        if (key === 'g') {
          gPressed = true;
          window.clearTimeout(gTimeout);
          gTimeout = window.setTimeout(() => {
            gPressed = false;
          }, 1000);
          return;
        }

        if (gPressed) {
          const chordMap: Record<string, string> = {
            t: '/',
            l: '/ledger',
            r: '/review',
            p: '/payees',
            a: '/activity',
            o: '/reports',
            s: '/system'
          };
          if (chordMap[key]) {
            e.preventDefault();
            gPressed = false;
            window.clearTimeout(gTimeout);
            navigate(chordMap[key]!);
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(gTimeout);
    };
  }, [navigate]);

  const navItems = [
    { label: 'Today', path: '/', key: '1' },
    { label: 'Ledger', path: '/ledger', key: '2' },
    {
      label: 'Review',
      path: '/review',
      key: '3',
      badge:
        dashboard?.reviewCount && dashboard.reviewCount > 0 ? dashboard.reviewCount : undefined
    },
    { label: 'Payees', path: '/payees', key: '4' },
    { label: 'Activity', path: '/activity', key: '5' },
    { label: 'Reports', path: '/reports', key: '7' },
    { label: 'System', path: '/system', key: '6' }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F8FC] text-[#111827] font-sans">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Top Header Navigation Bar (Section 3 App Shell Spec) */}
      <header className="sticky top-0 z-40 h-[56px] grid grid-cols-[1fr_auto_1fr] items-center bg-white/90 backdrop-blur-md border-b border-[#DDE3EC] px-6 shadow-xs">
        {/* Brand & Workspace */}
        <div className="flex items-center gap-3">
          <Link className="flex items-center gap-2 rounded-lg" to="/" aria-label="Payment Ledger home">
            <span className="w-8 h-8 rounded-lg bg-[#165DFF] text-white flex items-center justify-center font-black text-sm shadow-xs">
              ₹
            </span>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-[#111827] leading-tight">
                Payment Ledger
              </span>
              <span className="text-[10px] font-semibold text-[#667085] leading-none">
                One Cashbook
              </span>
            </div>
          </Link>
        </div>

        {/* Centered Navigation Items */}
        <nav className="hidden lg:flex items-center gap-1.5" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full transition-colors duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#E9F1FF] text-[#165DFF] font-bold shadow-2xs'
                    : 'text-[#667085] hover:text-[#111827] hover:bg-slate-100/70'
                }`
              }
            >
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="ml-1 px-2 py-0.5 text-[10px] font-extrabold rounded-full bg-[#F79009] text-white min-w-[16px] text-center shadow-2xs">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div aria-hidden="true" />
      </header>

      <nav
        className="fixed bottom-3 left-3 right-3 z-40 flex items-center gap-1 overflow-x-auto rounded-2xl border border-[#DDE3EC] bg-white/95 p-2 shadow-lg backdrop-blur-md lg:hidden"
        aria-label="Mobile primary navigation"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `min-w-max rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                isActive ? 'bg-[#E9F1FF] text-[#165DFF]' : 'text-[#667085] hover:bg-slate-100'
              }`
            }
          >
            {item.label}
            {item.badge !== undefined && (
              <span className="ml-1 rounded-full bg-[#F79009] px-1.5 py-0.5 text-[10px] text-white">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Main Content Workspace */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full p-3 pb-24 md:p-4 lg:px-5 lg:pb-5 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
