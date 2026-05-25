import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { authAPI } from '../api'
import toast from 'react-hot-toast'
import { Scale, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ username: 'admin', password: 'admin123' })
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
      toast.error(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 border"
            style={{ background: 'linear-gradient(180deg, var(--accent-primary), var(--accent-primary-strong))', borderColor: 'rgba(255,255,255,0.35)' }}
          >
            <Scale className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">DRMS</h1>
          <p className="text-slate-400 text-sm mt-1">Enterprise Reconciliation Workbench</p>
        </div>

        {/* Card */}
        <div className="card oracle-hero p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="admin"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary w-full justify-center py-2.5"
              disabled={loading}
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Demo credentials */}
        <div className="mt-4 text-center text-xs text-slate-500">
          Demo: <span className="text-slate-400">admin / admin123</span> or{' '}
          <span className="text-slate-400">reviewer / reviewer123</span> or{' '}
          <span className="text-slate-400">preparer / preparer123</span>
        </div>
      </div>
    </div>
  )
}
