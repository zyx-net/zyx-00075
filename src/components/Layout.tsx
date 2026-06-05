import { Link, useNavigate } from 'react-router-dom'
import { Wrench, LogOut, Plus, ListTodo, User, Upload } from 'lucide-react'
import { useAuthStore, hasPermission } from '../store/authStore'
import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-2">
                <Wrench className="h-6 w-6 text-blue-600" />
                <span className="text-xl font-bold text-gray-900">维修工单管理系统</span>
              </Link>
              <div className="hidden sm:ml-10 sm:flex sm:space-x-4">
                <Link
                  to="/"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  <ListTodo className="h-4 w-4 mr-1.5" />
                  工单队列
                </Link>
                {hasPermission(user, 'tickets:create') && (
                  <Link
                    to="/create"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    新建工单
                  </Link>
                )}
                {hasPermission(user, 'batch:read') && (
                  <Link
                    to="/batch"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    批量导入
                  </Link>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-sm text-gray-700">
                <User className="h-4 w-4" />
                <span>{user?.name}</span>
                <span className="text-gray-400">({user?.roleLabel})</span>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                退出
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
