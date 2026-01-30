import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../contexts/NotificationContext';

export default function Auth({ mode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotification } = useNotification();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isSetup = mode === 'setup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Shared validation
    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    // Setup-specific validation
    if (isSetup) {
      if (!confirmPassword) {
        setError('All fields are required');
        return;
      }
      if (username.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      if (password.length < 3) {
        setError('Password must be at least 3 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setIsLoading(true);

    try {
      const endpoint = isSetup ? '/api/auth/setup' : '/api/auth/login';
      const body = isSetup
        ? { username, password }
        : { username, password, remember_me: rememberMe };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || (isSetup ? 'Failed to save credentials' : 'Login failed'));
        setIsLoading(false);
        return;
      }

      if (isSetup) {
        showNotification('Credentials saved! Please log in.', 'success');
        await queryClient.invalidateQueries({ queryKey: ['auth', 'first-run'] });
        setTimeout(() => {
          navigate('/login');
        }, 1000);
      } else {
        window.location.replace('/');
      }
    } catch (err) {
      setError('Failed to connect to server');
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center p-4 bg-dark-primary overflow-hidden">
      <div className="card p-6 sm:p-8 max-w-md w-full">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-1 sm:mb-2">
            {isSetup ? 'Setup Login Credentials' : 'Login'}
          </h1>
          <p className="text-text-secondary text-xs sm:text-sm">
            {isSetup ? 'Create your username and password' : 'Enter your credentials to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1.5 sm:mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isSetup ? 'Choose a username' : 'Enter your username'}
              className="input w-full py-2 px-3 text-sm"
              disabled={isLoading}
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1.5 sm:mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSetup ? 'Choose a password' : 'Enter your password'}
              className="input w-full py-2 px-3 text-sm"
              disabled={isLoading}
              autoComplete={isSetup ? 'new-password' : 'current-password'}
            />
          </div>

          {isSetup && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-text-secondary mb-1.5 sm:mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="input w-full py-2 px-3 text-sm"
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 sm:px-4 sm:py-3 rounded-lg text-xs sm:text-sm">
              {error}
            </div>
          )}

          {!isSetup && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-dark-border bg-dark-tertiary text-accent-text focus:ring-accent focus:ring-offset-0 flex-shrink-0"
              />
              <label htmlFor="rememberMe" className="text-xs sm:text-sm text-text-secondary cursor-pointer">
                Remember me for 1 year (otherwise 90 days)
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`btn ${isSetup ? 'bg-red-700 hover:bg-red-800' : 'bg-gray-700 hover:bg-gray-600'} text-text-primary font-bold w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base`}
          >
            {isLoading
              ? (isSetup ? 'Saving...' : 'Logging in...')
              : (isSetup ? 'Complete Setup' : 'Login')}
          </button>
        </form>
      </div>
    </div>
  );
}
