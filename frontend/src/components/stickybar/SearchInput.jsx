import { useCardSize } from '../../contexts/CardSizeContext';
import { getTextSizes } from '../../utils/gridUtils';

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = ''
}) {
  const { cardSize } = useCardSize();
  const textSizes = getTextSizes(cardSize);

  return (
    <div className={`relative flex-1 max-w-md ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full pl-10 pr-4 py-2 ${textSizes.metadata} bg-dark-secondary border border-dark-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent`}
      />
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
    </div>
  );
}
