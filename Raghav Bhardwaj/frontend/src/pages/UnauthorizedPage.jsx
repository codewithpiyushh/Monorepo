import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'

export default function UnauthorizedPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="bg-red-500/20 p-4 rounded-full">
            <Lock className="w-16 h-16 text-red-400" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">403</h1>
        <h2 className="text-2xl font-semibold text-slate-100 mb-4">Access Denied</h2>
        <p className="text-slate-400 mb-8">
          You don't have permission to access this resource. Your role may not have the required privileges.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
          >
            Go Back
          </button>
          <button
            onClick={() => navigate('/command-center')}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
          >
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
