import React, { useEffect, useState } from 'react';
import { 
  ArrowUpRight,
  ArrowDownRight,
  Plus, 
  Search, 
  Filter, 
  Package,
  AlertCircle,
  X,
  Edit2,
  Trash2,
  Info,
  Clock,
  Boxes,
  BarChart2,
  Tag,
  ChevronRight,
  DollarSign
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Product, Movement } from '@/src/types';
import { formatCurrency, cn, getProductSku, sortSizes, getBrasiliaTime } from '@/src/lib/utils';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [flowSummary, setFlowSummary] = useState({ in: 0, out: 0 });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      const returnTo = searchParams.get('returnTo');
      navigate('/produtos/novo' + (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''));
    }

    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
      
      const uniqueCats = Array.from(new Set(prods.map(p => p.category))).filter(Boolean).sort();
      setCategories(['Todas', ...uniqueCats]);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    const sizesQuery = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsubscribeSizes = onSnapshot(sizesQuery, (snapshot) => {
      const sizes = snapshot.docs
        .map(doc => doc.data())
        .filter(d => d.type === 'tamanho')
        .map(d => d.name);
      setAllSizes(sortSizes(sizes));
    });

    return () => {
      unsubscribe();
      unsubscribeSizes();
    };
  }, []);

  useEffect(() => {
    const sevenDaysAgo = getBrasiliaTime();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const q = query(
      collection(db, 'movements'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const movements = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Movement))
        .filter(m => new Date(m.timestamp) >= sevenDaysAgo);

      const summary = movements.reduce((acc, curr) => {
        if (curr.type === 'in') acc.in += curr.quantity;
        else acc.out += curr.quantity;
        return acc;
      }, { in: 0, out: 0 });

      setFlowSummary(summary);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'movements');
    });

    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      setSelectedProduct(null);
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  const filteredProducts = products.filter(p => {
    const nameStr = p.name || '';
    const skuStr = p.sku || '';
    const matchesSearch = nameStr.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         skuStr.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary dark:text-slate-100 tracking-tight leading-none">Produtos / Estoque</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-widest mt-1">Catálogo Geral</p>
          </div>
        </div>
        <Link 
          to="/produtos/novo"
          className="bg-accent hover:bg-accent/90 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase tracking-widest"
        >
          <Plus className="w-5 h-5" />
          Adicionar Produto
        </Link>
      </div>

      {/* Flow Summary - Last 7 Days */}
      <div className="grid grid-cols-2 gap-3 px-2">
        <div className="bg-white dark:bg-slate-900/50 p-4 rounded-[24px] border border-slate-100 dark:border-slate-800 flex items-center justify-between group transition-all hover:border-success/30">
          <div>
            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Entradas (7d)</p>
            <h4 className="text-lg font-black text-slate-800 dark:text-slate-100">+{flowSummary.in}</h4>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-success/10 text-success flex items-center justify-center group-hover:scale-110 transition-transform">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/50 p-4 rounded-[24px] border border-slate-100 dark:border-slate-800 flex items-center justify-between group transition-all hover:border-danger/30">
          <div>
            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Saídas (7d)</p>
            <h4 className="text-lg font-black text-slate-800 dark:text-slate-100">-{flowSummary.out}</h4>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-danger/10 text-danger flex items-center justify-center group-hover:scale-110 transition-transform">
            <ArrowDownRight className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filters (Simplified) */}
      <div className="flex gap-2 px-2 overflow-x-auto pb-2 scrollbar-none">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input 
            type="text"
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 focus:border-accent rounded-xl outline-none transition-all text-xs dark:text-slate-100"
          />
        </div>
        <select 
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 px-3 py-2 rounded-xl outline-none transition-all font-bold text-[10px] text-slate-500 dark:text-slate-400 min-w-auto"
        >
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-2">
        {filteredProducts.map((product) => (
          <motion.button
            layoutId={`card-${product.id}`}
            key={product.id}
            onClick={() => setSelectedProduct(product)}
            className="bg-white dark:bg-slate-900 rounded-2xl p-2 border border-gray-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col aspect-square overflow-hidden"
          >
            <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 overflow-hidden relative mb-2">
              {product.images && product.images[0] ? (
                <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 gap-1">
                  <Package className="w-6 h-6 opacity-30" />
                  <span className="text-[8px] font-bold uppercase opacity-30">Sem Foto</span>
                </div>
              )}
              {product.stock <= product.minStock && (
                <div className="absolute top-1.5 right-1.5 bg-danger text-white p-1 rounded-lg shadow-lg">
                  <AlertCircle className="w-3 h-3" />
                </div>
              )}
            </div>
            <div className="px-1 text-left">
               <h3 className="text-[9px] font-black text-slate-800 dark:text-slate-100 leading-tight line-clamp-1 uppercase tracking-tighter mb-0.5">
                 {product.name}
               </h3>
               
               <div className="flex flex-wrap gap-1 mb-2">
                 {allSizes.length > 0 ? (
                   allSizes.map(size => {
                     const isAvailable = product.sizes?.includes(size) || product.size === size;
                     return (
                       <div 
                         key={size}
                         className={cn(
                           "min-w-[16px] h-4 px-1 flex items-center justify-center rounded-[4px] border text-[7px] font-bold uppercase transition-all relative",
                           isAvailable 
                             ? "bg-slate-50 border-slate-200 text-slate-700" 
                             : "bg-transparent border-slate-100 text-slate-300 opacity-40 overflow-hidden"
                         )}
                       >
                         {size}
                         {!isAvailable && (
                           <div className="absolute inset-0 flex items-center justify-center">
                             <div className="w-full h-[1px] bg-slate-300 -rotate-45" />
                           </div>
                         )}
                       </div>
                     );
                   })
                 ) : (
                   <span className="text-[7px] text-slate-400 font-bold uppercase">{product.size}</span>
                 )}
               </div>

               <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-50 dark:border-slate-800">
                 <span className="text-[10px] font-black text-accent">{formatCurrency(product.salePrice)}</span>
                 <span className={cn(
                   "text-[8px] font-bold",
                   product.stock <= product.minStock ? "text-danger" : "text-slate-400 dark:text-slate-500"
                 )}>
                   {product.stock} un
                 </span>
               </div>
             </div>
           </motion.button>
        ))}
      </div>

      {filteredProducts.length === 0 && !loading && (
        <div className="py-20 text-center px-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 inline-block w-full max-w-sm">
            <Package className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500">Nenhum resultado</h3>
            <p className="text-[10px] text-slate-300 dark:text-slate-600 uppercase font-black tracking-widest mt-1">Refine seus filtros ou adicione produtos</p>
          </div>
        </div>
      )}

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
              layoutId={`card-${selectedProduct.id}`}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative z-10 flex flex-col max-h-[90vh] transition-colors"
            >
              <div className="absolute top-4 right-4 z-20">
                <button 
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 rounded-full shadow-lg transition-colors text-slate-800 dark:text-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto">
                <div className="aspect-square bg-slate-100 dark:bg-slate-800 relative">
                  {selectedProduct.images && selectedProduct.images[0] ? (
                    <img src={selectedProduct.images[0]} alt={selectedProduct.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 gap-2">
                       <Package className="w-16 h-16 opacity-30" />
                       <span className="text-xs font-black uppercase opacity-30">Sem Imagem Cadastrada</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/60 to-transparent">
                    <span className="inline-block px-3 py-1 bg-accent text-white text-[10px] font-bold rounded-full mb-2 uppercase tracking-widest">
                      {selectedProduct.category}
                    </span>
                    <h2 className="text-2xl font-black text-white tracking-tighter leading-tight">
                      {selectedProduct.name}
                    </h2>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="SKU / Cód." value={selectedProduct.sku} icon={Tag} />
                    <DetailItem label="Status" value={selectedProduct.status === 'active' ? 'Ativo' : 'Inativo'} theme={selectedProduct.status === 'active' ? 'success' : 'danger'} icon={Info} />
                    <DetailItem label="Venda" value={formatCurrency(selectedProduct.salePrice)} highlight icon={BarChart2} />
                    <DetailItem label="Custo" value={formatCurrency(selectedProduct.costPrice)} icon={DollarSign} />
                    <DetailItem 
                      label="Estoque Atual" 
                      value={`${selectedProduct.stock} unidades`} 
                      theme={selectedProduct.stock <= selectedProduct.minStock ? 'danger' : 'default'}
                      icon={Boxes}
                    />
                    <DetailItem label="Estoque Mínimo" value={`${selectedProduct.minStock} un`} icon={AlertCircle} />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> Tamanhos Disponíveis
                    </h4>
                     <div className="flex flex-wrap gap-2">
                        {allSizes.map(size => {
                          const isAvailable = selectedProduct.sizes?.includes(size) || selectedProduct.size === size;
                          const sizeQty = selectedProduct.sizeStock?.[size];
                          
                          return (
                            <div 
                              key={size}
                              className={cn(
                                "min-w-[48px] h-14 px-2 flex flex-col items-center justify-center rounded-xl border text-[10px] font-black uppercase transition-all relative overflow-hidden",
                                isAvailable 
                                  ? "bg-white border-primary text-primary shadow-sm" 
                                  : "bg-transparent border-slate-100 text-slate-300 opacity-40"
                              )}
                            >
                              <span className="text-[10px]">{size}</span>
                              {isAvailable && (
                                <div className="flex flex-col items-center">
                                  <span className="text-[6px] font-bold text-slate-400 mt-0.5">
                                    {getProductSku(selectedProduct.sku, size)}
                                  </span>
                                  {sizeQty !== undefined && (
                                    <span className={cn(
                                      "text-[8px] font-black px-1.5 rounded-full mt-0.5",
                                      sizeQty > 0 ? "bg-primary/10 text-primary" : "bg-danger/10 text-danger"
                                    )}>
                                      {sizeQty} un
                                    </span>
                                  )}
                                </div>
                              )}
                              {!isAvailable && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-full h-[1px] bg-slate-300 -rotate-45" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                     </div>
                  </div>

                  {selectedProduct.description && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Descrição Completa
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                        {selectedProduct.description}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => navigate(`/produtos/editar/${selectedProduct.id}`)}
                      className="w-14 h-14 bg-primary dark:bg-white dark:text-primary text-white font-black rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 dark:shadow-white/5 hover:scale-[1.02] transition-transform"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    {!confirmDelete ? (
                      <button
                        onClick={() => setConfirmDelete(selectedProduct.id)}
                        className="w-14 h-14 bg-danger/10 text-danger hover:bg-danger hover:text-white transition-all rounded-2xl flex items-center justify-center shadow-sm"
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(selectedProduct.id)}
                          className="px-4 bg-danger text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-lg shadow-danger/20"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl text-[10px] uppercase font-black"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailItem({ label, value, highlight, theme = 'default', icon: Icon }: any) {
  const themeStyles = {
    default: "text-slate-800 dark:text-slate-100",
    success: "text-success",
    danger: "text-danger"
  };

  return (
    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col">
      <div className="flex items-center justify-between mb-1 opacity-40">
        <span className="text-[8px] font-black uppercase tracking-widest dark:text-slate-400">{label}</span>
        <Icon className="w-2.5 h-2.5 dark:text-slate-400" />
      </div>
      <span className={cn(
        "text-xs md:text-sm font-black truncate",
        highlight && "text-accent",
        (themeStyles as any)[theme]
      )}>
        {value}
      </span>
    </div>
  );
}
