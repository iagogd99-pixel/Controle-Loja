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
import { formatCurrency, cn, getProductSku, sortSizes, getBrasiliaTime, getBrasiliaISO } from '@/src/lib/utils';
import { format } from 'date-fns-tz';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

export default function Sales() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('unregistered');
  const [customerName, setCustomerName] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [storeFee, setStoreFee] = useState<number>(0);
  const [customerFee, setCustomerFee] = useState<number>(0);
  const [installments, setInstallments] = useState<number>(1);
  const [paymentMethod, setPaymentMethod] = useState<'dinheiro' | 'pix' | 'cartão' | 'transferência'>('dinheiro');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
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
    (
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sizes?.some(s => getProductSku(p.sku, s).toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  const addToCart = (product: Product, size?: string, quantity: number = 1) => {
    const finalSize = size || product.size;
    const itemSku = getProductSku(product.sku, finalSize);
    const cartItemId = `${product.id}-${finalSize || 'no-size'}`;

    // Check stock for specific size if provided, otherwise total stock
    const currentStock = (finalSize && product.sizeStock && product.sizeStock[finalSize] !== undefined)
      ? product.sizeStock[finalSize]
      : product.stock;

    if (currentStock <= 0) {
      alert('Produto sem estoque' + (finalSize ? ` para o tamanho ${finalSize}` : ''));
      return;
    }
    
    setCart(prev => {
      const existing = prev.find(item => `${item.productId}-${item.size || 'no-size'}` === cartItemId);
      if (existing) {
        if (existing.quantity + quantity > currentStock) {
          alert('Limite de estoque atingido');
          return prev;
        }
        return prev.map(item => 
          `${item.productId}-${item.size || 'no-size'}` === cartItemId 
            ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * item.price } 
            : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        sku: itemSku,
        size: finalSize,
        name: product.name + (finalSize ? ` (${finalSize})` : ''), 
        price: product.salePrice, 
        costPrice: product.costPrice || 0,
        quantity: quantity, 
        total: product.salePrice * quantity
      }];
    });
    setSelectedProduct(null);
  };

  const updateQuantity = (productId: string, size: string | undefined, delta: number) => {
    const cartItemId = `${productId}-${size || 'no-size'}`;
    setCart(prev => prev.map(item => {
      if (`${item.productId}-${item.size || 'no-size'}` === cartItemId) {
        const newQty = Math.max(0, item.quantity + delta);
        const product = products.find(p => p.id === productId);
        if (product) {
          const currentStock = (size && product.sizeStock && product.sizeStock[size] !== undefined)
            ? product.sizeStock[size]
            : product.stock;
          if (newQty > currentStock) return item;
        }
        return { ...item, quantity: newQty, total: newQty * item.price };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const cartSubtotal = cart.reduce((acc, item) => acc + item.total, 0);
  const cartTotal = Math.max(0, cartSubtotal - discount + customerFee);

  const handleFinishSale = async () => {
    if (cart.length === 0 || !profile) return;
    setIsFinishing(true);

    try {
      const finalCustomerName = selectedClientId === 'unregistered' 
        ? (customerName || 'Cliente Direto')
        : (clients.find(c => c.id === selectedClientId)?.name || 'Cliente');

      const numInstallments = (paymentMethod === 'cartão' || paymentMethod === 'transferência') ? installments : 1;
      
      const installmentsList = [];
      if (paymentStatus === 'pending') {
        const partAmount = cartTotal / numInstallments;
        for (let i = 1; i <= numInstallments; i++) {
          const dueDate = getBrasiliaTime();
          dueDate.setMonth(dueDate.getMonth() + i);
          installmentsList.push({
            id: i,
            amount: Number(partAmount.toFixed(2)),
            dueDate: format(dueDate, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", { timeZone: 'America/Sao_Paulo' }),
            status: 'pending'
          });
        }
      }

      // 1. Create Sale record
      const sale = {
        subtotal: cartSubtotal,
        discount,
        storeFee,
        customerFee,
        total: cartTotal,
        items: cart,
        paymentMethod,
        paymentStatus,
        installments: numInstallments,
        installmentsList: installmentsList.length > 0 ? installmentsList : null,
        clientId: selectedClientId === 'unregistered' ? null : selectedClientId,
        customerName: finalCustomerName,
        userId: profile.uid,
        userName: profile.name,
        timestamp: getBrasiliaISO(),
        status: 'completed'
      } as any;
      
      const saleRef = await addDoc(collection(db, 'sales'), sale);
      const saleId = saleRef.id;
      
      // 1.1 Record Financial Movement for the cash - ONLY if PAID
      if (paymentStatus === 'paid') {
        // Store fee is deducted from the net received by the store
        const amountReceived = cartTotal - storeFee;

        await addDoc(collection(db, 'cash_movements'), {
          amount: amountReceived,
          type: 'in',
          category: 'venda',
          paymentMethod: paymentMethod,
          reason: `Venda #${saleId.slice(-4)} (${paymentMethod.toUpperCase()})`,
          userId: profile.uid,
          userName: profile.name,
          saleId: saleId,
          timestamp: getBrasiliaISO()
        });
      }

      // 2. Update Stock
      for (const item of cart) {
        const product = products.find(p => p.id === item.productId);
        const updateData: any = {
          stock: increment(-item.quantity)
        };

        // Also update size-specific stock if it exists
        if (item.size && product?.sizeStock && product.sizeStock[item.size] !== undefined) {
          updateData[`sizeStock.${item.size}`] = increment(-item.quantity);
        }

        await updateDoc(doc(db, 'products', item.productId), updateData);
        
        // 3. Record Movement
        await addDoc(collection(db, 'movements'), {
          productId: item.productId,
          productName: item.name + (item.size ? ` (Tamanho: ${item.size})` : ''),
          type: 'out',
          quantity: item.quantity,
          reason: 'Venda ' + (finalCustomerName ? `(Cliente: ${finalCustomerName})` : ''),
          saleId: saleId,
          userId: profile.uid,
          userName: profile.name,
          timestamp: getBrasiliaISO()
        });
      }

      setShowSuccess(true);
      setCart([]);
      setCustomerName('');
      setDiscount(0);
      setStoreFee(0);
      setCustomerFee(0);
      setInstallments(1);
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
            onClick={() => navigate('/historico-vendas')}
            className="px-8 py-3 bg-white border border-gray-200 text-slate-700 font-bold rounded-xl"
          >
            Ver Histórico
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-4">
      {/* Product Selection (POS Main) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 px-2">
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
            {profile?.name}
          </div>
        </div>

        <div className="relative px-2">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por nome ou SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-11 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-accent/20 transition-all text-sm font-medium"
          />
          <Scan className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-accent cursor-pointer" />

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {searchTerm.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute left-2 right-2 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 z-30 max-h-[60vh] overflow-hidden flex flex-col"
              >
                <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resultados ({filteredProducts.length})</span>
                  <button onClick={() => setSearchTerm('')} className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                  {filteredProducts.length > 0 ? (
                    filteredProducts.map(product => (
                      <div 
                        key={product.id}
                        className={cn(
                          "flex items-center gap-4 p-3 rounded-2xl transition-all group",
                          product.stock <= 0 ? "opacity-50 grayscale bg-slate-50/50" : "hover:bg-slate-50"
                        )}
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-800 leading-tight uppercase truncate">{product.name}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {sortSizes(product.sizes || (product.size ? [product.size] : [])).map(size => {
                              const sizeStockValue = product.sizeStock?.[size];
                              return (
                                <span key={size} className={cn(
                                  "px-1.5 py-0.5 text-[8px] font-bold rounded uppercase flex items-center gap-1",
                                  sizeStockValue === 0 ? "bg-red-50 text-red-500" : "bg-slate-100 text-slate-500"
                                )}>
                                  {size}
                                  {sizeStockValue !== undefined && (
                                    <span className="opacity-60">({sizeStockValue})</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-bold text-slate-400">SKU: {product.sku}</span>
                            <span className={cn(
                              "text-[10px] font-bold",
                              product.stock <= product.minStock ? "text-danger" : "text-slate-400"
                            )}>Estoque: {product.stock}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-sm font-black text-accent">{formatCurrency(product.salePrice)}</span>
                            {product.sizes && product.sizes.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1 max-w-[150px]">
                                {sortSizes(product.sizes).map(size => {
                                  const itemSku = getProductSku(product.sku, size);
                                  const isMatched = itemSku.toLowerCase().includes(searchTerm.toLowerCase());
                                  const sizeStockValue = product.sizeStock?.[size];
                                  const isOutOfStock = sizeStockValue !== undefined && sizeStockValue <= 0;

                                  return (
                                    <button
                                      key={size}
                                      onClick={() => {
                                        if (isOutOfStock) return;
                                        addToCart(product, size);
                                        setSearchTerm('');
                                      }}
                                      disabled={isOutOfStock}
                                      className={cn(
                                        "px-2 py-1 rounded-sm text-[8px] font-black uppercase transition-all flex items-center gap-1",
                                        isMatched
                                          ? "bg-accent text-white shadow-sm"
                                          : isOutOfStock 
                                            ? "bg-red-50 text-red-300 cursor-not-allowed"
                                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                      )}
                                    >
                                      {size}
                                      {sizeStockValue !== undefined && (
                                        <span className={cn(
                                          "text-[7px] font-bold",
                                          isMatched ? "text-white/60" : "text-slate-400"
                                        )}>
                                          ({sizeStockValue})
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              addToCart(product);
                              setSearchTerm('');
                            }}
                            disabled={product.stock <= 0}
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                              product.stock <= 0 
                                ? "bg-slate-100 text-slate-300 cursor-not-allowed" 
                                : "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95"
                            )}
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <AlertCircle className="w-6 h-6 text-slate-300" />
                      </div>
                      <p className="text-xs font-bold text-slate-400">Nenhum produto encontrado</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Cart & Checkout (POS Bottom) */}
      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
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

        <div className="flex-1 overflow-y-auto p-4 max-h-[400px]">
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {cart.map(item => {
                const product = products.find(p => p.id === item.productId);
                const productImage = product?.images?.[0];
                return (
                  <motion.div 
                    layout
                    key={item.productId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-slate-50 border border-slate-100 rounded-[24px] p-3 flex items-center gap-4 group relative"
                  >
                    <div className="w-16 h-16 bg-white rounded-2xl overflow-hidden flex-shrink-0 relative">
                      {productImage ? (
                        <img src={productImage} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center opacity-10">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase leading-tight truncate">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-slate-400">SKU: {item.sku}</span>
                      <span className="text-[10px] font-bold text-accent">
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-slate-100">
                      <button 
                        onClick={() => updateQuantity(item.productId, item.size, -1)} 
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-danger transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-black text-slate-800">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.productId, item.size, 1)} 
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-accent transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => setCart(prev => prev.filter(i => i.productId !== item.productId))}
                      className="p-2 text-slate-300 hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
          </AnimatePresence>
          {cart.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 opacity-30">
               <Package className="w-12 h-12 mb-3" />
               <p className="text-xs font-bold uppercase tracking-widest">Carrinho vazio</p>
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
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Taxa Loja (R$)</p>
              <input 
                type="number"
                value={storeFee || ''}
                onChange={(e) => setStoreFee(Number(e.target.value))}
                placeholder="Desconto no recebimento"
                className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Taxa Cliente (R$)</p>
              <input 
                type="number"
                value={customerFee || ''}
                onChange={(e) => setCustomerFee(Number(e.target.value))}
                placeholder="Adicionado ao total"
                className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Parcelas</p>
              <select 
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
              >
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase pl-1">Tipo de Pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setPaymentStatus('paid')}
                className={cn(
                  "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                  paymentStatus === 'paid' ? "bg-accent border-accent text-white shadow-lg" : "bg-white border-gray-200 text-slate-600"
                )}
              >
                Pago Agora
              </button>
              <button 
                onClick={() => setPaymentStatus('pending')}
                className={cn(
                  "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                  paymentStatus === 'pending' ? "bg-danger border-danger text-white shadow-lg" : "bg-white border-gray-200 text-slate-600"
                )}
              >
                A Receber
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase pl-1">Pagamento</p>
            <div className="grid grid-cols-4 gap-1.5">
              <PaymentButton 
                active={paymentMethod === 'dinheiro'} 
                onClick={() => setPaymentMethod('dinheiro')}
                label="Dinheiro"
              />
              <PaymentButton 
                active={paymentMethod === 'pix'} 
                onClick={() => setPaymentMethod('pix')}
                label="PIX"
              />
              <PaymentButton 
                active={paymentMethod === 'cartão'} 
                onClick={() => setPaymentMethod('cartão')}
                label="Cartão"
              />
              <PaymentButton 
                active={paymentMethod === 'transferência'} 
                onClick={() => setPaymentMethod('transferência')}
                label="Transf."
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
