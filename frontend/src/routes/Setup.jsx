import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../contexts/NotificationContext';

function Setup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showNotification } = useNotification();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!username || !password || !confirmPassword) {
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

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to save credentials');
        setIsLoading(false);
        return;
      }

      showNotification('Credentials saved! Please log in.', 'success');

      // Invalidate first-run cache so app knows setup is complete
      await queryClient.invalidateQueries({ queryKey: ['auth', 'first-run'] });

      // Redirect to login page
      setTimeout(() => {
        navigate('/login');
      }, 1000);
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
            Setup Login Credentials
          </h1>
          <p className="text-text-secondary text-xs sm:text-sm">
            Create your username and password
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
              placeholder="Choose a username"
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
              placeholder="Choose a password"
              className="input w-full py-2 px-3 text-sm"
              disabled={isLoading}
              autoComplete="new-password"
            />
          </div>

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

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 sm:px-4 sm:py-3 rounded-lg text-xs sm:text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn bg-red-700 hover:bg-red-800 text-text-primary font-bold w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {isLoading ? 'Saving...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Setup;
