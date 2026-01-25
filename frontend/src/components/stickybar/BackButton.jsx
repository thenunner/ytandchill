import { useNavigate } from 'react-router-dom';

/**
 * BackButton - Navigation back button for sticky bars
 *
 * @param {string} to - Route to navigate to
 * @param {Function} onClick - Custom click handler (overrides to prop)
 * @param {string} title - Tooltip text
 */
export default function BackButton({ to, onClick, title = 'Go back' }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1); // Fallback to browser back
    }
  };

  const className = "flex items-center justify-center w-[35px] h-[35px] rounded-lg bg-dark-tertiary hover:bg-dark-hover border border-dark-border text-text-secondary hover:text-text-primary transition-colors flex-shrink-0";

  return (
    <button onClick={handleClick} className={className} title={title}>
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
  );
}
