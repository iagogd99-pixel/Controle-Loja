import React, { useState, useEffect } from 'react';
import { 
  Search, 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  CheckCircle2,
  Package,
  Scan,
  User,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  Loader2,
  X,
  Boxes,
  Info
} from 'lucide-react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  increment,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { Product, SaleItem, Client } from '@/src/types';
import { formatCurrency, cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function Sales() {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('unregistered');
  const [customerName, setCustomerName] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [fee, setFee] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'pix' | 'cartão' | 'transferência'>('dinheiro');
  const [isFinishing, setIsFinishing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const pSnap = await getDocs(collection(db, 'products'));
      setProducts(pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      
      const cSnap = await getDocs(query(collection(db, 'clients'), orderBy('name', 'asc')));
      setClients(cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    };
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => 
    p.status === 'active' && 
    (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const addToCart = (product: Product, quantity: number = 1) => {
    if (product.stock <= 0) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity + quantity > product.stock) {
          alert('Limite de estoque atingido');
          return prev;
        }
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * item.price } 
            : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: product.salePrice, 
        costPrice: product.costPrice || 0,
        quantity: quantity, 
        total: product.salePrice * quantity
      }];
    });
    setSelectedProduct(null);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === id) {
        const newQty = Math.max(0, item.quantity + delta);
        const product = products.find(p => p.id === id);
        if (product && newQty > product.stock) return item;
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + item.total, 0);
  const cartTotal = Math.max(0, cartSubtotal - discount + fee);

  const handleFinishSale = async () => {
    if (cart.length === 0 || !profile) return;
    setIsFinishing(true);

    try {
      const finalCustomerName = selectedClientId === 'unregistered' 
        ? (customerName || 'Cliente Direto')
        : (clients.find(c => c.id === selectedClientId)?.name || 'Cliente');

      // 1. Create Sale record
      const sale = {
        subtotal: cartSubtotal,
        discount,
        fee,
        total: cartTotal,
        items: cart,
        paymentMethod,
        clientId: selectedClientId === 'unregistered' ? null : selectedClientId,
        customerName: finalCustomerName,
        userId: profile.uid,
        userName: profile.name,
        timestamp: new Date().toISOString(),
        status: 'completed'
      } as any;
      
      const saleRef = await addDoc(collection(db, 'sales'), sale);
      const saleId = saleRef.id;
      
      // 1.1 Record Financial Movement for the cash
      await addDoc(collection(db, 'cash_movements'), {
        amount: cartTotal,
        type: 'in',
        category: 'venda',
        paymentMethod: paymentMethod,
        reason: `Venda #${saleId.slice(-4)} (${paymentMethod.toUpperCase()})`,
        userId: profile.uid,
        userName: profile.name,
        saleId: saleId,
        timestamp: new Date().toISOString()
      });

      // 2. Update Stock
      for (const item of cart) {
        await updateDoc(doc(db, 'products', item.productId), {
          stock: increment(-item.quantity)
        });
        
        // 3. Record Movement
        await addDoc(collection(db, 'movements'), {
          productId: item.productId,
          productName: item.name,
          type: 'out',
          quantity: item.quantity,
          reason: 'Venda ' + (finalCustomerName ? `(Cliente: ${finalCustomerName})` : ''),
          userId: profile.uid,
          userName: profile.name,
          timestamp: new Date().toISOString()
        });
      }

      setShowSuccess(true);
      setCart([]);
      setCustomerName('');
      setDiscount(0);
      setFee(0);
      setSelectedClientId('unregistered');
      
      // Refresh local stock
      const pSnap = await getDocs(collection(db, 'products'));
      setProducts(pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      
    } catch (error) {
      console.error(error);
      alert('Erro ao finalizar venda');
    } finally {
      setIsFinishing(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <motion.div
           initial={{ scale: 0 }}
           animate={{ scale: 1 }}
           className="w-24 h-24 bg-success rounded-full flex items-center justify-center text-white mb-6 shadow-xl shadow-success/20"
        >
          <CheckCircle2 className="w-12 h-12" />
        </motion.div>
        <h2 className="text-3xl font-black text-primary mb-2">Venda Finalizada!</h2>
        <p className="text-slate-500 mb-8 max-w-xs">O estoque foi atualizado e o recibo digital gerado com sucesso.</p>
        <div className="flex gap-4">
          <button 
            onClick={() => setShowSuccess(false)}
            className="px-8 py-3 bg-accent text-white font-bold rounded-xl shadow-lg shadow-accent/20"
          >
            Nova Venda
          </button>
          <button 
            className="px-8 py-3 bg-white border border-gray-200 text-slate-700 font-bold rounded-xl"
          >
            Ver Histórico
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
      {/* Product Selection (POS Left) */}
      <div className="lg:col-span-8 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Terminal</h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">Ponto de Venda</p>
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 w-fit h-fit">
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
            Operador: {profile?.name}
          </div>
        </div>

        <div className="relative px-2">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar item..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-11 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-accent/20 transition-all text-xs"
          />
          <Scan className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-accent cursor-pointer" />
        </div>

        <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-2">
          {filteredProducts.map(product => (
            <motion.button
              whileTap={{ scale: 0.95 }}
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              disabled={product.stock <= 0}
              className={cn(
                "bg-white p-2 rounded-2xl border text-left flex flex-col group transition-all relative",
                product.stock <= 0 ? "opacity-50 grayscale cursor-not-allowed border-gray-100" : "hover:border-accent hover:shadow-md border-gray-100 shadow-sm"
              )}
            >
              <div className="aspect-square mb-2 rounded-xl bg-slate-50 overflow-hidden relative">
                {product.images?.[0] ? (
                  <img src={product.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" />
                ) : (
                  <Package className="w-6 h-6 text-slate-200 absolute inset-0 m-auto opacity-30" />
                )}
                {product.stock <= product.minStock && product.stock > 0 && (
                  <div className="absolute top-1.5 right-1.5 p-1 bg-danger text-white rounded-lg shadow-lg">
                    <AlertCircle className="w-3 h-3" />
                  </div>
                )}
              </div>
              <div className="px-1">
                <p className="text-[10px] font-black text-slate-800 leading-tight uppercase tracking-tighter mb-1">
                  {product.name}
                </p>
                {product.size && (
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Tam: {product.size}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-accent">{formatCurrency(product.salePrice)}</span>
                  <span className="text-[9px] font-bold text-slate-400">{product.stock} un</span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProduct(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              layoutId={selectedProduct.id}
              className="bg-white w-full max-w-sm rounded-[40px] overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-5 right-5 z-20">
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="p-2.5 bg-white/80 hover:bg-white rounded-full shadow-lg transition-colors text-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                <div className="aspect-square bg-slate-100 relative">
                  {selectedProduct.images && selectedProduct.images[0] ? (
                    <img src={selectedProduct.images[0]} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                       <Package className="w-16 h-16 opacity-30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent flex flex-col justify-end p-8">
                    <span className="inline-block px-3 py-1 bg-accent text-white text-[9px] font-black rounded-full mb-2 uppercase tracking-widest w-fit">
                      {selectedProduct.category}
                    </span>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-tight drop-shadow-lg">
                      {selectedProduct.name}
                    </h2>
                    {selectedProduct.size && (
                      <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-md text-white text-[10px] font-bold rounded-lg mt-1 uppercase">
                        Tamanho: {selectedProduct.size}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preço Venda</p>
                       <p className="text-xl font-black text-accent">{formatCurrency(selectedProduct.salePrice)}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Em Estoque</p>
                       <p className={cn("text-xl font-black", selectedProduct.stock <= selectedProduct.minStock ? "text-danger" : "text-slate-800")}>
                         {selectedProduct.stock} un
                       </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Informações</p>
                     <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                           <span className="text-slate-400">SKU</span>
                           <span className="text-slate-800">{selectedProduct.sku}</span>
                        </div>
                        {selectedProduct.description && (
                          <p className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                            {selectedProduct.description}
                          </p>
                        )}
                     </div>
                  </div>

                  <button
                    onClick={() => addToCart(selectedProduct)}
                    className="w-full bg-primary text-white font-black py-5 rounded-[28px] flex items-center justify-center gap-3 text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] transition-transform active:scale-95"
                  >
                    <ShoppingCart className="w-5 h-5" /> ADICIONAR AO CARRINHO
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart & Checkout (POS Right) */}
      <div className="lg:col-span-4 bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col h-[calc(100vh-80px)] sticky top-4">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Carrinho
            </h3>
            <div className="flex items-center gap-2">
              <span className="bg-accent/10 text-accent px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                {cart.length} itens
              </span>
              {cart.length > 0 && (
                <button 
                  onClick={() => {
                    if (confirm('Deseja limpar todo o carrinho?')) setCart([]);
                  }}
                  className="p-1.5 text-slate-300 hover:text-danger transition-colors"
                  title="Limpar Carrinho"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-2">
             <div className="flex flex-col gap-1">
                <select 
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="unregistered">Cliente Avulso</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
             </div>
             
             {selectedClientId === 'unregistered' && (
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Nome do cliente (opcional)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-semibold text-slate-700 outline-none"
                  />
                </div>
             )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence mode="popLayout">
            {cart.map(item => (
              <motion.div 
                layout
                key={item.productId}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 group"
              >
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-bold text-slate-800 text-sm leading-tight">{item.name}</p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{formatCurrency(item.price)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                    <button onClick={() => updateQuantity(item.productId, -1)} className="p-1 hover:text-danger transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center text-[11px] font-black">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.productId, 1)} className="p-1 hover:text-accent transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="text-right min-w-[64px]">
                    <p className="font-black text-slate-900 text-sm tracking-tighter">{formatCurrency(item.total)}</p>
                  </div>
                  <button 
                    onClick={() => setCart(prev => prev.filter(i => i.productId !== item.productId))}
                    className="p-1 text-slate-200 hover:text-danger transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-30 pb-12">
               <Package className="w-16 h-16 mb-4" />
               <p className="font-bold">Carrinho vazio</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 rounded-b-[40px] space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Desconto (R$)</p>
              <input 
                type="number"
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value))}
                placeholder="0,00"
                className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Taxa (R$)</p>
              <input 
                type="number"
                value={fee || ''}
                onChange={(e) => setFee(Number(e.target.value))}
                placeholder="0,00"
                className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase pl-1">Pagamento</p>
            <div className="grid grid-cols-4 gap-1.5">
              <PaymentButton 
                active={paymentMethod === 'dinheiro'} 
                onClick={() => setPaymentMethod('dinheiro')}
                label="Din."
              />
              <PaymentButton 
                active={paymentMethod === 'pix'} 
                onClick={() => setPaymentMethod('pix')}
                label="PIX"
              />
              <PaymentButton 
                active={paymentMethod === 'cartão'} 
                onClick={() => setPaymentMethod('cartão')}
                label="Card"
              />
              <PaymentButton 
                active={paymentMethod === 'transferência'} 
                onClick={() => setPaymentMethod('transferência')}
                label="Trans"
              />
            </div>
          </div>

          <div className="pt-1">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-0.5">
              <span>Subtotal</span>
              <span>{formatCurrency(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between items-center mb-2 pt-1.5 border-t border-gray-200/60">
              <span className="text-xs font-bold text-slate-600">Total</span>
              <span className="text-2xl font-black text-primary">{formatCurrency(cartTotal)}</span>
            </div>
            <button 
              disabled={cart.length === 0 || isFinishing}
              onClick={handleFinishSale}
              className="w-full bg-accent hover:bg-accent/90 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-accent/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale text-xs uppercase tracking-tighter"
            >
              {isFinishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
              FINALIZAR VENDA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentButton({ active, label, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "py-2 px-3 rounded-xl border text-xs font-bold transition-all",
        active ? "bg-accent border-accent text-white shadow-lg shadow-accent/10" : "bg-white border-gray-200 text-slate-600 hover:border-accent"
      )}
    >
      {label}
    </button>
  );
}
