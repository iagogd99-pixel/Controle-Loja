export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  gender: string;
  stock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  images: string[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Movement {
  id: string;
  productId: string;
  productName: string;
  type: 'in' | 'out';
  quantity: number;
  reason: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  birthDate: string;
  cpf: string;
  email: string;
  phone: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  cnpj?: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  costPrice: number; // Added to track profit
  quantity: number;
  total: number;
}

export interface Sale {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  fee: number;
  items: SaleItem[];
  paymentMethod: 'dinheiro' | 'pix' | 'cartão' | 'transferência';
  userId: string;
  userName: string;
  clientId?: string;
  customerName?: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
}

export interface Category {
  id: string;
  name: string;
}
