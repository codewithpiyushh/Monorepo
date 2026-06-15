import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BarChart3, FileClock, LockKeyhole, LogIn, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '../api'
import { useAuthStore } from '../store/authStore'

const DEMO_ACCOUNTS = [
  { label: 'Admin', username: 'admin', password: 'admin123' },
  { label: 'Preparer', username: 'preparer', password: 'preparer123' },
  { label: 'Reviewer', username: 'reviewer', password: 'reviewer123' },
  { label: 'Approver', username: 'approver', password: 'approver123' },
  { label: 'Certifier', username: 'certifier', password: 'certifier123' },
  { label: 'Auditor', username: 'auditor', password: 'auditor123' },
]

const BRAND_POINTS = [
  {
    icon: BarChart3,
    title: 'Variance first',
    text: 'See the unexplained gap, root cause, and risk impact in one workflow.',
  },
  {
    icon: ShieldCheck,
    title: 'Controls built in',
    text: 'Submission guardrails, role checks, and audit-ready approval paths.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Role aware',
    text: 'Preparer, reviewer, approver, certifier, auditor, and admin views.',
  },
]

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const usernameRef = useRef(null)

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const previousTitle = document.title
    document.body.classList.add('login-page')
    document.title = 'DRMS | Sign in'
    usernameRef.current?.focus()

    return () => {
      document.body.classList.remove('login-page')
      document.title = previousTitle
    }
  }, [])

  const runLogin = async (nextUsername, nextPassword) => {
    if (loading) return
    setLoading(true)
    setError('')

    try {
      const data = await authAPI.login(nextUsername, nextPassword)
      setAuth(data.user, data.access_token)
      toast.success(`Welcome, ${data.user?.username || nextUsername}`)
      navigate('/')
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Unable to sign in right now.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    void runLogin(username.trim(), password)
  }

  const handleDemoLogin = (account) => {
    setUsername(account.username)
    setPassword(account.password)
    void runLogin(account.username, account.password)
  }

  return (
    <main className="login-screen">
      <div className="login-shell">
        <section className="login-brand-panel" aria-label="Product overview">
          <div className="login-brand-top">
            <div className="login-brand-badge">
              <span>DRMS</span>
            </div>
            <div className="login-brand-copy">
              <p className="login-ey-label">Ernst & Young</p>
              <h1>Data Reconciliation Management System</h1>
              <p className="login-brand-description">
                A compact entry point for reconciliation, variance management,
                and close governance across every role.
              </p>
            </div>
          </div>

          <div className="login-brand-points">
            {BRAND_POINTS.map(({ icon: Icon, title, text }) => (
              <article key={title} className="login-point-card">
                <Icon className="login-point-icon" />
                <div>
                  <h2>{title}</h2>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="login-brand-footer">
            <div className="login-mini-stat">
              <FileClock size={14} />
              <span>One screen. One sign-in.</span>
            </div>
            <div className="login-mini-stat">
              <Sparkles size={14} />
              <span>Built for fast role switching.</span>
            </div>
          </div>
        </section>

        <section className="login-auth-panel" aria-label="Sign in form">
          <div className="login-card">
            <div className="login-card-header">
              <div className="login-card-kicker">
                <LogIn size={14} />
                <span>Sign in</span>
              </div>
              <h2>Welcome back</h2>
              <p>Enter your credentials or use a demo role to continue.</p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <label className="login-field">
                <span>
                  <UserRound size={14} />
                  Username
                </span>
                <input
                  ref={usernameRef}
                  className="login-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  spellCheck="false"
                  placeholder="Enter username"
                />
              </label>

              <label className="login-field">
                <span>
                  <LockKeyhole size={14} />
                  Password
                </span>
                <input
                  className="login-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter password"
                />
              </label>

              <button className="login-submit" type="submit" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
                <ArrowRight size={15} />
              </button>

              {error ? (
                <div className="login-error" role="alert">
                  {error}
                </div>
              ) : null}
            </form>

            <div className="login-demo-section">
              <div className="login-demo-heading">
                <span>Demo roles</span>
                <p>Pick one to jump straight into the app.</p>
              </div>

              <div className="login-demo-grid">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className="login-demo-button"
                    onClick={() => handleDemoLogin(account)}
                    disabled={loading}
                  >
                    <strong>{account.label}</strong>
                    <span>{account.username}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
