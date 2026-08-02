import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, formatInr } from '../api/client';
import { RefreshCw, PlusCircle, Edit3, Trash2, History, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { SegmentedTabs } from '../components/common/SegmentedTabs';

interface Event {
  id: number;
  action: string;
  changedAt: string;
  source: string;
  transactionId: number;
  amountPaise: number;
  payeeName: string;
}

export default function ActivityPage() {
  const [filterAction, setFilterAction] = useState<string>('all');

  const { data: events = [], isLoading, refetch } = useQuery<Event[]>({
    queryKey: ['activity-events'],
    queryFn: () => api<Event[]>('/activity?limit=200')
  });

  const handleRefresh = async () => {
    await refetch();
    toast.success('Activity log refreshed');
  };

  // Filter events by selected action type
  const filteredEvents = useMemo(() => {
    if (filterAction === 'all') return events;
    return events.filter((e) => e.action.toLowerCase() === filterAction.toLowerCase());
  }, [events, filterAction]);

  // Group events by Day (Section 4.7 Spec: "Today", "Yesterday", or formatted date)
  const groupedEvents = useMemo(() => {
    const groups: Record<string, Event[]> = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    filteredEvents.forEach((event) => {
      const dateStr = event.changedAt.slice(0, 10);
      let groupKey = dateStr;
      if (dateStr === todayStr) {
        groupKey = 'Today';
      } else if (dateStr === yesterdayStr) {
        groupKey = 'Yesterday';
      } else {
        groupKey = new Date(dateStr).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey]!.push(event);
    });

    return groups;
  }, [filteredEvents]);

  const tabs = [
    { id: 'all', label: 'All Actions' },
    { id: 'create', label: 'Created' },
    { id: 'correct', label: 'Edited' },
    { id: 'void', label: 'Voided' },
  ];

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Activity</h1>
          <p className="mt-1 text-sm text-[#667085]">Created, edited, and voided payments.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="btn btn-secondary h-10 px-3 text-[#667085] hover:text-[#111827]"
            title="Refresh activity log"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Segmented Action Filter Control */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <SegmentedTabs
          options={tabs}
          activeId={filterAction}
          onChange={(id) => setFilterAction(id)}
        />
      </div>

      {/* Grouped Day-by-Day Activity Stream */}
      <div className="space-y-6">
        {Object.keys(groupedEvents).length === 0 ? (
          <div className="ledger-card bg-white p-12 text-center text-[#667085] rounded-2xl border border-[#DDE3EC]">
            <Inbox size={40} className="mx-auto mb-2 opacity-50" />
            <h3 className="text-lg font-bold text-[#111827]">No activity logs found</h3>
            <p className="text-xs mt-1 text-[#667085]">
              Recorded creation, modification, or void events will appear here.
            </p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateGroup, items]) => (
            <div key={dateGroup} className="space-y-2">
              {/* Sticky Date Header */}
              <div className="sticky top-[56px] z-10 py-2 px-1 bg-[#F6F8FC] backdrop-blur-xs font-bold text-xs uppercase tracking-wider text-[#667085]">
                {dateGroup} ({items.length})
              </div>

              <div className="ledger-card bg-white p-0 border border-[#DDE3EC] rounded-2xl shadow-xs overflow-hidden divide-y divide-[#DDE3EC]">
                {items.map((event) => {
                  const isVoid = event.action === 'void';
                  const isCorrect = event.action === 'correct';

                  return (
                    <div
                      key={event.id}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-[#F6F8FC] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Action-Type Icon (Section 4.7 Spec) */}
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isVoid
                              ? 'bg-rose-100 text-rose-700'
                              : isCorrect
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-[#E9F1FF] text-[#165DFF]'
                          }`}
                        >
                          {isVoid ? (
                            <Trash2 size={16} />
                          ) : isCorrect ? (
                            <Edit3 size={16} />
                          ) : (
                            <PlusCircle size={16} />
                          )}
                        </div>

                        <div>
                          <strong className="text-sm font-bold text-[#111827] block">
                            {event.payeeName} · <span className="capitalize">{event.action === 'create' ? 'Created' : event.action === 'correct' ? 'Edited' : 'Voided'}</span>
                          </strong>
                          <div className="text-xs text-[#667085] mt-0.5 font-medium">
                            {new Date(event.changedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} ·{' '}
                            <span className="font-mono uppercase">{event.source}</span> · Tx #{event.transactionId}
                          </div>
                        </div>
                      </div>

                      {/* Right-Aligned Tabular Amount */}
                      <span className="font-extrabold tabular-nums text-base text-[#111827] shrink-0">
                        {isVoid && <span className="line-through text-rose-500 mr-2">{formatInr(event.amountPaise)}</span>}
                        {!isVoid && formatInr(event.amountPaise)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
