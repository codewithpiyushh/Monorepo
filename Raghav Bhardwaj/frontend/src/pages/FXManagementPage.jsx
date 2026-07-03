import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import ReactECharts from 'echarts-for-react'
import toast from 'react-hot-toast'
import {
  RefreshCw, DollarSign, Globe, TrendingUp, Calendar,
  ChevronUp, ChevronDown, Search, Zap, BarChart2, ArrowUpDown,
} from 'lucide-react'
import { fxAPI } from '../api/fxAPI'

// ─────────────────────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, accent = '#FFE600', loading }) {
  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-2)',
      borderRadius: 12, padding: '18px 20px', flex: 1, minWidth: 180,
      borderTop: `2px solid ${accent}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {label}
        </span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon style={{ width: 15, height: 15, color: accent }} />
        </div>
      </div>
      {loading
        ? <div style={{ height: 28, width: '60%', borderRadius: 6, background: 'var(--surface-3)', animation: 'pulse 1.5s infinite' }} />
        : <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{value ?? '—'}</p>
      }
      {sub && <p style={{ margin: 0, fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FXManagementPage
// ─────────────────────────────────────────────────────────────────────────────
export default function FXManagementPage() {
  const [refreshBase, setRefreshBase] = useState('USD')
  const [rateFilter,  setRateFilter]  = useState('')
  const [sortKey,     setSortKey]     = useState('from')
  const [sortAsc,     setSortAsc]     = useState(true)
  const [page,        setPage]        = useState(0)
  const PAGE_SIZE = 20

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: dash, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['fx-dashboard'],
    queryFn:  fxAPI.dashboard,
    staleTime: 60_000,
  })

  const { data: ratesData, isLoading: ratesLoading, refetch: refetchRates } = useQuery({
    queryKey: ['fx-rates'],
    queryFn:  () => fxAPI.listRates({ limit: 500 }),
    staleTime: 60_000,
  })

  // ── Live refresh mutation ──────────────────────────────────────────────────
  const refreshMutation = useMutation({
    mutationFn: () => fxAPI.refreshRates(refreshBase),
    onSuccess: (data) => {
      toast.success(`✅ ${data.upserted} pairs refreshed for ${data.base} (${data.date})`)
      refetchDash()
      refetchRates()
    },
    onError: (err) => {
      toast.error(`❌ Refresh failed: ${err.message}`)
    },
  })

  // ── Rates table — filter + sort + paginate ─────────────────────────────────
  const allRates = ratesData?.rates || []
  const filteredRates = useMemo(() => {
    const term = rateFilter.toLowerCase()
    return allRates
      .filter(r =>
        !term ||
        r.from_currency.toLowerCase().includes(term) ||
        r.to_currency.toLowerCase().includes(term)
      )
      .sort((a, b) => {
        const va = sortKey === 'rate' ? a.rate : (a[sortKey === 'from' ? 'from_currency' : sortKey === 'to' ? 'to_currency' : 'rate_date'] || '')
        const vb = sortKey === 'rate' ? b.rate : (b[sortKey === 'from' ? 'from_currency' : sortKey === 'to' ? 'to_currency' : 'rate_date'] || '')
        if (va < vb) return sortAsc ? -1 : 1
        if (va > vb) return sortAsc ? 1 : -1
        return 0
      })
  }, [allRates, rateFilter, sortKey, sortAsc])

  const pageCount    = Math.ceil(filteredRates.length / PAGE_SIZE)
  const pagedRates   = filteredRates.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(s => !s)
    else { setSortKey(key); setSortAsc(true) }
    setPage(0)
  }

  // ── Exposure chart config ──────────────────────────────────────────────────
  const exposure     = dash?.currency_exposure || []
  const chartOption  = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1A1A2E',
      borderColor: '#2D2D4A',
      textStyle: { color: '#E2E8F0', fontSize: 12 },
      formatter: (params) => {
        const p = params[0]
        return `<b>${p.name}</b><br/>Records: ${p.data.count?.toLocaleString() || '—'}<br/>Volume: ${Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      },
    },
    grid: { left: 60, right: 30, top: 20, bottom: 20 },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#64748B', fontSize: 10,
        formatter: v => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v,
      },
      splitLine: { lineStyle: { color: '#1E293B' } },
    },
    yAxis: {
      type: 'category',
      data: [...exposure].reverse().map(r => r.currency),
      axisLabel: { color: '#94A3B8', fontSize: 12, fontWeight: 700 },
      axisLine: { lineStyle: { color: '#2D2D4A' } },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: [...exposure].reverse().map(r => ({ value: r.total_volume, count: r.record_count })),
      barMaxWidth: 28,
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#FFE60033' },
            { offset: 1, color: '#FFE600' },
          ],
        },
        borderRadius: [0, 6, 6, 0],
      },
      emphasis: { itemStyle: { color: '#FFF176' } },
    }],
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      padding: '28px 32px', maxWidth: 1280, margin: '0 auto',
      fontFamily: 'Inter, -apple-system, sans-serif',
      color: 'var(--text-primary)',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: '#FFE60018', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #FFE60033',
          }}>
            <DollarSign style={{ width: 18, height: 18, color: '#FFE600' }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              FX Management
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
              Real-time exchange rate management &amp; multi-currency exposure
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <KPICard
          label="Reporting Currency"
          value={dash?.reporting_currency || 'USD'}
          icon={DollarSign}
          accent="#FFE600"
          loading={dashLoading}
        />
        <KPICard
          label="Total Rate Pairs"
          value={dash?.total_rate_pairs?.toLocaleString()}
          sub={`${dash?.currencies_covered?.length || 0} currencies tracked`}
          icon={ArrowUpDown}
          accent="#4D94FF"
          loading={dashLoading}
        />
        <KPICard
          label="Last Live Refresh"
          value={dash?.last_refresh ? new Date(dash.last_refresh).toLocaleDateString() : 'Never'}
          sub="Source: open.er-api.com"
          icon={Calendar}
          accent="#00C891"
          loading={dashLoading}
        />
        <KPICard
          label="Currencies Exposed"
          value={dash?.currency_exposure?.length ?? 0}
          sub="Across all reconciliation records"
          icon={Globe}
          accent="#A78BFA"
          loading={dashLoading}
        />
      </div>

      {/* Two-column layout: Refresh Panel + Exposure Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, marginBottom: 28 }}>

        {/* ── Live Refresh Panel ── */}
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 12, padding: '20px',
          borderTop: '2px solid #FFE600',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Zap style={{ width: 15, height: 15, color: '#FFE600' }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Live Rate Refresh
            </h3>
          </div>

          <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            Fetch current rates from <strong style={{ color: 'var(--text-secondary)' }}>open.er-api.com</strong> and upsert into the rate table.
            Rates are also refreshed automatically daily at 07:00.
          </p>

          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', display: 'block', marginBottom: 6 }}>
            BASE CURRENCY
          </label>
          <select
            value={refreshBase}
            onChange={e => setRefreshBase(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              background: 'var(--surface-3)', border: '1px solid var(--border-2)',
              color: 'var(--text-primary)', fontSize: 13, marginBottom: 14,
              outline: 'none',
            }}
          >
            {['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            style={{
              width: '100%', padding: '10px',
              background: refreshMutation.isPending ? '#FFE60066' : '#FFE600',
              color: '#0F0F17', borderRadius: 8, border: 'none',
              fontSize: 13, fontWeight: 700, cursor: refreshMutation.isPending ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 150ms',
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: refreshMutation.isPending ? 'spin 1s linear infinite' : 'none' }} />
            {refreshMutation.isPending ? 'Fetching...' : 'Refresh Live Rates'}
          </button>

          {/* Coverage badges */}
          {(dash?.currencies_covered?.length > 0) && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>COVERED CURRENCIES</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {dash.currencies_covered.slice(0, 20).map(c => (
                  <span key={c} style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    background: 'var(--surface-3)', border: '1px solid var(--border-1)',
                    borderRadius: 6, color: 'var(--text-secondary)',
                  }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Exposure Chart ── */}
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          borderRadius: 12, padding: '20px',
          borderTop: '2px solid #4D94FF',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart2 style={{ width: 15, height: 15, color: '#4D94FF' }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Currency Exposure
            </h3>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 4 }}>
              by total reconciliation volume
            </span>
          </div>

          {dashLoading ? (
            <div style={{ height: 240, background: 'var(--surface-3)', borderRadius: 8, animation: 'pulse 1.5s infinite' }} />
          ) : exposure.length === 0 ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
              <Globe style={{ width: 32, height: 32, color: 'var(--text-disabled)' }} />
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
                No reconciliation records with currency data yet
              </p>
            </div>
          ) : (
            <ReactECharts
              option={chartOption}
              style={{ height: Math.max(240, exposure.length * 36) }}
              opts={{ renderer: 'canvas' }}
            />
          )}
        </div>
      </div>

      {/* ── Exchange Rate Table ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface-2)', border: '1px solid var(--border-2)',
        borderRadius: 12, overflow: 'hidden',
        borderTop: '2px solid #A78BFA',
      }}>
        {/* Table header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-1)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp style={{ width: 15, height: 15, color: '#A78BFA' }} />
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Exchange Rates
            </h3>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px',
              background: '#A78BFA18', color: '#A78BFA', borderRadius: 9999,
            }}>
              {filteredRates.length.toLocaleString()} pairs
            </span>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--text-disabled)' }} />
            <input
              value={rateFilter}
              onChange={e => { setRateFilter(e.target.value); setPage(0) }}
              placeholder="Filter currencies…"
              style={{
                padding: '7px 10px 7px 28px', borderRadius: 8,
                background: 'var(--surface-3)', border: '1px solid var(--border-2)',
                color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 180,
              }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-3)' }}>
                {[
                  { key: 'from', label: 'From' },
                  { key: 'to',   label: 'To' },
                  { key: 'rate', label: 'Rate' },
                  { key: 'date', label: 'Date' },
                  { key: 'src',  label: 'Source' },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    style={{
                      padding: '10px 16px', textAlign: 'left', cursor: 'pointer',
                      color: sortKey === key ? '#FFE600' : 'var(--text-tertiary)',
                      fontWeight: 700, fontSize: 11, letterSpacing: '0.4px', textTransform: 'uppercase',
                      userSelect: 'none',
                      borderBottom: '1px solid var(--border-1)',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {label}
                      {sortKey === key
                        ? (sortAsc
                          ? <ChevronUp style={{ width: 11, height: 11 }} />
                          : <ChevronDown style={{ width: 11, height: 11 }} />)
                        : <ArrowUpDown style={{ width: 10, height: 10, opacity: 0.4 }} />
                      }
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ratesLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-0)' }}>
                        <div style={{ height: 14, width: '60%', borderRadius: 4, background: 'var(--surface-3)', animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : pagedRates.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                    No rates found{rateFilter ? ` for "${rateFilter}"` : ''}. Use Refresh Live Rates to populate.
                  </td>
                </tr>
              ) : (
                pagedRates.map((r, i) => (
                  <tr
                    key={`${r.from_currency}-${r.to_currency}-${r.rate_date}`}
                    style={{
                      borderBottom: '1px solid var(--border-0)',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface-1)',
                      transition: 'background 80ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                    onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--surface-1)'}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontWeight: 800, fontSize: 13,
                        background: '#FFE60018', color: '#FFE600',
                        border: '1px solid #FFE60033', borderRadius: 6, padding: '2px 8px',
                      }}>
                        {r.from_currency}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontWeight: 700, fontSize: 12,
                        background: 'var(--surface-3)', color: 'var(--text-secondary)',
                        border: '1px solid var(--border-1)', borderRadius: 6, padding: '2px 8px',
                      }}>
                        {r.to_currency}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: 13 }}>
                      {r.rate?.toFixed(6)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {r.rate_date}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        {r.source || '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div style={{
            padding: '12px 20px', borderTop: '1px solid var(--border-1)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              Page {page + 1} of {pageCount} &mdash; {filteredRates.length.toLocaleString()} total pairs
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  background: page === 0 ? 'var(--surface-3)' : 'var(--surface-4)',
                  border: '1px solid var(--border-1)', color: 'var(--text-secondary)',
                  fontSize: 12, cursor: page === 0 ? 'not-allowed' : 'pointer',
                  opacity: page === 0 ? 0.5 : 1,
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                style={{
                  padding: '5px 12px', borderRadius: 6,
                  background: page >= pageCount - 1 ? 'var(--surface-3)' : 'var(--surface-4)',
                  border: '1px solid var(--border-1)', color: 'var(--text-secondary)',
                  fontSize: 12, cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer',
                  opacity: page >= pageCount - 1 ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Spin keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}
