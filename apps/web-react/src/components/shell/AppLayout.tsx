import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, DashboardData } from '../../api/client';
import { 
  BookOpen, 
  FileSpreadsheet, 
  AlertCircle, 
  Users, 
  BarChart3, 
  Clock, 
  Settings,
  Circle
} from 'lucide-react';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

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

  // Section-based navigation items
  const sections = [
    {
      title: 'BOOKKEEPING',
      items: [
        { label: 'Today', path: '/', key: '1', icon: BookOpen },
        { label: 'Ledger', path: '/ledger', key: '2', icon: FileSpreadsheet },
        {
          label: 'Review',
          path: '/review',
          key: '3',
          icon: AlertCircle,
          badge: dashboard?.reviewCount && dashboard.reviewCount > 0 ? dashboard.reviewCount : undefined
        }
      ]
    },
    {
      title: 'TOOLS',
      items: [
        { label: 'Payees', path: '/payees', key: '4', icon: Users },
        { label: 'Reports', path: '/reports', key: '7', icon: BarChart3 },
        { label: 'Activity', path: '/activity', key: '5', icon: Clock }
      ]
    },
    {
      title: 'SETTINGS',
      items: [
        { label: 'System', path: '/system', key: '6', icon: Settings }
      ]
    }
  ];

  // Helper to map current pathname to breadcrumbs
  const getBreadcrumbs = () => {
    if (location.pathname === '/') return 'Today';
    const clean = location.pathname.substring(1);
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  };

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] text-[#111827] font-sans">
      {/* Persistent Left Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-[#E5E7EB]/50 flex flex-col shrink-0 select-none">
        {/* Brand / Logo */}
        <div className="h-16 flex items-center px-6 border-b border-stone-100 gap-2.5">
          <span className="w-7 h-7 rounded bg-[#2563EB] text-white flex items-center justify-center font-bold text-sm">
            ₹
          </span>
          <span className="font-bold tracking-tight text-stone-900 text-sm">
            Payment Desk
          </span>
        </div>

        {/* Sidebar Nav Items */}
        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto" aria-label="Sidebar navigation">
          {sections.map((section) => (
            <div key={section.title} className="space-y-1.5">
              <span className="px-3 text-[10px] font-bold text-stone-400 tracking-wider uppercase">
                {section.title}
              </span>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const IconComp = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer ${
                          isActive
                            ? 'bg-[#E9F1FF] text-[#2563EB] font-bold border-l-4 border-[#2563EB] rounded-l-none'
                            : 'text-[#4B5563] hover:text-stone-900 hover:bg-stone-50/65'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2">
                        <IconComp className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded-full bg-[#F79009] text-white min-w-[14px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User / Host Status info */}
        <div className="p-4 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400 font-semibold">
          <div className="flex items-center gap-1.5 text-[#2563EB]">
            <Circle className="w-1.5 h-1.5 fill-current animate-pulse" />
            <span>Local Desk</span>
          </div>
          <span>v2.0.26</span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen flex flex-col focus:outline-none overflow-y-auto">
        {/* Top contextual header/action bar */}
        <div className="h-16 px-10 flex items-center justify-between select-none border-b border-[#E5E7EB]/50 bg-white/40 backdrop-blur-3xs sticky top-0 z-40">
          <div className="text-xs font-semibold text-stone-500">
            <span>Workspace</span>
            <span className="mx-1.5 text-stone-300">/</span>
            <strong className="text-stone-850 font-bold">{getBreadcrumbs()}</strong>
          </div>
          
          <kbd className="text-[10px] font-mono tracking-wider text-stone-400 bg-white border border-stone-200 px-2 py-0.5 rounded shadow-3xs uppercase">
            Press / to Search
          </kbd>
        </div>

        {/* Content container */}
        <div className="flex-1 p-10 max-w-7xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
