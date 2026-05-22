import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  Search, 
  CheckCircle2, 
  Truck, 
  CreditCard, 
  FileText, 
  Package, 
  X,
  TrendingUp,
  AlertCircle,
  Loader2,
  Calendar,
  Trash2,
  Edit2,
  Lock,
  Pencil
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  addDoc,
  deleteDoc,
  Timestamp,
  writeBatch,
  getDoc,
  getDocs,
  increment,
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Purchase } from '@/src/types';
import { formatCurrency, cn, getBrasiliaISO, getBrasiliaTime } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function PurchasesPending() {
  const { profile, isAdmin, verifyPassword } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculations for selected purchase overhead
  const selectedPurchaseCartTotal = selectedPurchase?.items?.reduce((acc: number, item: any) => acc + (item.total || 0), 0) || 0;
  const selectedPurchaseDivisionResult = selectedPurchaseCartTotal > 0 ? Number((selectedPurchase.total / selectedPurchaseCartTotal).toFixed(4)) : 1;
  const selectedPurchasePercentageOverhead = (selectedPurchaseDivisionResult - 1) * 100;

  // Password Verification State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

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
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allPurchases = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        itemsCount: doc.data().items?.length || 0
      } as Purchase));
      const pendingPurchases = allPurchases.filter(p => p.paymentStatus === 'pending' || p.paymentStatus2 === 'pending');
      setPurchases(pendingPurchases);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching pending purchases:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleFinalize = async (purchase: Purchase) => {
    if (!profile) return;
    
    const unpaidAmount = purchase.installmentsList 
      ? purchase.installmentsList.filter(i => i.status === 'pending').reduce((acc, i) => acc + i.amount, 0)
      : purchase.total;

    if (!confirm(`Deseja quitar o valor restante de ${formatCurrency(unpaidAmount)} desta compra?`)) return;

    setIsProcessing(true);
    try {
      // 1. Update purchase status
      const purchaseRef = doc(db, 'purchases', purchase.id);
      const updates: any = {
        paymentStatus: 'paid',
        paidAt: getBrasiliaISO()
      };

      if (purchase.installmentsList) {
        updates.installmentsList = purchase.installmentsList.map(i => ({
          ...i,
          status: 'paid',
          paidAt: i.paidAt || getBrasiliaISO()
        }));
      }

      await updateDoc(purchaseRef, updates);

      // 2. Record Financial Movement
      await addDoc(collection(db, 'cash_movements'), {
        amount: unpaidAmount,
        type: 'out',
        category: 'compra',
        paymentMethod: purchase.paymentMethod,
        reason: `Quitação Compra #${purchase.id.slice(-6).toUpperCase()}`,
        userId: profile.uid,
        userName: profile.name,
        purchaseId: purchase.id,
        timestamp: getBrasiliaISO()
      });

      setSelectedPurchase(null);
      alert('Pagamento quitado com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao confirmar pagamento');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayInstallment = async (purchase: Purchase, installmentId: number) => {
    if (!profile) return;
    const installment = purchase.installmentsList?.find(i => i.id === installmentId);
    if (!installment) return;
    
    if (!confirm(`Confirmar o pagamento da parcela ${installmentId} no valor de ${formatCurrency(installment.amount)}?`)) return;

    setIsProcessing(true);
    try {
      const updatedInstallments = purchase.installmentsList?.map(i => 
        i.id === installmentId ? { ...i, status: 'paid', paidAt: getBrasiliaISO() } : i
      );

      const allPaid = updatedInstallments?.every(i => i.status === 'paid');
      
      const purchaseRef = doc(db, 'purchases', purchase.id);
      await updateDoc(purchaseRef, {
        installmentsList: updatedInstallments,
        paymentStatus: allPaid ? 'paid' : 'pending',
        paidAt: allPaid ? getBrasiliaISO() : null
      });

      // Record Financial Movement
      await addDoc(collection(db, 'cash_movements'), {
        amount: installment.amount,
        type: 'out',
        category: 'compra',
        paymentMethod: purchase.paymentMethod,
        reason: `Pgto Parcela ${installmentId}/${purchase.installments} Compra #${purchase.id.slice(-6).toUpperCase()}`,
        userId: profile.uid,
        userName: profile.name,
        purchaseId: purchase.id,
        installmentId: installmentId,
        timestamp: getBrasiliaISO()
      });

      if (allPaid) {
        setSelectedPurchase(null);
        alert('Toda a compra foi quitada!');
      } else {
        // Update local state for the modal
        setSelectedPurchase({
          ...purchase,
          installmentsList: updatedInstallments,
          paymentStatus: 'pending'
        });
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao pagar parcela');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (purchase: Purchase) => {
    if (!purchase?.id) return;
    
    const action = async () => {
      setIsProcessing(true);
      try {
        const batch = writeBatch(db);

        // Purchases no longer affect stock, so no product stock reversion is needed here.

        // 3. Delete linked cash movements
        const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('purchaseId', '==', purchase.id)));
        cashMovementsSnap.docs.forEach(d => batch.delete(d.ref));

        // 4. Delete the purchase itself
        batch.delete(doc(db, 'purchases', purchase.id));

        await batch.commit();
        setSelectedPurchase(null);
        alert('Compra pendente excluída e estoque atualizado!');
      } catch (error) {
        console.error('Delete error:', error);
        alert('Erro ao excluir compra');
      } finally {
        setIsProcessing(false);
      }
    };

    if (isAdmin) {
      setPendingAction(() => action);
      setShowPasswordPrompt(true);
    } else {
      alert('Acesso restrito a administradores');
    }
  };

  const filteredPurchases = purchases.filter(p => {
    const matchesSearch = p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Additional filtering logic if needed (e.g. by supplier)
    return matchesSearch;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-danger/5 rounded-xl flex items-center justify-center text-danger">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Compras a Pagar</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase leading-none mt-1">Notas de Entrada Pendentes</p>
          </div>
        </div>
        
        <div className="bg-danger/10 px-4 py-2 rounded-xl border border-danger/20 flex items-center gap-2">
           <AlertCircle className="w-4 h-4 text-danger" />
           <p className="text-[10px] font-black text-danger uppercase">Total a Pagar: {formatCurrency(purchases.reduce((acc, p) => {
             const amt = (p.paymentStatus === 'pending' ? (p.splitAmount1 || p.total) : 0) + (p.paymentStatus2 === 'pending' ? (p.splitAmount2 || 0) : 0);
             return acc + amt;
           }, 0))}</p>
        </div>
      </div>

      <div className="relative px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text"
          placeholder="Buscar compra pendente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-danger/20 transition-all text-xs"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2">
        {filteredPurchases.map((purchase) => {
          const date = purchase.timestamp instanceof Timestamp ? purchase.timestamp.toDate() : new Date(purchase.timestamp);
          return (
            <motion.div
              key={purchase.id}
              layoutId={`purchase-${purchase.id}`}
              onClick={() => setSelectedPurchase(purchase)}
              className="bg-white p-4 rounded-[28px] border border-slate-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative cursor-pointer"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-danger/5 group-hover:text-danger transition-colors">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-end">
                   <span className="text-[8px] font-black bg-danger/10 text-danger px-2 py-0.5 rounded-lg uppercase tracking-wider mb-1">
                    A Pagar
                  </span>
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none">
                    #{purchase.id.slice(-6).toUpperCase()}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">
                   {format(date, "dd MMM yyyy", { locale: ptBR })}
                </p>
                <h3 className="text-sm font-black text-slate-800 line-clamp-1 group-hover:text-primary transition-colors uppercase">
                  {purchase.supplierName || 'Fornecedor Avulso'}
                </h3>
              </div>

              <div className="pt-3 border-t border-slate-50 mt-3 flex justify-between items-end">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1 leading-none">Pendente</span>
                  <span className="text-base font-black text-danger leading-none">
                    {formatCurrency(
                      (purchase.paymentStatus === 'pending' ? (purchase.splitAmount1 || purchase.total) : 0) + 
                      (purchase.paymentStatus2 === 'pending' ? (purchase.splitAmount2 || 0) : 0)
                    )}
                  </span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">
                    {purchase.isSplitPayment ? (
                      <>
                        {purchase.paymentStatus === 'pending' && purchase.paymentMethod}
                        {purchase.paymentStatus === 'pending' && purchase.paymentStatus2 === 'pending' && ' + '}
                        {purchase.paymentStatus2 === 'pending' && purchase.paymentMethod2}
                      </>
                    ) : purchase.paymentMethod}
                  </span>
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest leading-none">{purchase.itemsCount} PRODS</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFinalize(purchase);
                  }}
                  className="flex-1 py-3 bg-danger text-white text-[9px] font-black rounded-xl shadow-lg shadow-danger/20 transition-all uppercase tracking-widest hover:brightness-110 active:scale-95"
                >
                  Confirmar Pagamento
                </button>
                <Link 
                  to={`/compras/nova?edit=${purchase.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-accent/10 hover:text-accent transition-all"
                >
                  <Pencil className="w-4 h-4" />
                </Link>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(purchase);
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-danger/10 hover:text-danger transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredPurchases.length === 0 && !loading && (
        <div className="py-20 text-center px-4">
          <div className="bg-white p-8 rounded-[40px] border border-dashed border-slate-200 inline-block w-full max-w-sm">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4 opacity-20" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">Tudo em dia!</h3>
            <p className="text-[10px] text-slate-300 font-black tracking-widest mt-1">Nenhuma compra pendente de pagamento</p>
          </div>
        </div>
      )}

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

              <div className="p-8 pb-4 bg-danger text-white relative">
                 <div className="p-4 bg-white/10 rounded-3xl w-fit mb-4 backdrop-blur-md">
                    <Clock className="w-8 h-8" />
                 </div>
                 <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">Compra a Pagar</h2>
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
                    <p className="text-xs font-black text-slate-800 uppercase">{selectedPurchase.itemsCount} produtos</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
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
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                              selectedPurchase.paymentStatus === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                            )}>
                              {selectedPurchase.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}
                            </span>
                          </div>
                          <div className="mt-1 flex justify-between items-center">
                            <span>
                              {selectedPurchase.paymentMethod2}: {formatCurrency(selectedPurchase.splitAmount2 || 0)}
                            </span>
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                              selectedPurchase.paymentStatus2 === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                            )}>
                              {selectedPurchase.paymentStatus2 === 'paid' ? 'PAGO' : 'PENDENTE'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span>{selectedPurchase.paymentMethod || 'Dinheiro'}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                            selectedPurchase.paymentStatus === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                          )}>
                            {selectedPurchase.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {selectedPurchaseCartTotal > 0 && (
                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100 flex flex-col justify-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-accent" /> Acréscimo Custo
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

                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                    <CreditCard className="w-3 h-3" /> Parcelas ({selectedPurchase.installments})
                  </p>
                  <div className="space-y-2">
                    {selectedPurchase.installmentsList?.map((inst) => (
                      <div key={inst.id} className="flex items-center justify-between p-3 bg-white rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black",
                            inst.status === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                          )}>
                            {inst.id}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-[11px] uppercase">{formatCurrency(inst.amount)}</p>
                            <p className="text-[9px] text-slate-400 font-bold">Vence em: {format(new Date(inst.dueDate), "dd/MM")}</p>
                          </div>
                        </div>
                        {inst.status === 'pending' ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePayInstallment(selectedPurchase, inst.id);
                            }}
                            className="px-3 py-1.5 bg-danger text-white text-[9px] font-black rounded-lg shadow-md shadow-danger/10 uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                          >
                            Pagar Parcela
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 text-success">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-[8px] font-black uppercase">Pago</span>
                          </div>
                        )}
                      </div>
                    ))}
                    {!selectedPurchase.installmentsList && (
                      <div className="p-3 bg-slate-50 text-slate-400 text-[10px] font-bold text-center rounded-2xl border border-dashed border-slate-200">
                        Nota de pagamento único
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                    <Package className="w-3 h-3" /> Itens na Nota
                  </p>
                  <div className="space-y-2">
                    {selectedPurchase.items?.map((item, idx) => (
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

              <div className="p-8 pt-0 flex gap-3">
                <Link 
                  to={`/compras/nova?edit=${selectedPurchase.id}`}
                  className="w-16 h-16 bg-slate-100 text-slate-400 font-black rounded-3xl flex items-center justify-center hover:bg-accent/10 hover:text-accent transition-all active:scale-95 shadow-sm"
                >
                  <Edit2 className="w-6 h-6" />
                </Link>
                <button 
                  onClick={() => selectedPurchase && handleDelete(selectedPurchase)}
                  disabled={isProcessing}
                  className="w-16 h-16 bg-slate-100 text-slate-400 font-black rounded-3xl flex items-center justify-center hover:bg-danger/10 hover:text-danger transition-all active:scale-95 shadow-sm disabled:opacity-50"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => handleFinalize(selectedPurchase)}
                  disabled={isProcessing}
                  className="flex-1 h-16 bg-danger text-white font-black rounded-3xl flex items-center justify-center text-sm shadow-xl shadow-danger/20 hover:scale-[1.02] transition-transform uppercase disabled:opacity-50"
                >
                  {isProcessing && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
                  Confirmar Pagamento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Password Verification Modal */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
              className="bg-white rounded-[32px] shadow-2xl w-full max-w-xs overflow-hidden relative z-[121] p-8 text-center"
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
