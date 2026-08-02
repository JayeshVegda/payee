import React from 'react';

export interface TabOption {
  id: string;
  label: string;
  count?: number;
  badgeColor?: string;
}

interface SegmentedTabsProps {
  options: TabOption[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  options,
  activeId,
  onChange,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1 p-1 bg-stone-100/80 rounded-xl select-none ${className}`}>
      {options.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer border-none ${
              isActive
                ? 'bg-white text-stone-900 shadow-3xs font-bold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`ml-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                  isActive
                    ? 'bg-[#2563EB] text-white'
                    : tab.badgeColor || 'bg-[#F79009] text-white'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
