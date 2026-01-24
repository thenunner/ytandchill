export default function StickyBar({ children, className = '' }) {
  return (
    <div className={`sticky top-0 z-40 bg-dark-primary/95 backdrop-blur-lg py-4 -mx-4 px-4 md:-mx-6 md:px-6 ${className}`}>
      {children}
    </div>
  );
}
