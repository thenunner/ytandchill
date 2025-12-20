export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-8 w-8 border-4',
    lg: 'h-12 w-12 border-4'
  };

  return (
    <div className="flex justify-center items-center h-64">
      <div className={`animate-spin ${sizeClasses[size]} border-accent border-t-transparent rounded-full ${className}`}></div>
    </div>
  );
}
