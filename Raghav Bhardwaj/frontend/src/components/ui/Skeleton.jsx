export function Skeleton({ width, height = 16, className = '', style = {} }) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width: width || '100%', height, borderRadius: 'var(--r-sm)', ...style }}
    />
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 16px', background: 'var(--surface-2)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} height={14} style={{ flex: j === 0 ? '0 0 60px' : 1 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default Skeleton
