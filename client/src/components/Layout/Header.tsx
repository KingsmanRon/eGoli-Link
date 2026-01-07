import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { useAuth } from '../../hooks/useAuth';

interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function Header({ title = 'eGoli-Link', showBack, onBack }: HeaderProps) {
  const { isOnline, isSyncing, pendingCount, sync } = useOfflineSync();
  const { canUploadPDF, isAdmin, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  return (
    <header className="bg-primary-800 text-white sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-primary-700 rounded-lg"
              aria-label="Go back"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-citypower-gold rounded-lg flex items-center justify-center font-bold">
                eG
              </div>
            </Link>
          )}
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Sync Status */}
          <button
            onClick={sync}
            disabled={isSyncing || !isOnline}
            className="relative p-2 hover:bg-primary-700 rounded-lg disabled:opacity-50"
            aria-label="Sync"
          >
            <svg
              className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-citypower-gold text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold text-primary-900">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Online Status */}
          <div className="flex items-center gap-1">
            <span
              className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}
            />
            <span className="text-xs opacity-75">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Menu Button */}
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 hover:bg-primary-700 rounded-lg"
            aria-label="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute right-2 top-12 bg-white text-gray-900 rounded-lg shadow-xl z-50 py-2 min-w-[200px]">
            <Link
              to="/"
              className="block px-4 py-2 hover:bg-gray-100"
              onClick={() => setShowMenu(false)}
            >
              Dashboard
            </Link>
            <Link
              to="/jobs"
              className="block px-4 py-2 hover:bg-gray-100"
              onClick={() => setShowMenu(false)}
            >
              All Jobs
            </Link>
            <Link
              to="/map"
              className="block px-4 py-2 hover:bg-gray-100"
              onClick={() => setShowMenu(false)}
            >
              Map View
            </Link>
            {canUploadPDF && (
              <Link
                to="/upload"
                className="block px-4 py-2 hover:bg-gray-100"
                onClick={() => setShowMenu(false)}
              >
                PDF Management
              </Link>
            )}
            {isAdmin && (
              <Link
                to="/users"
                className="block px-4 py-2 hover:bg-gray-100"
                onClick={() => setShowMenu(false)}
              >
                User Management
              </Link>
            )}
            <hr className="my-2" />
            <Link
              to="/settings"
              className="block px-4 py-2 hover:bg-gray-100"
              onClick={() => setShowMenu(false)}
            >
              Settings
            </Link>
            <button
              className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
              onClick={() => {
                setShowMenu(false);
                logout();
              }}
            >
              Logout
            </button>
          </div>
        </>
      )}
    </header>
  );
}
