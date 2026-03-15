export function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-poster shimmer" />
      <div className="skeleton-body">
        <div className="skeleton-line shimmer" style={{ width: '80%' }} />
        <div className="skeleton-line shimmer" style={{ width: '40%' }} />
        <div className="skeleton-line shimmer" style={{ width: '95%', marginTop: '0.25rem' }} />
        <div className="skeleton-line shimmer" style={{ width: '90%' }} />
        <div className="skeleton-line shimmer" style={{ width: '70%' }} />
        <div className="skeleton-btn shimmer" />
      </div>
    </div>
  );
}

interface SkeletonGridProps {
  count?: number;
}

export function SkeletonGrid({ count = 8 }: SkeletonGridProps) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
