import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth, RequireRole } from './auth/guards'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/ui'
import { LoginPage } from './features/login/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ProductsPage } from './features/catalogue/ProductsPage'
import { ProductDetailPage } from './features/catalogue/ProductDetailPage'
import { SetupPage } from './features/catalogue/SetupPage'
import { SettingsPage } from './features/settings/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
})

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="catalogue/products" element={<ProductsPage />} />
          <Route path="catalogue/products/:id" element={<ProductDetailPage />} />
          <Route path="catalogue/setup" element={<SetupPage />} />
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
