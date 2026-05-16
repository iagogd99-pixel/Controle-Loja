import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Search, 
  Loader2, 
  Save, 
  Package, 
  User,
  History,
  ShoppingCart,
  Truck,
  CheckCircle2,
  DollarSign,
  X
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  onSnapshot,
  orderBy,
  query, 
  where,
  serverTimestamp,
  increment,
  runTransaction
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatCurrency, cn } from '@/src/lib/utils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  costPrice: number;
}

interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  price: number; // For cost price at time of purchase
  total: number;
}

interface Supplier {
  id: string;
  name: string;
}

export default function PurchaseForm() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Cart
  const [cart, setCart] = useState<PurchaseItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedSupplierName, setSelectedSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [discount, setDiscount] = useState(0);
  const [fee, setFee] = useState(0);
  const [freight, setFreight] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [installments, setInstallments] = useState(1);
  
  // Search state
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showAddItemOptions, setShowAddItemOptions] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Quick Add State

  const [categories, setCategories] = useState<{id: string, name: string, type: string}[]>([]);
  const [creatingProduct, setCreatingProduct] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const supplierSnap = await getDocs(collection(db, 'suppliers'));
        const categorySnap = await getDocs(collection(db, 'categories'));
        
        setSuppliers(supplierSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Supplier[]);
        setCategories(categorySnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[]);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Use onSnapshot for products to ensure auto-add works even if there's a slight delay in document creation
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
    });

    return () => unsubscribe();
  }, []);

  const addToCart = React.useCallback((product: Product) => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.productId === product.id);
      if (existing) {
        return prevCart.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
            : item
        );
      } else {
        return [...prevCart, {
          productId: product.id,
          name: product.name,
          quantity: 1,
          price: product.costPrice || 0,
          total: product.costPrice || 0
        }];
      }
    });
    setShowProductSearch(false);
    setSearchTerm('');
  }, []);

  // Handle auto-add from returnTo
  useEffect(() => {
    const incomingId = searchParams.get('productId');
    if (incomingId && products.length > 0) {
      const product = products.find(p => p.id === incomingId);
      if (product) {
        addToCart(product);
        // Clear param so it doesn't keep adding on refresh
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('productId');
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [searchParams, products, setSearchParams, addToCart]);

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) return;
    setCart(cart.map(item => 
      item.productId === productId 
        ? { ...item, quantity, total: quantity * item.price }
        : item
    ));
  };

  const updatePrice = (productId: string, price: number) => {
    if (price < 0) return;
    setCart(cart.map(item => 
      item.productId === productId 
        ? { ...item, price, total: item.quantity * price }
        : item
    ));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.total, 0);
  const finalTotal = cartTotal - discount + fee + freight;

  const handleSubmit = async () => {
    if (!profile || cart.length === 0 || submitting) return;
    
    try {
      setSubmitting(true);
      
      // Use a transaction to ensure stock consistency
      await runTransaction(db, async (transaction) => {
        // 1. Create the purchase document
        const purchaseRef = doc(collection(db, 'purchases'));
        const purchaseData = {
          supplierId: selectedSupplierId,
          supplierName: selectedSupplierName || (suppliers.find(s => s.id === selectedSupplierId)?.name) || 'Fornecedor Avulso',
          subtotal: cartTotal,
          discount: discount,
          fee: fee,
          freight: freight,
          total: finalTotal,
          paymentMethod: paymentMethod,
          installments: paymentMethod === 'cartão' ? installments : 1,
          status: 'completed',
          timestamp: serverTimestamp(),
          userId: profile.uid,
          userName: profile.name,
          note: note,
          items: cart
        };
        transaction.set(purchaseRef, purchaseData);

        // 2. Update stock and register movements for each product
        for (const item of cart) {
          const productRef = doc(db, 'products', item.productId);
          
          // Update product stock and cost price
          transaction.update(productRef, {
            stock: increment(item.quantity),
            costPrice: item.price, // Update to the latest cost price
            updatedAt: serverTimestamp()
          });

          // Register movement document
          const movementRef = doc(collection(db, 'movements'));
          transaction.set(movementRef, {
            productId: item.productId,
            productName: item.name,
            type: 'in',
            quantity: item.quantity,
            reason: `Entrada via Compra #${purchaseRef.id.slice(-6).toUpperCase()}`,
            userId: profile.uid,
            userName: profile.name,
            timestamp: serverTimestamp()
          });
        }
      });

      navigate('/compras');
    } catch (error) {
      console.error(error);
      alert('Erro ao processar entrada de estoque.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/compras')}
            className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-400 hover:text-primary shadow-sm border border-slate-100 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tighter">Nota de Entrada</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest leading-none mt-1">Registrar Compras de Fornecedores</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: Document Items */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-50">
               <button 
                onClick={() => setShowAddItemOptions(true)}
                className="w-full h-14 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-accent hover:text-white transition-all flex items-center justify-center gap-2"
               >
                 <Plus className="w-4 h-4" />
                 Adicionar Item
               </button>
            </div>

            <div className="divide-y divide-slate-50 min-h-[300px]">
              {cart.map((item) => (
                <div key={item.productId} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">Nome do Produto</p>
                    <p className="text-sm font-black text-primary truncate">{item.name}</p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="w-24">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Custo (R$)</p>
                       <input 
                        type="number"
                        step="0.01"
                        value={item.price}
                        onChange={(e) => updatePrice(item.productId, Number(e.target.value))}
                        className="w-full h-10 bg-slate-50 rounded-lg px-2 text-sm font-black text-primary outline-none focus:border-accent border-2 border-transparent transition-all"
                       />
                    </div>
                    <div className="w-20">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">QTD</p>
                       <input 
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                        className="w-full h-10 bg-slate-50 rounded-lg px-2 text-sm font-black text-primary outline-none focus:border-accent border-2 border-transparent transition-all"
                       />
                    </div>
                    <div className="text-right min-w-[100px]">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Subtotal</p>
                       <p className="text-sm font-black text-primary">{formatCurrency(item.total)}</p>
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.productId)}
                      className="p-2 text-slate-200 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              
              {cart.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-xs font-black uppercase tracking-widest">Nenhum item adicionado</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Totals & Info */}
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Fornecedor</label>
              <select 
                value={selectedSupplierId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedSupplierId(id);
                  const supplier = suppliers.find(s => s.id === id);
                  setSelectedSupplierName(supplier?.name || '');
                }}
                className="w-full h-14 bg-slate-50 border-none rounded-2xl px-6 font-bold text-slate-700 outline-none"
              >
                <option value="">Selecione um Fornecedor</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações da Nota</label>
              <textarea 
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-slate-50 border-none rounded-2xl p-6 font-bold text-slate-700 outline-none resize-none text-sm"
                placeholder="Ex: NF 123..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Desconto (R$)</label>
                <input 
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="w-full h-12 bg-slate-50 border-none rounded-xl px-4 font-bold text-slate-700 outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Juros (R$)</label>
                <input 
                  type="number"
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                  className="w-full h-12 bg-slate-50 border-none rounded-xl px-4 font-bold text-slate-700 outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Frete (R$)</label>
              <input 
                type="number"
                value={freight}
                onChange={(e) => setFreight(Number(e.target.value))}
                className="w-full h-12 bg-slate-50 border-none rounded-xl px-4 font-bold text-slate-700 outline-none"
              />
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-50">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Pagamento</label>
              <div className="grid grid-cols-2 gap-2">
                {['dinheiro', 'pix', 'cartão', 'transferência'].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      "h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                      paymentMethod === method 
                        ? "bg-primary border-primary text-white" 
                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                    )}
                  >
                    {method}
                  </button>
                ))}
              </div>

              {paymentMethod === 'cartão' && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parcelas</label>
                  <select 
                    value={installments}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                    className="w-full h-12 bg-slate-50 border-none rounded-xl px-4 font-bold text-slate-700 outline-none"
                  >
                    {[...Array(12)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}x</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-50">
              <div className="space-y-2 mb-6">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   <span>Subtotal</span>
                   <span>{formatCurrency(cartTotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex items-center justify-between text-[10px] font-black text-danger uppercase tracking-widest">
                    <span>Desconto</span>
                    <span>- {formatCurrency(discount)}</span>
                  </div>
                )}
                {(fee > 0 || freight > 0) && (
                  <div className="flex items-center justify-between text-[10px] font-black text-accent uppercase tracking-widest">
                    <span>Acréscimos</span>
                    <span>+ {formatCurrency(fee + freight)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-2">
                   <span className="text-sm font-black text-slate-400 uppercase tracking-widest">Total Líquido</span>
                   <span className="text-3xl font-black text-primary tracking-tighter">{formatCurrency(finalTotal)}</span>
                </div>
              </div>
              
              <button 
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0 || !selectedSupplierId}
                className="w-full h-16 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/25 hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Finalizar Entrada
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Item Options Modal */}
      <AnimatePresence>
        {showAddItemOptions && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddItemOptions(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[44px] shadow-2xl p-10 overflow-hidden text-center"
            >
              <div className="w-20 h-20 bg-primary/5 rounded-[32px] flex items-center justify-center mx-auto mb-8">
                <Plus className="w-10 h-10 text-primary" />
              </div>

              <h3 className="text-2xl font-black text-primary tracking-tighter mb-2">Adicionar Item</h3>
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mb-10">Como deseja adicionar o produto?</p>

              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setShowAddItemOptions(false);
                    setShowProductSearch(true);
                  }}
                  className="w-full h-16 bg-primary text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-4 hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
                >
                  <Search className="w-5 h-5" />
                  Buscar já adicionado
                </button>

                <button 
                  onClick={() => {
                    navigate('/produtos?new=true&returnTo=/compras/nova');
                  }}
                  className="w-full h-16 bg-primary text-white rounded-[20px] font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-4 hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
                >
                  <Package className="w-5 h-5" />
                  Adicionar produto agora
                </button>
              </div>

              <button 
                onClick={() => setShowAddItemOptions(false)}
                className="mt-8 text-[10px] font-black text-slate-300 hover:text-slate-500 uppercase tracking-[0.2em] transition-all"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Product Search Modal */}
      <AnimatePresence>
        {showProductSearch && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProductSearch(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[600px]"
            >
              <div className="p-8 border-b border-slate-50">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-primary">Escolher Produto</h3>
                  <button onClick={() => setShowProductSearch(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                    <Trash2 className="w-6 h-6 text-slate-300" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 pointer-events-none" />
                  <input 
                    autoFocus
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nome do produto ou SKU..."
                    className="w-full h-14 bg-slate-50 border-none rounded-2xl pl-14 pr-6 font-bold text-slate-700 outline-none"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-4 space-y-3">
                 {filteredProducts.map(product => (
                   <button 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="w-full p-6 h-28 bg-white border border-slate-100 rounded-3xl flex items-center justify-between hover:border-accent hover:bg-accent/5 transition-all text-left shadow-sm hover:shadow-md group"
                   >
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-white group-hover:text-accent transition-all">
                          <Package className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-primary group-hover:text-accent transition-colors">{product.name}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">SKU: {product.sku} · Estoque: {product.stock}</p>
                        </div>
                     </div>
                     <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Últ. Custo</p>
                        <p className="text-sm font-black text-primary">{formatCurrency(product.costPrice || 0)}</p>
                     </div>
                   </button>
                 ))}
                 
                 {filteredProducts.length === 0 && (
                   <div className="text-center py-20 text-slate-300">
                      <p className="text-xs font-black uppercase tracking-widest">Nenhum produto encontrado</p>
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
