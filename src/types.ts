export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  username?: string;
  password?: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  mustChangePassword?: boolean;
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
  sizes: string[];
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
  website?: string;
  createdAt: string;
}

export interface SaleItem {
  productId: string;
  sku: string;
  size?: string;
  name: string;
  price: number;
  costPrice: number; // Added to track profit
  quantity: number;
  total: number;
  image?: string;
}

export interface Sale {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  storeFee: number;
  customerFee: number;
  items: SaleItem[];
  paymentMethod: 'dinheiro' | 'pix' | 'cartão' | 'transferência';
  installments?: number;
  installmentsList?: Installment[];
  userId: string;
  userName: string;
  clientId?: string;
  customerName?: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'pending';
}

export interface PurchaseItem {
  productId: string;
  sku: string;
  size?: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface Installment {
  id: number;
  amount: number;
  dueDate: string;
  paidAt?: string;
  status: 'paid' | 'pending';
}

export interface Purchase {
  id: string;
  total: number;
  supplierId?: string;
  supplierName: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'pending';
  paymentMethod: string;
  installments: number;
  installmentsList?: Installment[];
  items: PurchaseItem[];
  itemsCount: number;
  userId: string;
  userName: string;
}

export interface Category {
  id: string;
  name: string;
}
