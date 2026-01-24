export default function StickyBar({ children, className = '' }) {
  return (
    <div className={`sticky top-0 z-40 bg-dark-primary/95 backdrop-blur-lg py-4 px-3 sm:-mx-6 sm:px-6 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16 ${className}`}>
      {children}
    </div>
  );
}
