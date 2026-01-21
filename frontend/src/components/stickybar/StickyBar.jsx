export default function StickyBar({ children, className = '' }) {
  return (
    <div className={`sticky top-[60px] z-40 bg-dark-primary/95 backdrop-blur-lg py-4 md:-mx-6 md:px-6 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16 ${className}`}>
      {children}
    </div>
  );
}
