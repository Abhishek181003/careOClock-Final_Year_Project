import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import { CONFIG } from '../../config';

export default function AppShell() {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>
      {/* Persistent, non-dismissible on every clinical/app screen */}
      <footer className="border-t border-line bg-surface mt-auto">
        <p className="max-w-5xl mx-auto px-4 py-3 text-sm text-ink-soft">
          {CONFIG.NON_DIAGNOSTIC_DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}
