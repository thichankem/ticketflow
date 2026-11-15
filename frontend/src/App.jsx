import React, { Suspense, lazy } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import RoleSwitcherBar from './components/RoleSwitcherBar';
import AttendeeLayout from './components/AttendeeLayout';
import OrganizerLayout from './components/OrganizerLayout';
import AdminLayout from './components/AdminLayout';

const HomePage = lazy(() => import('./pages/HomePage'));
const EventsPage = lazy(() => import('./pages/EventsPage'));
const EventDetailsPage = lazy(() => import('./pages/EventDetailsPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const MyTicketsPage = lazy(() => import('./pages/MyTicketsPage'));
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const OrganizerPage = lazy(() => import('./pages/OrganizerPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));

/**
 * Access gate guard for RBAC isolation
 */
const RoleGate = ({ allowedRoles, title, children }) => {
  const { user, switchDemoRole } = useAuth();
  const currentRole = user?.role || 'GUEST';

  const isAllowed = allowedRoles.includes(currentRole);

  if (isAllowed) {
    return children;
  }

  const targetDemoRole = allowedRoles[0];

  return (
    <div className="role-denied-shell">
      <div className="card role-denied-card">
        <div className="denied-icon">🔒</div>
        <h2>Khu Vực Giới Hạn Theo Vai Trò</h2>
        <p className="muted">
          Bạn đang truy cập không gian làm việc dành cho <strong>{title}</strong>.
        </p>

        <div className="role-diff-info">
          <p>
            Vai trò hiện tại: <span className="badge badge-warning">{currentRole}</span>
          </p>
          <p>
            Yêu cầu vai trò: <span className="badge badge-primary">{allowedRoles.join(' hoặc ')}</span>
          </p>
        </div>

        <div className="denied-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => switchDemoRole(targetDemoRole)}
          >
            Chuyển Sang Không Gian {targetDemoRole}
          </button>
          <Link to="/" className="btn btn-secondary">
            Quay Về Trang Chủ
          </Link>
        </div>
      </div>
    </div>
  );
};

export function App() {
  return (
    <>
      <RoleSwitcherBar />
      <Suspense fallback={<div className="page-suspense-fallback" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>}>
        <Routes>
        {/* ============================================================== */}
        {/* ROLE 1: ATTENDEE & CUSTOMER INTERFACES                         */}
        {/* ============================================================== */}
        <Route
          path="/"
          element={
            <AttendeeLayout>
              <HomePage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/events"
          element={
            <AttendeeLayout>
              <EventsPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/events/:id"
          element={
            <AttendeeLayout>
              <EventDetailsPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/checkout"
          element={
            <AttendeeLayout>
              <CheckoutPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/my-tickets"
          element={
            <AttendeeLayout>
              <MyTicketsPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/orders"
          element={
            <AttendeeLayout>
              <MyTicketsPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/receipt/:id"
          element={
            <AttendeeLayout>
              <ReceiptPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/orders/:id/receipt"
          element={
            <AttendeeLayout>
              <ReceiptPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/login"
          element={
            <AttendeeLayout>
              <LoginPage />
            </AttendeeLayout>
          }
        />
        <Route
          path="/register"
          element={
            <AttendeeLayout>
              <RegisterPage />
            </AttendeeLayout>
          }
        />

        {/* ============================================================== */}
        {/* ROLE 2: EVENT ORGANIZER STUDIO INTERFACES                     */}
        {/* ============================================================== */}
        <Route
          path="/organizer"
          element={
            <OrganizerLayout>
              <RoleGate allowedRoles={['ORGANIZER', 'ADMIN']} title="Ban Tổ Chức Sự Kiện">
                <OrganizerPage />
              </RoleGate>
            </OrganizerLayout>
          }
        />

        {/* ============================================================== */}
        {/* ROLE 3: PLATFORM EXECUTIVE ADMIN CONSOLE                       */}
        {/* ============================================================== */}
        <Route
          path="/admin"
          element={
            <AdminLayout>
              <RoleGate allowedRoles={['ADMIN']} title="Quản Trị Viên Sàn">
                <AdminPage />
              </RoleGate>
            </AdminLayout>
          }
        />

        {/* Fallback */}
        <Route
          path="*"
          element={
            <AttendeeLayout>
              <HomePage />
            </AttendeeLayout>
          }
        />
      </Routes>
      </Suspense>
    </>
  );
}

export default App;
