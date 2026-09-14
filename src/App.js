import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import HumanResources from './pages/HumanResources';
import Expenses from './pages/Expenses';
import Management from './pages/Management';
import SubmitOrder from './pages/SubmitOrder';
import OrderList from './pages/OrderList';
import OrderView from './pages/OrderView';
import Inquiries from './pages/Inquiries';
import SettingsInfo from './pages/SettingsInfo';
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
          <Route path="/payroll" element={<HumanResources />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/orders" element={<Management />}>
            <Route index element={<SubmitOrder />} />
            <Route path="list" element={<OrderList />} />
            <Route path="inquiries" element={<Inquiries />} />
          </Route>
          <Route path="/orders/edit/:id" element={<SubmitOrder />} />
          <Route path="/orders/view/:id" element={<OrderView />} />
          <Route path="/people" element={<Navigate to="/settings" replace />} />
          <Route path="/inquiries" element={<Navigate to="/orders/inquiries" replace />} />
          <Route path="/job-applications" element={<Navigate to="/payroll" replace />} />
          <Route path="/settings" element={<SettingsInfo />} />
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
