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
  deleteDoc,
  writeBatch,
  getDoc,
  getDocs,
  increment
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Purchase } from '@/src/types';
import { formatCurrency } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { Lock } from 'lucide-react';

export default function Purchases() {
  const { profile, isAdmin, verifyPassword } = useAuth();
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Password Verification State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

  const handleEditClick = (purchaseId: string) => {
    const action = () => {
      navigate(`/compras/nova?edit=${purchaseId}`);
    };

    if (isAdmin) {
      setPendingAction(() => action);
      setShowPasswordPrompt(true);
    } else {
      alert('Acesso restrito a administradores');
    }
  };

  const confirmPassword = async () => {
    setVerifyingPassword(true);
    const isValid = await verifyPassword(passwordInput);
    setVerifyingPassword(false);
    
    if (isValid) {
      setShowPasswordPrompt(false);
      setPasswordInput('');
      pendingAction();
    } else {
      alert('Senha incorreta');
    }
  };

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
    const action = async () => {
      try {
        setLoading(true);
        const batch = writeBatch(db);

        // 1. Revert product stock (Subtract what was added)
        if (purchase.items && Array.isArray(purchase.items)) {
          for (const item of purchase.items) {
            const productRef = doc(db, 'products', item.productId);
            try {
              const productSnap = await getDoc(productRef);
              if (productSnap.exists()) {
                const updateData: any = {
                  stock: increment(-item.quantity)
                };

                if (item.size) {
                  updateData[`sizeStock.${item.size}`] = increment(-item.quantity);
                }

                batch.update(productRef, updateData);
              }
            } catch (e) {
              console.warn(`Erro ao buscar produto ${item.productId}:`, e);
            }
          }
        }

        // 2. Delete linked movements (where purchaseId === purchase.id)
        const movementsSnap = await getDocs(query(collection(db, 'movements'), where('purchaseId', '==', purchase.id)));
        movementsSnap.docs.forEach(d => {
          batch.delete(d.ref);
        });

        // 3. Delete linked cash movements (where purchaseId === purchase.id)
        const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('purchaseId', '==', purchase.id)));
        cashMovementsSnap.docs.forEach(d => {
          batch.delete(d.ref);
        });

        // 4. Delete the purchase itself
        batch.delete(doc(db, 'purchases', purchase.id));

        await batch.commit();
        alert('Compra excluída e estoque revertido com sucesso!');
      } catch (error) {
        console.error(error);
        alert('Erro ao excluir compra');
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin) {
      if (confirm(`Deseja realmente excluir esta compra #${purchase.id.slice(-6).toUpperCase()}? O estoque será revertido automaticamente.`)) {
        setPendingAction(() => action);
        setShowPasswordPrompt(true);
      }
    } else {
      alert('Acesso restrito a administradores');
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
                       <button 
                        onClick={() => handleEditClick(purchase.id)}
                        className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-300 rounded-xl hover:bg-accent/10 hover:text-accent transition-all"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
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

      {/* Password Verification Modal */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPasswordPrompt(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-xs overflow-hidden relative z-10 p-8 text-center"
            >
              <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center text-accent mx-auto mb-6">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Acesso Restrito</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Confirme sua senha de Admin para continuar</p>
              
              <div className="space-y-4">
                <input 
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Sua senha..."
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-center font-bold outline-none focus:ring-2 focus:ring-accent/20 transition-all"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && confirmPassword()}
                />
                
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={confirmPassword}
                    disabled={verifyingPassword}
                    className="w-full py-4 bg-accent text-white font-black rounded-2xl text-[10px] uppercase shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {verifyingPassword ? 'Verificando...' : 'Confirmar Acesso'}
                  </button>
                  <button 
                    onClick={() => setShowPasswordPrompt(false)}
                    className="w-full py-4 bg-slate-50 text-slate-400 font-black rounded-2xl text-[10px] uppercase"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
