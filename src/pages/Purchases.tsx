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
  Pencil,
  X,
  Clock,
  TrendingUp,
  CreditCard,
  CheckCircle2,
  Package,
  Edit2
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
  increment,
  serverTimestamp
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);

  // Calculations for selected purchase overhead
  const selectedPurchaseCartTotal = selectedPurchase?.items?.reduce((acc: number, item: any) => acc + (item.total || 0), 0) || 0;
  const selectedPurchaseDivisionResult = selectedPurchaseCartTotal > 0 ? Number((selectedPurchase.total / selectedPurchaseCartTotal).toFixed(4)) : 1;
  const selectedPurchasePercentageOverhead = (selectedPurchaseDivisionResult - 1) * 100;

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
      orderBy('timestamp', 'desc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const allPurchases = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        itemsCount: doc.data().items?.length || 0
      })) as Purchase[];
      const paidPurchases = allPurchases.filter(p => p.paymentStatus === 'paid' || p.paymentStatus2 === 'paid');
      setPurchases(paidPurchases);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleDelete = async (purchase: Purchase) => {
    const action = async () => {
      setIsDeleting(true);
      try {
        const batch = writeBatch(db);

        // Purchases no longer affect stock, so no product stock reversion is needed here.

        // 3. Delete cash movements
        const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('purchaseId', '==', purchase.id)));
        cashMovementsSnap.docs.forEach(d => batch.delete(d.ref));

        // 4. Delete purchase
        batch.delete(doc(db, 'purchases', purchase.id));

        await batch.commit();
        alert('Compra excluída e estoque atualizado com sucesso!');
      } catch (error) {
        console.error('Delete error:', error);
        alert('Erro ao excluir compra. Verifique sua conexão.');
      } finally {
        setIsDeleting(false);
      }
    };

    if (isAdmin) {
      setPendingAction(() => action);
      setShowPasswordPrompt(true);
    } else {
      alert('Acesso restrito a administradores');
    }
  };

  const filteredPurchases = purchases.filter(p => 
    p.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getParsedDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    return new Date(ts);
  };

  const groupPurchasesByDate = (purchasesList: Purchase[]) => {
    const groups: { [key: string]: Purchase[] } = {};
    purchasesList.forEach(p => {
      const dateObj = getParsedDate(p.timestamp);
      const dateKey = dateObj.toLocaleDateString('pt-BR');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(p);
    });
    
    return Object.keys(groups)
      .sort((a, b) => {
        const [dayA, monthA, yearA] = a.split('/').map(Number);
        const [dayB, monthB, yearB] = b.split('/').map(Number);
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateB.getTime() - dateA.getTime();
      })
      .map(dateKey => ({
        dateKey,
        items: groups[dateKey]
      }));
  };

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
        <div className="space-y-8">
          {groupPurchasesByDate(filteredPurchases).map(({ dateKey, items }) => (
            <div key={dateKey} className="space-y-3 break-before-page print:break-before-page">
              <div className="flex items-center gap-4 my-2">
                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest border border-slate-100 flex items-center gap-1.5 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {dateKey}
                </span>
                <div className="h-px bg-slate-100 flex-1" />
              </div>

              <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.map((purchase) => {
                  const date = getParsedDate(purchase.timestamp);
                  
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={purchase.id}
                      onClick={() => setSelectedPurchase(purchase)}
                      className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-slate-50 rounded-xl group-hover:bg-primary/5 transition-colors flex-shrink-0">
                          <Truck className="w-4 h-4 text-slate-400 group-hover:text-primary" />
                        </div>
                        <div className="flex items-center gap-1 min-w-0">
                          <div className="px-2 py-0.5 rounded text-[8px] font-black bg-success/10 text-success uppercase tracking-tighter truncate font-sans">
                            Pago
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEditClick(purchase.id);
                            }}
                            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-accent hover:bg-accent/10 rounded-lg transition-all flex-shrink-0"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(purchase);
                            }}
                            className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="mt-auto">
                        <p className="text-[10px] font-black text-slate-800 leading-tight uppercase tracking-tight">
                          {date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </p>
                        <h3 className="text-[14px] font-black text-slate-900 mt-0.5 uppercase truncate">
                          {purchase.supplierName || 'Fornecedor Avulso'}
                        </h3>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                          <span className="text-[10px] font-black text-accent">
                            {formatCurrency(
                              (purchase.paymentStatus === 'paid' ? (purchase.splitAmount1 || purchase.total) : 0) + 
                              (purchase.paymentStatus2 === 'paid' ? (purchase.splitAmount2 || 0) : 0)
                            )}
                          </span>
                          <span className="text-[8px] font-bold text-slate-400 uppercase truncate">
                            {purchase.isSplitPayment ? (
                              <>
                                {purchase.paymentStatus === 'paid' && purchase.paymentMethod}
                                {purchase.paymentStatus === 'paid' && purchase.paymentStatus2 === 'paid' && ' + '}
                                {purchase.paymentStatus2 === 'paid' && purchase.paymentMethod2}
                              </>
                            ) : (
                              purchase.paymentMethod || 'Dinheiro'
                            )}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}

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

      {/* Purchase Detail Modal */}
      <AnimatePresence>
        {selectedPurchase && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPurchase(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={`purchase-${selectedPurchase.id}`}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-5 right-5 z-20">
                <button 
                  onClick={() => setSelectedPurchase(null)} 
                  className="p-2.5 bg-white/80 hover:bg-white rounded-full shadow-lg transition-colors text-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 pb-4 bg-success text-white relative">
                 <div className="p-4 bg-white/10 rounded-3xl w-fit mb-4 backdrop-blur-md">
                    <CheckCircle2 className="w-8 h-8" />
                 </div>
                 <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">Compra Paga</h2>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">NF: #{selectedPurchase.id.slice(-6).toUpperCase()}</p>
                 
                 <div className="mt-6 p-4 bg-white/10 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black uppercase opacity-60">Total da Nota</span>
                       <TrendingUp className="w-4 h-4 opacity-40" />
                    </div>
                    <p className="text-3xl font-black mt-1">{formatCurrency(selectedPurchase.total)}</p>
                 </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> Data
                    </p>
                    <p className="text-xs font-black text-slate-800">
                       {format(selectedPurchase.timestamp instanceof Timestamp ? selectedPurchase.timestamp.toDate() : new Date(selectedPurchase.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Itens
                    </p>
                    <p className="text-xs font-black text-slate-800 uppercase">{(selectedPurchase as any).itemsCount || selectedPurchase.items?.length || 0} produtos</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 col-span-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                      <CreditCard className="w-3 h-3" /> Pagamento
                    </p>
                    <div className="text-[10px] font-black text-slate-800 uppercase leading-tight">
                      {selectedPurchase.isSplitPayment ? (
                        <>
                          <div className="flex justify-between items-center">
                            <span>
                              {selectedPurchase.paymentMethod}: {formatCurrency(selectedPurchase.splitAmount1 || 0)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[8px] ml-2 bg-success/10 text-success">
                              PAGO
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between items-center">
                            <span>
                              {selectedPurchase.paymentMethod2}: {formatCurrency(selectedPurchase.splitAmount2 || 0)}
                            </span>
                            <span className="px-1.5 py-0.5 rounded-full text-[8px] ml-2 bg-success/10 text-success">
                              PAGO
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span>{selectedPurchase.paymentMethod || 'Dinheiro'}</span>
                          <span className="px-1.5 py-0.5 rounded-full text-[8px] ml-2 bg-success/10 text-success">
                            PAGO
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedPurchaseCartTotal > 0 && (
                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-center col-span-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-accent" /> Custos Extras
                      </p>
                      <p className="text-xs font-black text-accent font-mono leading-none mt-1">
                        {selectedPurchasePercentageOverhead >= 0 ? "+" : ""}
                        {selectedPurchasePercentageOverhead.toLocaleString("pt-BR", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 4,
                        })}
                        %
                      </p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <Truck className="w-3 h-3" /> Fornecedor
                  </p>
                  <p className="text-xs font-black text-slate-800 uppercase">{selectedPurchase.supplierName || 'Fornecedor Avulso'}</p>
                </div>

                {selectedPurchase.installmentsList && selectedPurchase.installmentsList.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                      <CreditCard className="w-3 h-3" /> Parcelas
                    </p>
                    <div className="space-y-2">
                      {selectedPurchase.installmentsList.map((inst: any) => (
                        <div key={inst.id} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black bg-success/10 text-success">
                              {inst.id}
                            </div>
                            <div>
                              <p className="font-black text-slate-800 text-[11px] uppercase">{formatCurrency(inst.amount)}</p>
                              {inst.dueDate && (
                                <p className="text-[9px] text-slate-400 font-bold">Vencimento: {format(new Date(inst.dueDate), "dd/MM")}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase">Pago</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPurchase.items && selectedPurchase.items.length > 0 && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                      <Package className="w-3 h-3" /> Itens na Nota
                    </p>
                    <div className="space-y-2">
                      {selectedPurchase.items.map((item: any, idx: number) => (
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
                )}
              </div>

              <div className="p-8 pt-0 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    handleEditClick(selectedPurchase.id);
                    setSelectedPurchase(null);
                  }}
                  className="flex-1 h-16 bg-slate-100 hover:bg-accent/10 hover:text-accent text-slate-600 font-black rounded-3xl flex items-center justify-center text-sm transition-all active:scale-95 shadow-sm uppercase gap-2"
                >
                  <Edit2 className="w-5 h-5" />
                  Editar Registro
                </button>
                <button 
                  onClick={() => {
                    handleDelete(selectedPurchase);
                    setSelectedPurchase(null);
                  }}
                  className="w-16 h-16 bg-slate-100 text-slate-400 font-black rounded-3xl flex items-center justify-center hover:bg-danger/10 hover:text-danger transition-all active:scale-95 shadow-sm"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
