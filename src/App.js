import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Payroll from './pages/Payroll';
import Expenses from './pages/Expenses';
import Orders from './pages/Orders';
import SubmitOrder from './pages/SubmitOrder';
import OrderList from './pages/OrderList';
import OrderView from './pages/OrderView';
import People from './pages/People';
import Inquiries from './pages/Inquiries';
import JobApplications from './pages/JobApplications';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAuth } from './auth/AuthContext';
import { useSyncEngine } from './hooks/useSyncEngine';

// The authenticated app shell. useSyncEngine runs only while logged in.
function AppShell() {
  useSyncEngine();

  return (
    <div className="app-shell">
      <main className="app-container">
        <Routes>
          <Route path="/" element={<Navigate to="/payroll" replace />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/orders" element={<Orders />}>
            <Route index element={<SubmitOrder />} />
            <Route path="list" element={<OrderList />} />
          </Route>
          <Route path="/orders/edit/:id" element={<SubmitOrder />} />
          <Route path="/orders/view/:id" element={<OrderView />} />
          <Route path="/people" element={<People />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="/job-applications" element={<JobApplications />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/payroll" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-splash">
        <img src={`${process.env.PUBLIC_URL}/logo192.png`} alt="سامان پولک" className="splash-logo" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AppShell />;
}

export default App;
