import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/routing/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrdersPage } from './pages/OrdersPage'
import { NewOrderPage } from './pages/NewOrderPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { ProductsPage } from './pages/ProductsPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { UsersPage } from './pages/UsersPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route element={<ProtectedRoute allowedRoles={['admin', 'seller']} />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="productos" element={<ProductsPage />} />
          <Route path="pedidos">
            <Route index element={<OrdersPage />} />
            <Route path="nuevo" element={<NewOrderPage />} />
            <Route path=":id" element={<OrderDetailPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="usuarios" element={<UsersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
