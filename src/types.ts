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
  sizeStock?: Record<string, number>;
  minStock: number;
  baseCostPrice?: number;
  shippingCostPrice?: number;
  interestCostPrice?: number;
  overheadCostPrice?: number;
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
}

export interface Sale {
  id: string;
  total: number;
  subtotal: number;
  discount: number;
  storeFee: number;
  storeFee2?: number;
  customerFee: number;
  shipping?: number;
  interest?: number;
  interest2?: number;
  items: SaleItem[];
  paymentMethod: string;
  isSplitPayment?: boolean;
  paymentMethod2?: string;
  splitAmount1?: number;
  splitAmount2?: number;
  installments?: number;
  installments2?: number;
  installmentsList?: Installment[];
  userId: string;
  userName: string;
  clientId?: string;
  customerName?: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'pending';
  paymentStatus2?: 'paid' | 'pending';
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
  subtotal: number;
  discount: number;
  fee: number;
  freight: number;
  interest: number;
  interest2?: number;
  total: number;
  supplierId?: string;
  supplierName: string;
  timestamp: string;
  status: 'completed' | 'cancelled';
  paymentStatus: 'paid' | 'pending';
  paymentStatus2?: 'paid' | 'pending';
  paymentMethod: string;
  isSplitPayment?: boolean;
  paymentMethod2?: string;
  splitAmount1?: number;
  splitAmount2?: number;
  installments: number;
  installments2?: number;
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

export interface Expense {
  id: string;
  description: string;
  amount: number;
  paymentMethod: string;
  category: 'operacional' | 'pessoal' | 'manutenção' | 'outros';
  timestamp: string;
  date: string;
  userId: string;
  userName: string;
  purchaseId?: string;
  supplierName?: string;
}
