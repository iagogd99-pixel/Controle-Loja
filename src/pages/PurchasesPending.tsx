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
  Edit2
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
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Purchase } from '@/src/types';
import { formatCurrency, cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Link } from 'react-router-dom';

export default function PurchasesPending() {
  const { profile } = useAuth();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'purchases'), 
      where('paymentStatus', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPurchases(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        itemsCount: doc.data().items?.length || 0
      } as Purchase)));
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
        paidAt: new Date().toISOString()
      };

      if (purchase.installmentsList) {
        updates.installmentsList = purchase.installmentsList.map(i => ({
          ...i,
          status: 'paid',
          paidAt: i.paidAt || new Date().toISOString()
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
        timestamp: new Date().toISOString()
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
        i.id === installmentId ? { ...i, status: 'paid', paidAt: new Date().toISOString() } : i
      );

      const allPaid = updatedInstallments?.every(i => i.status === 'paid');
      
      const purchaseRef = doc(db, 'purchases', purchase.id);
      await updateDoc(purchaseRef, {
        installmentsList: updatedInstallments,
        paymentStatus: allPaid ? 'paid' : 'pending',
        paidAt: allPaid ? new Date().toISOString() : null
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
        timestamp: new Date().toISOString()
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
    
    if (!confirm(`Deseja realmente excluir esta compra #${purchase.id.slice(-6).toUpperCase()}? O estoque não será revertido automaticamente.`)) return;
    
    setIsProcessing(true);
    try {
      console.log('Attempting to delete purchase:', purchase.id);
      await deleteDoc(doc(db, 'purchases', purchase.id));
      console.log('Purchase deleted successfully');
      setSelectedPurchase(null);
    } catch (error) {
      console.error('Error deleting purchase:', error);
      handleFirestoreError(error, OperationType.DELETE, `purchases/${purchase.id}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredPurchases = purchases.filter(p => 
    p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
           <p className="text-[10px] font-black text-danger uppercase">Total a Pagar: {formatCurrency(purchases.reduce((acc, p) => acc + p.total, 0))}</p>
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
              className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-danger/10 group-hover:text-danger transition-colors">
                  <Truck className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black bg-danger/10 text-danger px-2 py-1 rounded-lg uppercase tracking-wider">
                  A Pagar
                </span>
              </div>
              
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                   {format(date, "dd MMM yyyy", { locale: ptBR })}
                </p>
                <h3 className="text-sm font-black text-slate-800 line-clamp-1">{purchase.supplierName || 'Fornecedor Avulso'}</h3>
                <div className="pt-2 border-t border-slate-50 mt-2 flex justify-between items-center">
                  <span className="text-lg font-black text-danger">{formatCurrency(purchase.total)}</span>
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{purchase.itemsCount} itens</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFinalize(purchase);
                  }}
                  className="flex-1 py-2 bg-danger text-white text-[10px] font-black rounded-xl shadow-lg shadow-danger/20 transition-all uppercase tracking-widest"
                >
                  Pagar Agora
                </button>
                <Link 
                  to={`/compras/nova?edit=${purchase.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl transition-all hover:text-accent hover:bg-accent/5"
                >
                  <Edit2 className="w-5 h-5" />
                </Link>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(purchase);
                  }}
                  disabled={isProcessing}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl transition-all hover:text-danger hover:bg-danger/5 disabled:opacity-50"
                >
                  <Trash2 className="w-5 h-5" />
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
    </div>
  );
}
