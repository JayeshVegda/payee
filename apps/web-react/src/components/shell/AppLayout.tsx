import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardData } from '../../api/client';

export default function AppLayout() {
  const navigate = useNavigate();

  // Query dashboard data to get the review count badge
  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
    refetchInterval: 15000 // keep navigation badge updated
  });

  // Keyboard navigation & chords
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

      // / key focuses quick input
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
          }, 1000); // 1 sec window
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
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-6 focus:outline-none flex flex-col">
        {/* Centered Segmented Control Navigation Bar (No icons, no top header row, styled via Tailwind) */}
        <div className="flex justify-center mb-8 select-none">
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shadow-2xs" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-1 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm font-bold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-1 px-1.5 py-0.5 text-[9px] font-extrabold rounded-full bg-rose-600 text-white min-w-[14px] text-center">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
