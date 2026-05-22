export function Skeleton({ className = '' }) {
  return <div className={`bg-slate-200 animate-pulse rounded ${className}`} />
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ count = 3, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 border border-slate-200 rounded-lg space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={2} />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ rows = 5, cols = 4, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, rowI) => (
        <div key={rowI} className="flex gap-3">
          {Array.from({ length: cols }).map((_, colI) => (
            <Skeleton 
              key={colI}
              className={`h-12 flex-1 ${colI === cols - 1 ? 'w-1/4' : ''}`}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-3 p-3 border-b border-slate-200">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowI) => (
        <div key={rowI} className="flex gap-3 p-3 border-b border-slate-100">
          {Array.from({ length: cols }).map((_, colI) => (
            <Skeleton key={`r-${rowI}-c-${colI}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export default Skeleton
