import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Minus,
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
import { formatCurrency, cn, getProductSku, sortSizes, getBrasiliaISO, getBrasiliaTime } from '@/src/lib/utils';
import { format, toZonedTime } from 'date-fns-tz';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  sizeStock?: Record<string, number>;
  costPrice: number;
  baseCostPrice?: number;
  shippingCostPrice?: number;
  interestCostPrice?: number;
  overheadCostPrice?: number;
  minStock: number;
  images?: string[];
  size?: string;
  sizes?: string[];
}

interface PurchaseItem {
  productId: string;
  sku: string;
  size?: string;
  name: string;
  quantity: number;
  price: number; // For cost price at time of purchase
  total: number;
  image?: string;
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
  const [interest, setInterest] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'pending'>('paid');
  const [installments, setInstallments] = useState(1);
  const [purchaseDate, setPurchaseDate] = useState(getBrasiliaTime().toISOString().slice(0, 16));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalPurchase, setOriginalPurchase] = useState<any>(null);
  
  // Search state
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showAddItemOptions, setShowAddItemOptions] = useState(false);
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);

  // Quick Add State
  const [sizeModalProduct, setSizeModalProduct] = useState<Product | null>(null);
  const [sizeEntries, setSizeEntries] = useState<Record<string, { qty: number, price: number }>>({});

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

    // Check for edit mode
    const editId = searchParams.get('edit');
    if (editId) {
      setEditingId(editId);
      const fetchPurchase = async () => {
        const docRef = doc(db, 'purchases', editId);
        const docSnap = await (await import('firebase/firestore')).getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOriginalPurchase(data);
          setCart(data.items || []);
          setSelectedSupplierId(data.supplierId || '');
          setSelectedSupplierName(data.supplierName || '');
          setNote(data.note || '');
          setDiscount(data.discount || 0);
          setFee(data.fee || 0);
          setFreight(data.freight || 0);
          setInterest(data.interest || 0);
          setPaymentMethod(data.paymentMethod || 'dinheiro');
          setPaymentStatus(data.paymentStatus || 'paid');
          setInstallments(data.installments || 1);
          if (data.timestamp) {
            const date = new Date(data.timestamp);
            setPurchaseDate(date.toISOString().slice(0, 16));
          }
        }
      };
      fetchPurchase();
    }

    return () => unsubscribe();
  }, [searchParams]);

  const addToCart = React.useCallback((product: Product, size?: string, quantity: number = 1, price?: number) => {
    const finalSize = size || product.size;
    const itemSku = getProductSku(product.sku, finalSize);
    const cartItemId = `${product.id}-${finalSize || 'no-size'}`;
    const finalPrice = price !== undefined ? price : (product.costPrice || 0);

    setCart(prevCart => {
      const existing = prevCart.find(item => `${item.productId}-${item.size || 'no-size'}` === cartItemId);
      if (existing) {
        return prevCart.map(item => 
          `${item.productId}-${item.size || 'no-size'}` === cartItemId 
            ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * finalPrice, price: finalPrice }
            : item
        );
      } else {
        return [...prevCart, {
          productId: product.id,
          sku: itemSku,
          size: finalSize,
          name: product.name + (finalSize ? ` (${finalSize})` : ''),
          quantity: quantity,
          price: finalPrice,
          total: finalPrice * quantity
        }];
      }
    });
  }, []);

  const openSizeModal = (product: Product) => {
    setSizeModalProduct(product);
    const initialEntries: Record<string, { qty: number, price: number }> = {};
    // Pre-fill with existing product sizes if any, but default to 0 qty
    const productSizes = product.sizes || (product.size ? [product.size] : []);
    productSizes.forEach(s => {
      initialEntries[s] = { qty: 0, price: product.costPrice || 0 };
    });
    setSizeEntries(initialEntries);
  };

  const addSizesToCart = () => {
    if (!sizeModalProduct) return;
    
    Object.entries(sizeEntries).forEach(([size, data]) => {
      const entry = data as { qty: number, price: number };
      if (entry.qty > 0) {
        addToCart(sizeModalProduct, size, entry.qty, entry.price);
      }
    });
    
    setSizeModalProduct(null);
    setSizeEntries({});
    setSearchTerm('');
  };

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

  const removeFromCart = (productId: string, size?: string) => {
    const cartItemId = `${productId}-${size || 'no-size'}`;
    setCart(cart.filter(item => `${item.productId}-${item.size || 'no-size'}` !== cartItemId));
  };

  const updateQuantity = (productId: string, size: string | undefined, quantity: number) => {
    if (quantity <= 0) return;
    const cartItemId = `${productId}-${size || 'no-size'}`;
    setCart(cart.map(item => 
      `${item.productId}-${item.size || 'no-size'}` === cartItemId 
        ? { ...item, quantity, total: quantity * item.price }
        : item
    ));
  };

  const updatePrice = (productId: string, size: string | undefined, price: number) => {
    if (price < 0) return;
    const cartItemId = `${productId}-${size || 'no-size'}`;
    setCart(cart.map(item => 
      `${item.productId}-${item.size || 'no-size'}` === cartItemId 
        ? { ...item, price, total: item.quantity * price }
        : item
    ));
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.total, 0);
  const finalTotal = cartTotal - discount + fee + freight + interest;

  const handleSubmit = async () => {
    if (!profile || cart.length === 0 || submitting) return;
    
    try {
      setSubmitting(true);
      
      // Use a transaction to ensure stock consistency
      await runTransaction(db, async (transaction) => {
        // 1. Create/Update the purchase document
        const purchaseRef = editingId ? doc(db, 'purchases', editingId) : doc(collection(db, 'purchases'));
        const numInstallments = (paymentMethod === 'cartão' || paymentMethod === 'transferência') ? installments : 1;
        
        const installmentsList = [];
        if (paymentStatus === 'pending') {
          const partAmount = finalTotal / numInstallments;
          for (let i = 1; i <= numInstallments; i++) {
            const dueDate = new Date();
            dueDate.setMonth(dueDate.getMonth() + i);
            dueDate.setDate(10); // Day 10 as requested
            installmentsList.push({
              id: i,
              amount: Number(partAmount.toFixed(2)),
              dueDate: dueDate.toISOString(),
              status: 'pending'
            });
          }
        }

        // If editing, revert old stock changes first
        if (editingId && originalPurchase) {
          for (const item of originalPurchase.items) {
            const productRef = doc(db, 'products', item.productId);
            const updateData: any = {
              stock: increment(-item.quantity), // Subtract what was added
              updatedAt: serverTimestamp()
            };

            if (item.size) {
              updateData[`sizeStock.${item.size}`] = increment(-item.quantity);
            }

            transaction.update(productRef, updateData);
            
            // Register reversal movement
            const movementRef = doc(collection(db, 'movements'));
            transaction.set(movementRef, {
              productId: item.productId,
              productName: item.name + (item.size ? ` (Tamanho: ${item.size})` : ''),
              type: 'out',
              quantity: item.quantity,
              reason: `Estorno (Edição) Compra #${editingId.slice(-6).toUpperCase()}`,
              userId: profile.uid,
              userName: profile.name,
              timestamp: serverTimestamp()
            });
          }
        }

        const purchaseData = {
          supplierId: selectedSupplierId,
          supplierName: selectedSupplierName || (suppliers.find(s => s.id === selectedSupplierId)?.name) || 'Fornecedor Avulso',
          subtotal: cartTotal,
          discount: discount,
          fee: fee,
          freight: freight,
          interest: interest,
          total: finalTotal,
          paymentMethod: paymentMethod,
          paymentStatus: paymentStatus,
          installments: numInstallments,
          installmentsList: installmentsList,
          status: 'completed',
          updatedAt: serverTimestamp(),
          timestamp: format(toZonedTime(new Date(purchaseDate), 'America/Sao_Paulo'), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", { timeZone: 'America/Sao_Paulo' }),
          userId: profile.uid,
          userName: profile.name,
          note: note,
          items: cart
        };
        
        if (editingId) {
          transaction.update(purchaseRef, purchaseData);
        } else {
          transaction.set(purchaseRef, purchaseData);
        }

        // 1.1 Record Financial Movement - ONLY if PAID
        // For simplicity during edit, if it was paid, we stay paid. 
        // Real logic would be more complex (comparing old vs new), 
        // but let's at least record a movement if this is a new purchase or if status changed to paid.
        if (paymentStatus === 'paid' && (!editingId || originalPurchase.paymentStatus !== 'paid')) {
          const movementRef = doc(collection(db, 'cash_movements'));
          transaction.set(movementRef, {
            amount: finalTotal,
            type: 'out',
            category: 'compra',
            paymentMethod: paymentMethod,
            reason: `Compra #${purchaseRef.id.slice(-6).toUpperCase()}`,
            userId: profile.uid,
            userName: profile.name,
            purchaseId: purchaseRef.id,
            timestamp: getBrasiliaISO()
          });
        }

        // 2. Update stock and register movements for each product (New values)
        const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
        const freeCharge = fee - discount;
        const totalOverhead = freight + interest + freeCharge;
        const overheadPerPiece = totalItemsCount > 0 ? totalOverhead / totalItemsCount : 0;
        const shippingPerPiece = totalItemsCount > 0 ? freight / totalItemsCount : 0;
        const interestPerPiece = totalItemsCount > 0 ? interest / totalItemsCount : 0;

        for (const item of cart) {
          const productRef = doc(db, 'products', item.productId);
          const effectiveCost = item.price + overheadPerPiece;

          const updateData: any = {
            stock: increment(item.quantity),
            baseCostPrice: item.price,
            shippingCostPrice: shippingPerPiece,
            interestCostPrice: interestPerPiece,
            overheadCostPrice: overheadPerPiece,
            costPrice: effectiveCost,
            updatedAt: serverTimestamp()
          };

          if (item.size) {
            updateData[`sizeStock.${item.size}`] = increment(item.quantity);
          }
          
          transaction.update(productRef, updateData);

          // Register movement document
          const movementRef = doc(collection(db, 'movements'));
          transaction.set(movementRef, {
            productId: item.productId,
            productName: item.name + (item.size ? ` (Tamanho: ${item.size})` : ''),
            type: 'in',
            quantity: item.quantity,
            reason: `${editingId ? 'Ajuste (Edição)' : 'Entrada'} via Compra #${purchaseRef.id.slice(-6).toUpperCase()}`,
            purchaseId: purchaseRef.id,
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
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sizes?.some(s => getProductSku(p.sku, s).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-2xl mx-auto w-full space-y-4">
      <header className="flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/compras')}
            className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">
              {editingId ? 'Editar Compra' : 'Nova Compra'}
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">
              {editingId ? `Nota #${editingId.slice(-6).toUpperCase()}` : 'Registrar Entrada'}
            </p>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 w-fit h-fit">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          {profile?.name}
        </div>
      </header>

      {/* Search Section */}
      <div className="relative px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text"
          placeholder="Buscar por nome ou SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-11 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-accent/20 transition-all text-sm font-medium"
        />
        <Plus 
          onClick={() => navigate('/produtos?new=true&returnTo=/compras/nova')}
          className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-accent cursor-pointer" 
        />

        <AnimatePresence>
          {searchTerm.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 right-0 mt-2 bg-white rounded-3xl shadow-2xl border border-slate-100 z-30 max-h-[60vh] overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Produtos ({filteredProducts.length})</span>
                <button onClick={() => setSearchTerm('')} className="p-1 text-slate-300 hover:text-slate-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-2 space-y-1">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map(product => (
                    <div 
                      key={product.id}
                      className="flex items-center gap-4 p-3 rounded-2xl transition-all group hover:bg-slate-50"
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
                          {sortSizes(product.sizes || (product.size ? [product.size] : [])).map(size => (
                            <span key={size} className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-bold text-slate-500 rounded uppercase">
                              {size}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-400">SKU: {product.sku}</span>
                          <span className="text-[10px] font-bold text-slate-400">Estoque: {product.stock}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end gap-1">
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Custo Est.</p>
                           <span className="text-sm font-black text-accent">{formatCurrency(product.costPrice || 0)}</span>
                           {product.sizes && product.sizes.length > 0 && (
                              <div className="flex flex-wrap justify-end gap-1 max-w-[150px] mt-1">
                                {sortSizes(product.sizes).map(size => {
                                  const itemSku = getProductSku(product.sku, size);
                                  const isMatched = itemSku.toLowerCase().includes(searchTerm.toLowerCase());
                                  return (
                                    <button
                                      key={size}
                                      onClick={() => openSizeModal(product)}
                                      className={cn(
                                        "px-2 py-1 rounded-sm text-[8px] font-black uppercase transition-all",
                                        isMatched
                                          ? "bg-accent text-white shadow-sm"
                                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                                      )}
                                    >
                                      {size}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                        </div>
                        <button
                          onClick={() => openSizeModal(product)}
                          className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ShoppingCart className="w-6 h-6 text-slate-300" />
                    </div>
                    <p className="text-xs font-bold text-slate-400">Nenhum produto encontrado</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cart & Checkout */}
      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Itens da Nota
            </h3>
            <span className="bg-accent/10 text-accent text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
              {cart.length} itens
            </span>
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
                    key={`${item.productId}-${item.size || 'no-size'}`}
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
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Custo:</span>
                      <div className="relative">
                        <input 
                          type="number"
                          step="0.01"
                          value={item.price || ''}
                          onChange={(e) => updatePrice(item.productId, item.size, Number(e.target.value))}
                          className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-black text-accent outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-slate-100">
                      <button 
                        onClick={() => updateQuantity(item.productId, item.size, item.quantity - 1)} 
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-danger transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center text-xs font-black text-slate-800">{item.quantity}</span>
                      <button 
                        onClick={() => updateQuantity(item.productId, item.size, item.quantity + 1)} 
                        className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-accent transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => removeFromCart(item.productId, item.size)}
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
               <p className="text-xs font-bold uppercase tracking-widest">Nenhum item adicionado</p>
            </div>
          )}
        </div>

        {/* Purchase Info & Payment */}
        <div className="p-4 bg-slate-50 rounded-b-[40px] space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
          <div className="space-y-3">
             <div className="grid grid-cols-2 gap-3">
               <div className="flex flex-col gap-1">
                 <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Data da Compra</p>
                 <input 
                   type="datetime-local"
                   value={purchaseDate}
                   onChange={(e) => setPurchaseDate(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent"
                 />
               </div>
               <div className="flex flex-col gap-1">
                 <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Fornecedor</p>
                 <select 
                   value={selectedSupplierId}
                   onChange={(e) => {
                     const id = e.target.value;
                     setSelectedSupplierId(id);
                     const supplier = suppliers.find(s => s.id === id);
                     setSelectedSupplierName(supplier?.name || '');
                   }}
                   className="w-full px-3 py-2 bg-white border border-gray-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent"
                 >
                   <option value="">Selecione um Fornecedor</option>
                   {suppliers.map(s => (
                     <option key={s.id} value={s.id}>{s.name}</option>
                   ))}
                 </select>
               </div>
             </div>

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

             <div className="grid grid-cols-2 gap-3">
               <div>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Frete (R$)</p>
                 <input 
                   type="number"
                   value={freight || ''}
                   onChange={(e) => setFreight(Number(e.target.value))}
                   placeholder="0,00"
                   className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
                 />
               </div>
               <div>
                 <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Juros (R$)</p>
                 <input 
                   type="number"
                   value={interest || ''}
                   onChange={(e) => setInterest(Number(e.target.value))}
                   placeholder="0,00"
                   className="w-full px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-bold focus:ring-1 focus:ring-accent outline-none"
                 />
               </div>
             </div>

             <div className="space-y-1">
               <p className="text-[9px] font-bold text-slate-400 uppercase pl-1 pl-1">Status Pagamento</p>
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
                   A Pagar
                 </button>
               </div>
             </div>

             <div className="space-y-1">
               <p className="text-[9px] font-bold text-slate-400 uppercase pl-1 pl-1">Pagamento</p>
               <div className="grid grid-cols-4 gap-1.5">
                 {['dinheiro', 'pix', 'cartão', 'transf.'].map((method) => {
                   const isActive = paymentMethod === (method === 'transf.' ? 'transferência' : method);
                   return (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method === 'transf.' ? 'transferência' : method)}
                      className={cn(
                        "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-wide",
                        isActive ? "bg-accent border-accent text-white shadow-lg" : "bg-white border-gray-200 text-slate-600 hover:border-accent"
                      )}
                    >
                      {method}
                    </button>
                   );
                 })}
               </div>
             </div>
          </div>

          <div className="pt-1">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-0.5">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            <div className="flex justify-between items-center mb-2 pt-1.5 border-t border-gray-200/60">
              <span className="text-xs font-bold text-slate-600">Total da Nota</span>
              <span className="text-2xl font-black text-primary">{formatCurrency(finalTotal)}</span>
            </div>
            <button 
              disabled={submitting || cart.length === 0 || !selectedSupplierId}
              onClick={handleSubmit}
              className="w-full bg-accent hover:bg-accent/90 text-white font-black py-3.5 rounded-2xl shadow-lg shadow-accent/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale text-[10px] uppercase tracking-widest"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              FINALIZAR COMPRA
            </button>
          </div>
        </div>
      </div>

      {/* Size Selection Modal */}
      <AnimatePresence>
        {sizeModalProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSizeModalProduct(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-800 uppercase leading-tight">{sizeModalProduct.name}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Definir quantidades por tamanho</p>
                </div>
                <button 
                  onClick={() => setSizeModalProduct(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* All sizes from categories */}
                  <div className="grid grid-cols-1 gap-4">
                    {sortSizes(categories.filter(c => c.type === 'tamanho').map(c => c.name)).map(size => {
                      const entry = sizeEntries[size] || { qty: 0, price: sizeModalProduct.costPrice || 0 };
                      const isProductSize = sizeModalProduct.sizes?.includes(size) || sizeModalProduct.size === size;
                      
                      return (
                        <div key={size} className={cn(
                          "grid grid-cols-12 gap-3 p-4 rounded-2xl border transition-all",
                          entry.qty > 0 ? "bg-accent/5 border-accent/20" : "bg-slate-50 border-slate-100",
                          !isProductSize && "opacity-60"
                        )}>
                          <div className="col-span-2 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Tam.</p>
                            <div className="h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center font-black text-xs text-slate-800">
                              {size}
                            </div>
                          </div>
                          
                          <div className="col-span-5 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Quantidade</p>
                            <div className="h-10 grid grid-cols-3 bg-white rounded-xl p-1 border border-slate-200">
                              <button 
                                onClick={() => setSizeEntries(prev => ({
                                  ...prev,
                                  [size]: { ...entry, qty: Math.max(0, entry.qty - 1) }
                                }))}
                                className="flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-danger hover:bg-danger/10 transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <input 
                                type="number" 
                                min="0"
                                value={entry.qty || ''}
                                placeholder="0"
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setSizeEntries(prev => ({
                                    ...prev,
                                    [size]: { ...entry, qty: val }
                                  }));
                                }}
                                className="w-full text-center text-xs font-black outline-none border-none focus:ring-0 bg-transparent p-0"
                              />
                              <button 
                                onClick={() => setSizeEntries(prev => ({
                                  ...prev,
                                  [size]: { ...entry, qty: entry.qty + 1 }
                                }))}
                                className="flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-accent hover:bg-accent/10 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="col-span-5 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase">Custo Un.</p>
                            <div className="h-10 flex items-center bg-white rounded-xl px-3 border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-bold mr-1">R$</span>
                              <input 
                                type="number" 
                                step="0.01"
                                value={entry.price || ''}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setSizeEntries(prev => ({
                                    ...prev,
                                    [size]: { ...entry, price: val }
                                  }));
                                }}
                                className="w-full text-xs font-black outline-none border-none focus:ring-0 bg-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                <div className="text-left">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total selecionado</p>
                  <p className="text-lg font-black text-primary">
                    {Object.values(sizeEntries).reduce((acc: number, curr: any) => acc + (curr.qty || 0), 0)} <span className="text-xs font-bold">unidades</span>
                  </p>
                </div>
                <button 
                  onClick={addSizesToCart}
                  className="px-8 py-3.5 bg-accent text-white font-black rounded-2xl shadow-lg shadow-accent/20 hover:bg-accent/90 transition-all text-[10px] uppercase tracking-widest"
                >
                  Adicionar ao Carrinho
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
