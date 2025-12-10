import { useCardSize } from '../../contexts/CardSizeContext';

export default function CardSizeSlider({ show = true, className = '' }) {
  const { cardSize, setCardSize } = useCardSize();

  if (!show) return null;

  return (
    <div className={`hidden md:flex items-center gap-2 ${className}`}>
      <svg className="w-4 h-4 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
      </svg>
      <input
        type="range"
        min="0"
        max="2"
        value={['sm', 'md', 'lg'].indexOf(cardSize)}
        onChange={(e) => {
          const sizes = ['sm', 'md', 'lg'];
          setCardSize(sizes[e.target.value]);
        }}
        className="w-20 sm:w-24 h-2 bg-dark-tertiary rounded-lg appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-accent
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:bg-accent
          [&::-moz-range-thumb]:border-0
          [&::-moz-range-thumb]:cursor-pointer"
        title="Adjust card density (sm=compact, lg=spacious)"
      />
      <svg className="w-5 h-5 text-text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="9" height="9"></rect>
        <rect x="13" y="2" width="9" height="9"></rect>
        <rect x="2" y="13" width="9" height="9"></rect>
        <rect x="13" y="13" width="9" height="9"></rect>
      </svg>
    </div>
  );
}
