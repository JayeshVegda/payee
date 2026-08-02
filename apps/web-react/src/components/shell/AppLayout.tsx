import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardData } from '../../api/client';
import { Circle } from 'lucide-react';

export default function AppLayout() {
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());

  // Query dashboard data to get the review count badge
  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api<DashboardData>('/dashboard'),
    refetchInterval: 15000 // keep navigation badge updated
  });

  // Keep clock updated
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

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

  const formattedTime = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);

  return (
    <div className="payment-desk-shell min-h-screen flex flex-col bg-ledger-workspace text-ledger-ink">
      <header className="top-navigation sticky top-0 z-50 flex items-center justify-between px-6 bg-white border-b border-ledger-border h-[54px] shadow-sm select-none">
        <div className="flex items-center gap-6">
          <div
            onClick={() => navigate('/')}
            className="top-brand flex items-center gap-2 font-bold cursor-pointer"
          >
            <span>₹</span>
            <strong className="text-ledger-ink font-semibold tracking-tight text-[15px]">
              Payment Desk
            </strong>
          </div>

          <nav className="flex items-center h-[54px]" aria-label="Primary navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-item flex items-center px-4 h-[54px] text-[13px] font-semibold transition-all border-b-2 ${
                    isActive
                      ? 'text-ledger-blue border-ledger-blue'
                      : 'text-ledger-muted border-transparent hover:text-ledger-blue hover:bg-ledger-selection/50'
                  }`
                }
              >
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-extrabold rounded-full bg-ledger-review text-white min-w-[16px] text-center">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="top-status flex items-center gap-4 text-xs text-ledger-muted">
          <div className="flex items-center gap-1.5 text-ledger-blue font-medium">
            <Circle className="w-2 h-2 fill-current" />
            <span>Local</span>
          </div>
          <div className="h-4 w-px bg-ledger-border" />
          <time className="font-mono text-ledger-ink text-[12px]">{formattedTime}</time>
        </div>
      </header>

      <main className="workspace flex-1 w-full max-w-[1600px] mx-auto p-6 focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
