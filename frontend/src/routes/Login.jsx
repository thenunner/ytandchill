import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Username and password are required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, remember_me: rememberMe }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setIsLoading(false);
        return;
      }

      // Redirect to home - full page reload to trigger auth check
      window.location.replace('/');
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
            Login
          </h1>
          <p className="text-text-secondary text-xs sm:text-sm">
            Enter your credentials to continue
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
              placeholder="Enter your username"
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
              placeholder="Enter your password"
              className="input w-full py-2 px-3 text-sm"
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 sm:px-4 sm:py-3 rounded-lg text-xs sm:text-sm">
              {error}
            </div>
          )}

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

          <button
            type="submit"
            disabled={isLoading}
            className="btn bg-gray-700 hover:bg-gray-600 text-text-primary font-bold w-full disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
