import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import EmployeeTasks from './pages/EmployeeTasks';
import EmployeeStatistics from './pages/EmployeeStatistics';
import EmployeeLogin from './pages/EmployeeLogin';
import { useAuth } from './auth/AuthContext';
import './EmployeeApp.css';

function EmployeeShell() {
  const { logout } = useAuth();
  return <div className="app-shell"><main className="app-container"><Routes><Route path="/" element={<Navigate to="/tasks" replace />} /><Route path="/tasks" element={<EmployeeTasks />} /><Route path="/statistics" element={<EmployeeStatistics />} /><Route path="*" element={<Navigate to="/tasks" replace />} /></Routes></main><nav className="employee-nav"><NavLink to="/tasks"><i className="fa-solid fa-list-check" /><span>وظایف</span></NavLink><NavLink to="/statistics"><i className="fa-solid fa-chart-column" /><span>آمار تولید</span></NavLink><button type="button" onClick={logout}><i className="fa-solid fa-arrow-right-from-bracket" /><span>خروج</span></button></nav></div>;
}

export default function EmployeeApp() {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-splash" />;
  if (!user) return <EmployeeLogin />;
  return user.role === 'employee' ? <EmployeeShell /> : <EmployeeLogin />;
}
