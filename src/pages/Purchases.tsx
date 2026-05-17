import React, { useEffect, useState } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Calendar, 
  ArrowUpRight, 
  Loader2,
  ChevronRight,
  Eye,
  FileText,
  Trash2,
  AlertCircle,
  Pencil
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  where,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Purchase } from '@/src/types';
import { formatCurrency } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, 'purchases'), 
      where('paymentStatus', '==', 'paid'),
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        itemsCount: doc.data().items?.length || 0
      })) as Purchase[];
      setPurchases(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDelete = async (purchase: Purchase) => {
    if (!confirm(`Deseja realmente excluir esta compra #${purchase.id.slice(-6).toUpperCase()}? O estoque não será revertido automaticamente.`)) return;
    
    try {
      await deleteDoc(doc(db, 'purchases', purchase.id));
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir compra');
    }
  };

  const filteredPurchases = purchases.filter(p => 
    p.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Compras Pagas</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Histórico de Entradas de Estoque</p>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-accent transition-colors" />
        <input 
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar por fornecedor ou ID da compra..."
          className="w-full h-16 bg-white border border-slate-100 rounded-[24px] pl-14 pr-6 font-bold text-slate-700 outline-none shadow-sm focus:border-accent/30 transition-all placeholder:text-slate-300"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredPurchases.map((purchase) => {
            const date = purchase.timestamp instanceof Timestamp ? purchase.timestamp.toDate() : new Date(purchase.timestamp);
            
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={purchase.id}
                className="bg-white p-6 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md hover:border-accent/20 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-hover:bg-primary/5 group-hover:text-primary transition-all">
                      <FileText className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-white px-2 py-0.5 bg-slate-800 rounded-lg">
                          #{purchase.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {format(date, "dd MMM yyyy, HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                      <h3 className="text-lg font-black text-primary truncate max-w-[200px] md:max-w-md">
                        {purchase.supplierName || 'Fornecedor Avulso'}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-8 pl-14 md:pl-0">
                    <div className="text-left md:text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Itens</p>
                      <p className="text-sm font-black text-slate-600">{purchase.itemsCount} produtos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pagamento</p>
                      <p className="text-sm font-black text-slate-600 uppercase tracking-[0.2em] text-[10px]">
                        {(purchase as any).paymentMethod || 'Dinheiro'}
                        {(purchase as any).installments > 1 ? ` (${(purchase as any).installments}x)` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-accent uppercase tracking-widest mb-1">Total Pago</p>
                      <p className="text-xl font-black text-primary">{formatCurrency(purchase.total)}</p>
                    </div>
                    <div className="flex gap-2">
                       <Link 
                        to={`/compras/nova?edit=${purchase.id}`}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-300 rounded-xl hover:bg-accent/10 hover:text-accent transition-all"
                      >
                        <Pencil className="w-5 h-5" />
                      </Link>
                      <button 
                        onClick={() => handleDelete(purchase)}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-300 rounded-xl hover:bg-danger/10 hover:text-danger transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {filteredPurchases.length === 0 && (
            <div className="text-center py-20 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-100">
              <Truck className="w-16 h-16 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">Nenhuma compra registrada</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
