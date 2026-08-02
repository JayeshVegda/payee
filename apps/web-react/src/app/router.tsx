import React from 'react';
import { Routes, Route, Navigate } from 'react-router';
import AppLayout from '../components/shell/AppLayout';
import TodayPage from '../pages/TodayPage';
import LedgerPage from '../pages/LedgerPage';
import ReviewPage from '../pages/ReviewPage';
import PayeesPage from '../pages/PayeesPage';
import ActivityPage from '../pages/ActivityPage';
import ReportsPage from '../pages/ReportsPage';
import SystemPage from '../pages/SystemPage';

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<TodayPage />} />
        <Route path="/ledger" element={<LedgerPage />} />
        <Route path="/ledger/:transactionId" element={<LedgerPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/payees" element={<PayeesPage />} />
        <Route path="/payees/:payeeId" element={<PayeesPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
