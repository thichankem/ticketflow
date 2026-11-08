import React from 'react';
import { Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useCart } from './context/CartContext';

import HomePage from './pages/HomePage';
import EventDetailsPage from './pages/EventDetailsPage';
import CheckoutPage from './pages/CheckoutPage';
import AdminPage from './pages/AdminPage';
import OrganizerPage from './pages/OrganizerPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

export function App() {
  const { user, isAuthenticated, isAdmin, isOrganizer, logout } = useAuth();
  const { cartItems } = useCart();
  const navigate = useNavigate();

  const totalCartCount = cartItems.reduce((sum, it) => sum + it.quantity, 0);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      {/* Semantic HTML5 Header & Navigation */}
      <header>
        <div className="header-container">
          <Link to="/" className="logo">
            <span>🎟️</span>
            <span>Hi.Events</span>
          </Link>

          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>

            {isOrganizer && (
              <NavLink to="/organizer">
                Organizer Portal
              </NavLink>
            )}

            {isAdmin && (
              <NavLink to="/admin">
                Admin
              </NavLink>
            )}

            <NavLink to="/checkout" className="flex items-center gap-xs">
              <span>Checkout</span>
              {totalCartCount > 0 && (
                <span className="badge badge-primary" style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem' }}>
                  {totalCartCount}
                </span>
              )}
            </NavLink>

            {isAuthenticated ? (
              <div className="flex items-center gap-sm">
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {user.name} ({user.role})
                </span>
                <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-sm">
                <Link to="/login" className="btn btn-secondary btn-sm">
                  Log In
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Register
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Semantic Main View Container */}
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/events/:id" element={<EventDetailsPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/organizer" element={<OrganizerPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </main>

      {/* Semantic Footer */}
      <footer>
        <p>&copy; 2026 Ticketflow Hi.Events Clone. Built with React SPA & Vanilla CSS.</p>
      </footer>
    </>
  );
}

export default App;
