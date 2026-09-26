import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import EmployeeTasks from './pages/EmployeeTasks';
import EmployeeLogin from './pages/EmployeeLogin';
import { useAuth } from './auth/AuthContext';

function EmployeeShell() {
  return <div className="app-shell"><main className="app-container"><Routes><Route path="/" element={<Navigate to="/tasks" replace />} /><Route path="/tasks" element={<EmployeeTasks />} /><Route path="*" element={<Navigate to="/tasks" replace />} /></Routes></main></div>;
}

export default function EmployeeApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-splash" />;
  if (!user) return <EmployeeLogin />;
  return user.role === 'employee' ? <EmployeeShell /> : <EmployeeLogin />;
}
