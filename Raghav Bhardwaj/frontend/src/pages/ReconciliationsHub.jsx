import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { enterpriseAPI, schedulesAPI } from '../api'
import PageHeader from '../components/ui/PageHeader'
import { Workflow, CalendarDays, SlidersHorizontal, BarChart3, ArrowRight } from 'lucide-react'
import { LoadingState } from '../components/ui/PageState'

const MODULES = (profiles, schedules, ruleDefs) => [
  {
    title: 'Reconciliation Profiles',
    description: 'Define and manage account reconciliation profiles, assign owners, set risk levels and frequencies.',
    to: '/reconciliation-profiles',
    icon: Workflow,
    count: profiles.length,
    unit: 'profiles',
    tone: 'accent',
  },
  {
    title: 'Enterprise Ops',
    description: 'Run batch ingestion, matching, journal automation, FX conversion, and exception workflows.',
    to: '/enterprise-ops',
    icon: ArrowRight,
    count: profiles.length,
    unit: 'ops views',
    tone: 'accent',
  },
  {
    title: 'Close Calendar',
    description: 'Schedule period close dates, lock periods, and manage cycle timelines across entities.',
    to: '/close-calendar',
    icon: CalendarDays,
    count: schedules.length,
    unit: 'schedules',
    tone: 'info',
  },
  {
    title: 'Rule Builder',
    description: 'Create and manage matching rules, tolerance thresholds, and pre-match filter conditions.',
    to: '/rule-builder',
    icon: SlidersHorizontal,
    count: ruleDefs.length,
    unit: 'rules',
    tone: 'success',
  },
  {
    title: 'Reconciliation Compliance',
    description: 'Drill-down analytics from entity level to transaction level with exception classification.',
    to: '/analytics-explorer',
    icon: BarChart3,
    count: profiles.length,
    unit: 'drill-ready views',
    tone: 'warning',
  },
]

const TONE_STYLES = {
  accent:  { border: 'var(--accent-border)',  iconBg: 'var(--accent-subtle)',  iconColor: 'var(--accent)' },
  info:    { border: 'var(--info-bdr)',        iconBg: 'var(--info-bg)',        iconColor: 'var(--info)' },
  success: { border: 'var(--ok-bdr)',          iconBg: 'var(--ok-bg)',          iconColor: 'var(--ok)' },
  warning: { border: 'var(--warn-bdr)',        iconBg: 'var(--warn-bg)',        iconColor: 'var(--warn)' },
}

export default function ReconciliationsHub() {
  const { data: profiles  = [], isLoading: p } = useQuery({ queryKey: ['enterprise-profiles'], queryFn: enterpriseAPI.listProfiles })
  const { data: schedules = [], isLoading: s } = useQuery({ queryKey: ['schedules'],           queryFn: schedulesAPI.list })
  const { data: ruleDefs  = [], isLoading: r } = useQuery({ queryKey: ['rule-definitions'],    queryFn: () => enterpriseAPI.listRuleDefinitions() })
  const loading = p || s || r

  const modules = MODULES(profiles, schedules, ruleDefs)

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Reconciliations"
        subtitle="Manage profile setup, close schedules, and matching rules from one place."
        badge={`${profiles.length} profiles`}
      />

      <div className="flex-1 overflow-auto p-5" style={{ background: 'var(--surface-0)' }}>
        {loading ? <LoadingState /> : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {modules.map((m) => {
              const Icon  = m.icon
              const tone  = TONE_STYLES[m.tone] || TONE_STYLES.accent

              return (
                <Link key={m.title} to={m.to} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      background: 'var(--surface-2)',
                      border: `1px solid var(--border-1)`,
                      borderRadius: 'var(--r-lg)',
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'border-color 160ms, box-shadow 160ms',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = tone.border
                      e.currentTarget.style.boxShadow  = 'var(--shadow-sm)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-1)'
                      e.currentTarget.style.boxShadow  = 'none'
                    }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: 'var(--r-md)',
                      background: tone.iconBg,
                      border: `1px solid ${tone.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon style={{ width: 16, height: 16, color: tone.iconColor }} />
                    </div>

                    {/* Text */}
                    <div style={{ flex: 1 }}>
                      <p style={{
                        fontSize: 13.5, fontWeight: 700,
                        fontFamily: 'IBM Plex Sans Condensed, sans-serif',
                        color: 'var(--text-primary)', marginBottom: 4,
                      }}>
                        {m.title}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                        {m.description}
                      </p>
                    </div>

                    {/* Footer */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      paddingTop: 8, borderTop: '1px solid var(--border-0)',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {m.count} {m.unit}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: tone.iconColor }}>
                        Open <ArrowRight style={{ width: 12, height: 12 }} />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
