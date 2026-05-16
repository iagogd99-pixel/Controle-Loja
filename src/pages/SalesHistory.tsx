import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  History, 
  Search, 
  Download,
  Calendar,
  X,
  User,
  CreditCard,
  Receipt,
  Package,
  Clock,
  ChevronRight,
  TrendingUp,
  XCircle,
  Trash2,
  Plus,
  ShoppingCart as ShoppingCartIcon
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc, 
  doc,
  updateDoc,
  increment,
  addDoc,
  writeBatch,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Sale } from '@/src/types';
import { formatCurrency, formatDate, cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';

export default function SalesHistory() {
  const { isAdmin, profile } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (sale: Sale, e?: React.MouseEvent) => {
    e?.stopPropagation();
    alert('Tentando excluir venda: ' + sale.id);
    
    console.log('DEBUG: Iniciando handleDelete para', sale.id);
    
    if (!profile) {
      alert('Aguardando carregamento do perfil para excluir...');
      return;
    }
    
    console.log('Botão excluir pressionado. ID Venda:', sale.id);
    console.log('Perfil atual:', profile);

    // Temporariamente removendo confirm para testar se ele está bloqueando
    /*
    if (!confirm(`Deseja cancelar a venda ${sale.id}? Esta ação devolverá os itens ao estoque e NÃO pode ser desfeita.`)) {
      return;
    }
    */

    try {
      setLoading(true);
      const batch = writeBatch(db);
      console.log('Iniciando estorno de itens para venda:', sale.id);
      
      // 1. Process items (Return to stock)
      for (const item of sale.items) {
        if (!item.productId) continue;

        const productRef = doc(db, 'products', item.productId);
        // We do a getDoc to ensure it exists, but we catch errors individualy
        try {
          const productSnap = await getDoc(productRef);
          if (productSnap.exists()) {
            batch.update(productRef, {
              stock: increment(item.quantity)
            });
          }
        } catch (e) {
          console.warn(`Erro ao buscar produto ${item.productId}:`, e);
        }
        
        // Add movement record
        const movementRef = doc(collection(db, 'movements'));
        batch.set(movementRef, {
          productId: item.productId,
          productName: item.name,
          type: 'in',
          quantity: item.quantity,
          reason: 'Estorno: Venda cancelada ' + sale.id,
          userId: profile?.uid || 'system',
          userName: profile?.name || 'Sistema',
          timestamp: new Date().toISOString()
        });
      }

      // 2. Delete sale doc
      const saleRef = doc(db, 'sales', sale.id);
      batch.delete(saleRef);

      await batch.commit();
      alert('Venda cancelada com sucesso!');
      setSelectedSale(null);
    } catch (err: any) {
      console.error('ERRO FATAL AO CANCELAR VENDA:', err);
      
      let msg = 'Não foi possível cancelar a venda.';
      if (err?.code === 'permission-denied' || (err?.message && err.message.includes('permission-denied'))) {
        msg = 'Erro de Permissão: Verifique se você tem autorização no banco de dados.';
      } else {
        msg += '\nDetalhes: ' + (err?.message || err?.code || JSON.stringify(err));
      }
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const filteredSales = sales.filter(s => 
    s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.userName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <ShoppingCartIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Vendas</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase leading-none mt-1">Histórico & Movimentações</p>
          </div>
        </div>
        
        <Link 
          to="/vendas"
          className="flex items-center justify-center gap-2 px-6 py-3.5 bg-accent text-white font-black rounded-2xl shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase text-xs tracking-tighter"
        >
          <Plus className="w-4 h-4" />
          Nova Venda
        </Link>
      </div>

      <div className="relative px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text"
          placeholder="Buscar venda..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-accent/20 transition-all text-xs"
        />
      </div>

      <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-2">
        {filteredSales.map((sale) => {
          const date = new Date(sale.timestamp);
          return (
            <motion.div
              key={sale.id}
              layoutId={`sale-${sale.id}`}
              onClick={() => setSelectedSale(sale)}
              className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative cursor-pointer"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-accent/10 transition-colors">
                  <Clock className="w-4 h-4 text-slate-400 group-hover:text-accent" />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(sale, e);
                    }}
                    className="p-3 text-slate-500 hover:text-danger hover:bg-danger/10 rounded-xl transition-all z-50 relative pointer-events-auto"
                    title="Excluir Venda"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="mt-auto">
                <p className="text-[10px] font-black text-slate-800 leading-tight uppercase tracking-tight">
                  {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </p>
                <p className="text-[14px] font-black text-slate-900 mt-0.5">
                  {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                  <span className="text-[10px] font-black text-accent">{formatCurrency(sale.total)}</span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{sale.paymentMethod}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredSales.length === 0 && !loading && (
        <div className="py-20 text-center px-4">
          <div className="bg-white p-8 rounded-[40px] border border-dashed border-slate-200 inline-block w-full max-w-sm">
            <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">Sem registros</h3>
            <p className="text-[10px] text-slate-300 font-black tracking-widest mt-1">Nenhuma venda encontrada no período</p>
          </div>
        </div>
      )}

      {/* Sale Detail Modal */}
      <AnimatePresence>
        {selectedSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSale(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={`sale-${selectedSale.id}`}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-5 right-5 z-20">
                <button 
                  onClick={() => setSelectedSale(null)} 
                  className="p-2.5 bg-white/80 hover:bg-white rounded-full shadow-lg transition-colors text-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 pb-4 bg-primary text-white relative">
                 <div className="p-4 bg-white/10 rounded-3xl w-fit mb-4 backdrop-blur-md">
                    <Receipt className="w-8 h-8" />
                 </div>
                 <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">Comprovante</h2>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">ID: {selectedSale.id}</p>
                 
                 <div className="mt-6 p-4 bg-white/10 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black uppercase opacity-60">Valor Total</span>
                       <TrendingUp className="w-4 h-4 opacity-40" />
                    </div>
                    <p className="text-3xl font-black mt-1">{formatCurrency(selectedSale.total)}</p>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Data
                    </p>
                    <p className="text-xs font-black text-slate-800">{formatDate(selectedSale.timestamp)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Método
                    </p>
                    <p className="text-xs font-black text-slate-800 uppercase">{selectedSale.paymentMethod}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User className="w-3 h-3" /> Cliente & Vendedor
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs items-center">
                       <span className="text-slate-400 font-bold uppercase text-[9px]">Cliente</span>
                       <span className="text-slate-800 font-black">{selectedSale.customerName || 'Não Informado'}</span>
                    </div>
                    <div className="flex justify-between text-xs items-center">
                       <span className="text-slate-400 font-bold uppercase text-[9px]">Operador</span>
                       <span className="text-slate-800 font-black">{selectedSale.userName}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                    <Package className="w-3 h-3" /> Itens Vendidos ({selectedSale.items.reduce((acc, i) => acc + i.quantity, 0)})
                  </p>
                  <div className="space-y-2">
                    {selectedSale.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="max-w-[70%]">
                          <p className="font-black text-slate-800 text-[11px] leading-tight line-clamp-1 uppercase">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.quantity}un x {formatCurrency(item.price)}</p>
                        </div>
                        <p className="font-black text-slate-900 text-xs">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 pt-0 space-y-3">
                <button 
                  onClick={() => window.print()}
                  className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-sm hover:bg-slate-200 transition-colors uppercase"
                >
                  <Download className="w-4 h-4" /> Imprimir Comprovante
                </button>
                
                  <button 
                    onClick={(e) => selectedSale && handleDelete(selectedSale, e)}
                    className="w-full py-4 bg-danger text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-danger/20 hover:scale-[1.02] transition-transform uppercase cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Cancelar / Estornar Venda
                  </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
