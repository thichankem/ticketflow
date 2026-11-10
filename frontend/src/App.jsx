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
      <header className="site-header">
        <div className="header-container">
          <Link to="/" className="logo">
            <img src="/ticketflow-mark.svg" alt="" />
            <span>Ticketflow</span>
          </Link>

          <nav>
            <NavLink to="/" end>
              Home
            </NavLink>

            {isOrganizer && (
              <NavLink to="/organizer">
                Organizer
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
                <span className="badge badge-primary">
                  {totalCartCount}
                </span>
              )}
            </NavLink>

            {isAuthenticated ? (
              <div className="nav-actions">
                <span className="user-chip">
                  {user.name} · {user.role}
                </span>
                <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="nav-actions">
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

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">Ticketflow</div>
            <p>Hold a seat for 15 minutes. One barcode per guest.</p>
          </div>
          <p>© 2026 Ticketflow</p>
        </div>
      </footer>
    </>
  );
}

export default App;
