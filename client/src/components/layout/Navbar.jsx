import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CONFIG } from '../../config';

const LINKS_BY_ROLE = {
  patient: [
    { to: '/app/patient', label: 'Today' },
    { to: '/app/medicine', label: 'Medicine' },
    { to: '/app/reports', label: 'Reports' },
    { to: '/app/profile', label: 'Profile' },
  ],
  caregiver: [
    { to: '/app/caregiver', label: 'Overview' },
    { to: '/app/profile', label: 'Profile' },
  ],
  doctor: [
    { to: '/app/doctor', label: 'Triage' },
    { to: '/app/reports', label: 'Reports' },
    { to: '/app/profile', label: 'Profile' },
  ],
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const links = user ? LINKS_BY_ROLE[user.role] ?? [] : [];

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-30">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <NavLink to="/" className="font-display font-extrabold text-h3 text-brand-dark">
          {CONFIG.BRAND_NAME}
        </NavLink>

        {/* Desktop Links */}
        {links.length > 0 && (
          <nav className="hidden sm:flex items-center gap-1" aria-label="Primary">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `px-3.5 py-1.5 rounded-full text-base transition-colors ${
                    isActive ? 'bg-brand-light text-brand-dark font-medium' : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {/* Language selector */}
          <label className="text-sm text-ink-soft">
            <span className="sr-only">Language</span>
            <select
              defaultValue={CONFIG.DEFAULT_LANGUAGE}
              className="bg-transparent border border-line rounded-full px-2 py-1 text-sm text-ink-soft"
            >
              {CONFIG.SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </label>

          {user && (
            <div className="hidden sm:flex items-center gap-2">
              <NavLink
                to="/app/profile"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-paper text-sm text-ink font-medium transition-colors"
                title="View Profile"
              >
                <div className="w-6 h-6 rounded-full bg-brand text-white flex items-center justify-center text-xs font-bold">
                  {user.displayName?.[0] || 'U'}
                </div>
                <span>{user.displayName?.split(' ')[0]}</span>
              </NavLink>
              <button
                onClick={logout}
                className="text-xs text-ink-soft hover:text-ink underline ml-1"
              >
                Log out
              </button>
            </div>
          )}

          {/* Mobile Hamburger Button */}
          {user && links.length > 0 && (
            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="sm:hidden p-2 rounded-lg text-ink-soft hover:text-ink focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && user && (
        <div className="sm:hidden border-t border-line bg-surface px-4 pt-3 pb-4 space-y-2">
          <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-4 py-2.5 rounded-ritual text-base ${
                    isActive ? 'bg-brand-light text-brand-dark font-medium' : 'text-ink-soft'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              className="text-left px-4 py-2.5 text-tier-high font-medium text-base"
            >
              Log out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
