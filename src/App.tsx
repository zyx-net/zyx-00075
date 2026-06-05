import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import QueuePage from './pages/QueuePage'
import TicketDetail from './pages/TicketDetail'
import CreateTicket from './pages/CreateTicket'
import BatchListPage from './pages/BatchListPage'
import BatchImportPage from './pages/BatchImportPage'
import BatchDetailPage from './pages/BatchDetailPage'
import TemplateListPage from './pages/TemplateListPage'

function App() {
  const { checkAuth, isLoading } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <QueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateTicket />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <ProtectedRoute>
              <TicketDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/batch"
          element={
            <ProtectedRoute>
              <BatchListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/batch/import"
          element={
            <ProtectedRoute>
              <BatchImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/batch/:id"
          element={
            <ProtectedRoute>
              <BatchDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <TemplateListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <QueuePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  )
}

export default App
