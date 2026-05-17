import React, { useState } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { AuthProvider } from '@/src/contexts/AuthContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';
import { ProtectedRoute } from '@/src/components/ProtectedRoute';
import { Layout } from '@/src/components/Layout';

// Mock Pages (will be replaced in next steps)
const Login = React.lazy(() => import('@/src/pages/Login'));
const Dashboard = React.lazy(() => import('@/src/pages/Dashboard'));
const Products = React.lazy(() => import('@/src/pages/Products'));
const ProductForm = React.lazy(() => import('@/src/pages/ProductForm'));
const Sales = React.lazy(() => import('@/src/pages/Sales'));
const SalesHistory = React.lazy(() => import('@/src/pages/SalesHistory'));
const SalesPending = React.lazy(() => import('@/src/pages/SalesPending'));
const PurchasesPending = React.lazy(() => import('@/src/pages/PurchasesPending'));
const Finances = React.lazy(() => import('@/src/pages/Finances'));
const Reports = React.lazy(() => import('@/src/pages/Reports'));
const Clients = React.lazy(() => import('@/src/pages/Clients'));
const Suppliers = React.lazy(() => import('@/src/pages/Suppliers'));
const Users = React.lazy(() => import('@/src/pages/Users'));
const Settings = React.lazy(() => import('@/src/pages/Settings'));
const Categories = React.lazy(() => import('@/src/pages/Categories'));
const Purchases = React.lazy(() => import('@/src/pages/Purchases'));
const PurchaseForm = React.lazy(() => import('@/src/pages/PurchaseForm'));

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
        <React.Suspense fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
             <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <Layout><Dashboard /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/produtos" element={
              <ProtectedRoute>
                <Layout><Products /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/produtos/novo" element={
              <ProtectedRoute>
                <Layout><ProductForm /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/produtos/editar/:id" element={
              <ProtectedRoute>
                <Layout><ProductForm /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/vendas" element={
              <ProtectedRoute>
                <Layout><Sales /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/historico-vendas" element={
              <ProtectedRoute>
                <Layout><SalesHistory /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/vendas-pendentes" element={
              <ProtectedRoute>
                <Layout><SalesPending /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/compras-pendentes" element={
              <ProtectedRoute>
                <Layout><PurchasesPending /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/financas" element={
              <ProtectedRoute>
                <Layout><Finances /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/relatorios" element={
              <ProtectedRoute>
                <Layout><Reports /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/clientes" element={
              <ProtectedRoute>
                <Layout><Clients /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/fornecedores" element={
              <ProtectedRoute>
                <Layout><Suppliers /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/usuarios" element={
              <ProtectedRoute adminOnly>
                <Layout><Users /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/configuracoes" element={
              <ProtectedRoute>
                <Layout><Settings /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/categorias" element={
              <ProtectedRoute>
                <Layout><Categories /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/compras" element={
              <ProtectedRoute>
                <Layout><Purchases /></Layout>
              </ProtectedRoute>
            } />

            <Route path="/compras/nova" element={
              <ProtectedRoute>
                <Layout><PurchaseForm /></Layout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </React.Suspense>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}
