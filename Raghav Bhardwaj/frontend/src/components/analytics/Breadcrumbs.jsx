import React from 'react'
import { Link } from 'react-router-dom'

export default function Breadcrumbs({ items = [] }) {
  return (
    <nav className="text-sm text-slate-400 mb-4">
      {items.map((it, idx) => (
        <span key={idx}>
          <Link to={it.to} className="hover:underline">{it.label}</Link>
          {idx < items.length - 1 ? <span className="mx-2">/</span> : null}
        </span>
      ))}
    </nav>
  )
}
