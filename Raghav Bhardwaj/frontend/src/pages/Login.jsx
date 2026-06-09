import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Lock, User, ArrowRight, Globe, Shield, BarChart3 } from 'lucide-react'

const DEMO_CREDS = [
  { role: 'Admin',     username: 'admin',     password: 'admin123',     desc: 'Full platform access' },
  { role: 'Preparer',  username: 'preparer',  password: 'preparer123',  desc: 'Data entry & submission' },
  { role: 'Reviewer',  username: 'reviewer',  password: 'reviewer123',  desc: 'Review & approval' },
  { role: 'Approver',  username: 'approver',  password: 'approver123',  desc: 'Final sign-off' },
  { role: 'Certifier', username: 'certifier', password: 'certifier123', desc: 'Close certification' },
  { role: 'Auditor',   username: 'auditor',   password: 'auditor123',   desc: 'Read-only audit access' },
]

const FEATURES = [
  { icon: BarChart3,  title: 'Real-time Analytics',   body: 'Executive dashboards with live reconciliation KPIs and risk signals.' },
  { icon: Shield,     title: 'RBAC Governance',        body: '6-role workflow: Preparer → Reviewer → Approver → Certifier → Auditor.' },
  { icon: Globe,      title: 'Enterprise Scale',       body: 'Inspired by Oracle ARCS — built for financial close compliance.' },
]

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm]     = useState({ username: 'admin', password: 'admin123' })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await authAPI.login(form.username, form.password)
      setAuth(data.user, data.access_token)
      navigate('/')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  const fillCred = (c) => setForm({ username: c.username, password: c.password })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: '#1A1A24',
    }}>

      {/* ═══════════════════════════════════════════════════
          LEFT PANEL — EY Brand panel
      ═══════════════════════════════════════════════════ */}
      <div style={{
        width: '45%',
        minWidth: 400,
        background: '#2E2E38',
        display: 'flex',
        flexDirection: 'column',
        padding: '48px 52px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}>

        {/* EY Yellow top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#FFE600' }} />

        {/* Decorative geometry */}
        <div style={{
          position: 'absolute',
          bottom: -80, right: -80,
          width: 360, height: 360,
          borderRadius: '50%',
          background: 'rgba(255,230,0,0.04)',
          border: '1px solid rgba(255,230,0,0.08)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -10, right: -10,
          width: 200, height: 200,
          borderRadius: '50%',
          background: 'rgba(255,230,0,0.04)',
          border: '1px solid rgba(255,230,0,0.10)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          top: 120, left: -40,
          width: 120, height: 120,
          borderRadius: '50%',
          background: 'rgba(255,230,0,0.03)',
          pointerEvents: 'none',
        }} />

        {/* EY Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56, position: 'relative' }}>
          <div style={{
            width: 40, height: 40,
            borderRadius: 6,
            background: '#FFE600',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 14, fontWeight: 800,
              color: '#1A1A24',
              letterSpacing: '-0.04em',
              lineHeight: 1,
            }}>DRMS</span>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.01em' }}>
              DRMS
            </p>
            <p style={{ margin: 0, fontSize: 10.5, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.04em', marginTop: 1 }}>
            DRMS RECONCILIATION PLATFORM
            </p>
          </div>
        </div>

        {/* Main headline */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px',
            background: 'rgba(255,230,0,0.10)',
            border: '1px solid rgba(255,230,0,0.20)',
            borderRadius: 4,
            marginBottom: 20,
            width: 'fit-content',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFE600' }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FFE600', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Enterprise Edition
            </span>
          </div>

          <h1 style={{
            margin: 0,
            fontSize: 36,
            fontWeight: 800,
            color: '#F6F6FA',
            lineHeight: 1.10,
            letterSpacing: '-0.03em',
            marginBottom: 16,
          }}>
            Data Reconciliation<br />
            <span style={{ color: '#FFE600' }}>Management System</span>
          </h1>

          <p style={{
            margin: 0,
            fontSize: 14,
            color: 'rgba(255,255,255,0.48)',
            lineHeight: 1.65,
            maxWidth: 340,
            marginBottom: 44,
          }}>
            Enterprise-grade financial close and reconciliation platform, inspired by Oracle ARCS compliance standards.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 34, height: 34, flexShrink: 0,
                  borderRadius: 8,
                  background: 'rgba(255,230,0,0.08)',
                  border: '1px solid rgba(255,230,0,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: 15, height: 15, color: '#FFE600' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>{title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.40)', lineHeight: 1.5 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative' }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.28)', lineHeight: 1.5 }}>
            © 2024 Global Limited. All Rights Reserved.<br />
          Refers to the global organization of member firms.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          RIGHT PANEL — Login form
      ═══════════════════════════════════════════════════ */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px',
        background: '#1A1A24',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* Subtle glow */}
        <div style={{
          position: 'absolute',
          top: '20%', left: '50%',
          transform: 'translateX(-50%)',
          width: 500, height: 400,
          background: 'radial-gradient(ellipse, rgba(255,230,0,0.05) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ width: '100%', maxWidth: 380, position: 'relative' }}>

          {/* Form header */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: '#F6F6FA',
              letterSpacing: '-0.02em',
              marginBottom: 8,
            }}>
              Sign in
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#747480' }}>
              Enter your credentials to access the platform
            </p>
          </div>

          {/* Login card */}
          <div style={{
            background: '#2E2E38',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 16,
          }}>
            <form onSubmit={handleSubmit} style={{ padding: '24px 24px 20px' }}>
              {/* Username */}
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#747480',
                  marginBottom: 6,
                }}>
                  Username
                </label>
                <div style={{ position: 'relative' }}>
                  <User style={{
                    position: 'absolute', left: 11, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 14, height: 14,
                    color: '#747480',
                    pointerEvents: 'none',
                  }} />
                  <input
                    style={{
                      width: '100%',
                      height: 40,
                      paddingLeft: 36,
                      paddingRight: 12,
                      fontSize: 13,
                      fontFamily: 'Inter, sans-serif',
                      color: '#F6F6FA',
                      background: '#383843',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 7,
                      outline: 'none',
                      transition: 'border-color 120ms',
                      boxSizing: 'border-box',
                    }}
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="your.username"
                    autoFocus
                    onFocus={(e) => { e.target.style.borderColor = '#FFE600'; e.target.style.boxShadow = '0 0 0 2px rgba(255,230,0,0.10)' }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#747480',
                  marginBottom: 6,
                }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock style={{
                    position: 'absolute', left: 11, top: '50%',
                    transform: 'translateY(-50%)',
                    width: 14, height: 14,
                    color: '#747480',
                    pointerEvents: 'none',
                  }} />
                  <input
                    style={{
                      width: '100%',
                      height: 40,
                      paddingLeft: 36,
                      paddingRight: 40,
                      fontSize: 13,
                      fontFamily: 'Inter, sans-serif',
                      color: '#F6F6FA',
                      background: '#383843',
                      border: '1px solid rgba(255,255,255,0.10)',
                      borderRadius: 7,
                      outline: 'none',
                      transition: 'border-color 120ms',
                      boxSizing: 'border-box',
                    }}
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    onFocus={(e) => { e.target.style.borderColor = '#FFE600'; e.target.style.boxShadow = '0 0 0 2px rgba(255,230,0,0.10)' }}
                    onBlur={(e)  => { e.target.style.borderColor = 'rgba(255,255,255,0.10)'; e.target.style.boxShadow = 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={{
                      position: 'absolute', right: 10, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      cursor: 'pointer', color: '#747480',
                      padding: 2,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {showPass
                      ? <EyeOff style={{ width: 14, height: 14 }} />
                      : <Eye    style={{ width: 14, height: 14 }} />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  height: 42,
                  background: loading ? '#C8B200' : '#FFE600',
                  border: 'none',
                  borderRadius: 7,
                  color: '#1A1A24',
                  fontSize: 13.5,
                  fontWeight: 700,
                  fontFamily: 'Inter, sans-serif',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 120ms, box-shadow 120ms',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = '#FFED4A'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(255,230,0,0.28)' }}}
                onMouseLeave={(e) => { e.currentTarget.style.background = loading ? '#C8B200' : '#FFE600'; e.currentTarget.style.boxShadow = 'none' }}
              >
                {loading ? (
                  <span style={{
                    width: 16, height: 16,
                    border: '2px solid rgba(26,26,36,0.30)',
                    borderTopColor: '#1A1A24',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                ) : (
                  <>
                    Sign In
                    <ArrowRight style={{ width: 15, height: 15 }} />
                  </>
                )}
              </button>
            </form>

            {/* Demo accounts */}
            <div style={{
              padding: '14px 24px 18px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <p style={{
                margin: '0 0 10px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: '#747480',
              }}>
                Demo Accounts
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {DEMO_CREDS.map((c) => (
                  <button
                    key={c.role}
                    type="button"
                    onClick={() => fillCred(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'background 100ms, border-color 100ms',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,230,0,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,230,0,0.20)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)', fontFamily: 'Inter, sans-serif' }}>{c.role}</p>
                      <p style={{ margin: 0, fontSize: 10.5, color: '#747480', fontFamily: 'Inter, sans-serif' }}>{c.desc}</p>
                    </div>
                    <span style={{ fontSize: 10.5, color: '#FFE600', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
                      Use →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: '#4E4E5B' }}>
            DRMS Enterprise Platform · Financial Close & Reconciliation
          </p>
        </div>
      </div>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
