import React, { useEffect, useState } from 'react';
import { 
  Clock, 
  Search, 
  CheckCircle2, 
  User, 
  CreditCard, 
  Receipt, 
  Package, 
  X,
  TrendingUp,
  AlertCircle,
  Loader2,
  Calendar,
  Trash2,
  XCircle
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
  writeBatch,
  getDoc,
  getDocs,
  increment,
  deleteDoc
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Sale } from '@/src/types';
import { formatCurrency, formatDate, cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';
import { format } from 'date-fns';

export default function SalesPending() {
  const { profile } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    customer: '',
    startDate: '',
    endDate: '',
    minValue: '',
    maxValue: '',
    productName: ''
  });

  useEffect(() => {
    const q = query(
      collection(db, 'sales'), 
      where('paymentStatus', '==', 'pending'),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
      setLoading(false);
    }, (error) => {
      console.error("Error fetching pending sales:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const handleFinalize = async (sale: Sale) => {
    if (!profile) return;
    
    const unpaidAmount = sale.installmentsList 
      ? sale.installmentsList.filter(i => i.status === 'pending').reduce((acc, i) => acc + i.amount, 0)
      : sale.total;

    if (!confirm(`Deseja quitar o valor restante de ${formatCurrency(unpaidAmount)} desta venda?`)) return;

    setIsProcessing(true);
    try {
      // 1. Update sale status
      const saleRef = doc(db, 'sales', sale.id);
      const updates: any = {
        paymentStatus: 'paid',
        finalizedAt: new Date().toISOString()
      };

      if (sale.installmentsList) {
        updates.installmentsList = sale.installmentsList.map(i => ({
          ...i,
          status: 'paid',
          paidAt: i.paidAt || new Date().toISOString()
        }));
      }

      await updateDoc(saleRef, updates);

      // 2. Record Financial Movement
      const storeFeePerInstallment = (sale.storeFee || 0) / (sale.installments || 1);
      const netAmount = unpaidAmount - (sale.installmentsList ? 0 : (sale.storeFee || 0)); 
      // If quitting all at once, deduct all remaining store fees if not already accounted? 
      // Actually, keeping it simple: just deduct storeFee if it was single payment, 
      // or handled per installment in manual payments.
      // If finalizing a whole split sale at once, we need to decide how store fees work.
      // Usually store fees are per transaction.

      await addDoc(collection(db, 'cash_movements'), {
        amount: netAmount,
        type: 'in',
        category: 'venda',
        paymentMethod: sale.paymentMethod,
        reason: `Quitação Venda #${sale.id.slice(-4)}`,
        userId: profile.uid,
        userName: profile.name,
        saleId: sale.id,
        timestamp: new Date().toISOString()
      });

      setSelectedSale(null);
      alert('Venda quitada com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao efetivar venda');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayInstallment = async (sale: Sale, installmentId: number) => {
    if (!profile) return;
    const installment = sale.installmentsList?.find(i => i.id === installmentId);
    if (!installment) return;
    
    if (!confirm(`Confirmar o recebimento da parcela ${installmentId} no valor de ${formatCurrency(installment.amount)}?`)) return;

    setIsProcessing(true);
    try {
      const updatedInstallments = sale.installmentsList?.map(i => 
        i.id === installmentId ? { ...i, status: 'paid', paidAt: new Date().toISOString() } : i
      );

      const allPaid = updatedInstallments?.every(i => i.status === 'paid');
      
      const saleRef = doc(db, 'sales', sale.id);
      await updateDoc(saleRef, {
        installmentsList: updatedInstallments,
        paymentStatus: allPaid ? 'paid' : 'pending',
        finalizedAt: allPaid ? new Date().toISOString() : null
      });

      // Record Financial Movement
      // Store fee is usually per installment if it's the gateway fee
      const storeFeePerInstallment = (sale.storeFee || 0) / (sale.installments || 1);
      const netAmount = installment.amount - storeFeePerInstallment;

      await addDoc(collection(db, 'cash_movements'), {
        amount: netAmount,
        type: 'in',
        category: 'venda',
        paymentMethod: sale.paymentMethod,
        reason: `Receb. Parcela ${installmentId}/${sale.installments} Venda #${sale.id.slice(-4)}`,
        userId: profile.uid,
        userName: profile.name,
        saleId: sale.id,
        installmentId: installmentId,
        timestamp: new Date().toISOString()
      });

      if (allPaid) {
        setSelectedSale(null);
        alert('Toda a venda foi quitada!');
      } else {
        setSelectedSale({
          ...sale,
          installmentsList: updatedInstallments,
          paymentStatus: 'pending'
        });
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao processar parcela');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!profile) return;
    if (!confirm(`Deseja cancelar a venda pendente ${sale.id}? Esta ação devolverá os itens ao estoque.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Revert product stock
      for (const item of sale.items) {
        if (!item.productId) continue;
        const productRef = doc(db, 'products', item.productId);
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
          const updateData: any = {
            stock: increment(item.quantity)
          };
          if (item.size) {
            updateData[`sizeStock.${item.size}`] = increment(item.quantity);
          }
          batch.update(productRef, updateData);
        }
      }

      // 2. Delete linked movements (where saleId === sale.id)
      const movementsSnap = await getDocs(query(collection(db, 'movements'), where('saleId', '==', sale.id)));
      movementsSnap.docs.forEach(d => {
        batch.delete(d.ref);
      });

      // 3. Delete linked cash movements (where saleId === sale.id)
      const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('saleId', '==', sale.id)));
      cashMovementsSnap.docs.forEach(d => {
        batch.delete(d.ref);
      });

      // 4. Delete the sale itself
      batch.delete(doc(db, 'sales', sale.id));
      await batch.commit();
      
      setSelectedSale(null);
      alert('Venda cancelada com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Erro ao cancelar venda');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.timestamp);
    const matchesSearch = s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCustomer = !filters.customer || (s.customerName || '').toLowerCase().includes(filters.customer.toLowerCase());
    
    let matchesDate = true;
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && saleDate >= start;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && saleDate <= end;
    }

    const matchesMinVal = !filters.minValue || s.total >= Number(filters.minValue);
    const matchesMaxVal = !filters.maxValue || s.total <= Number(filters.maxValue);
    
    const matchesProduct = !filters.productName || s.items.some(item => 
      item.name.toLowerCase().includes(filters.productName.toLowerCase())
    );

    return matchesSearch && matchesCustomer && matchesDate && matchesMinVal && matchesMaxVal && matchesProduct;
  });

  const clearFilters = () => {
    setFilters({
      customer: '',
      startDate: '',
      endDate: '',
      minValue: '',
      maxValue: '',
      productName: ''
    });
    setSearchTerm('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-danger/5 rounded-xl flex items-center justify-center text-danger">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Vendas a Receber</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase leading-none mt-1">Pendentes de Efetivação</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              showFilters ? "bg-danger text-white" : "bg-white text-slate-400 border border-slate-100"
            )}
          >
            <AlertCircle className="w-4 h-4" />
            {showFilters ? 'Ocultar Filtros' : 'Filtros Avançados'}
          </button>

          <div className="bg-danger/10 px-4 py-2 rounded-xl border border-danger/20 flex items-center gap-2">
             <AlertCircle className="w-4 h-4 text-danger" />
             <p className="text-[10px] font-black text-danger uppercase">Total Pendente: {formatCurrency(sales.reduce((acc, s) => acc + s.total, 0))}</p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-2"
          >
            <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                  <input 
                    type="text"
                    value={filters.customer}
                    onChange={(e) => setFilters({...filters, customer: e.target.value})}
                    placeholder="Nome do cliente..."
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Produto</label>
                  <input 
                    type="text"
                    value={filters.productName}
                    onChange={(e) => setFilters({...filters, productName: e.target.value})}
                    placeholder="Nome do produto..."
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Início</label>
                  <input 
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fim</label>
                  <input 
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Mínimo</label>
                  <input 
                    type="number"
                    value={filters.minValue}
                    onChange={(e) => setFilters({...filters, minValue: e.target.value})}
                    placeholder="R$ 0,00"
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Máximo</label>
                  <input 
                    type="number"
                    value={filters.maxValue}
                    onChange={(e) => setFilters({...filters, maxValue: e.target.value})}
                    placeholder="R$ 9999,99"
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={clearFilters}
                    className="flex items-center justify-center gap-2 w-full h-[40px] bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text"
          placeholder="Buscar venda pendente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-danger/20 transition-all text-xs"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-2">
        {filteredSales.map((sale) => {
          const date = new Date(sale.timestamp);
          return (
            <motion.div
              key={sale.id}
              layoutId={`sale-${sale.id}`}
              onClick={() => setSelectedSale(sale)}
              className="bg-white p-5 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative cursor-pointer"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-danger/10 group-hover:text-danger transition-colors">
                  <Clock className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-black bg-danger/10 text-danger px-2 py-1 rounded-lg uppercase tracking-wider">
                  Pendente
                </span>
              </div>
              
              <div className="space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{formatDate(sale.timestamp)}</p>
                <h3 className="text-sm font-black text-slate-800 line-clamp-1">{sale.customerName || 'Cliente Direto'}</h3>
                <div className="pt-2 border-t border-slate-50 mt-2 flex justify-between items-center">
                  <span className="text-lg font-black text-danger">{formatCurrency(sale.total)}</span>
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">{sale.paymentMethod}</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFinalize(sale);
                  }}
                  className="flex-1 py-2.5 bg-danger text-white text-[10px] font-black rounded-xl shadow-lg shadow-danger/20 transition-all uppercase tracking-widest"
                >
                  Efetivar Agora
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(sale, e);
                  }}
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 text-slate-400 rounded-xl transition-all hover:text-danger hover:bg-danger/5"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredSales.length === 0 && !loading && (
        <div className="py-20 text-center px-4">
          <div className="bg-white p-8 rounded-[40px] border border-dashed border-slate-200 inline-block w-full max-w-sm">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4 opacity-20" />
            <h3 className="text-sm font-bold text-slate-400 uppercase">Tudo em dia!</h3>
            <p className="text-[10px] text-slate-300 font-black tracking-widest mt-1">Nenhuma venda pendente de recebimento</p>
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

              <div className="p-8 pb-4 bg-danger text-white relative">
                 <div className="p-4 bg-white/10 rounded-3xl w-fit mb-4 backdrop-blur-md">
                    <Clock className="w-8 h-8" />
                 </div>
                 <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight">Venda Pendente</h2>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">ID: {selectedSale.id}</p>
                 
                 <div className="mt-6 p-4 bg-white/10 rounded-2xl border border-white/10">
                    <div className="flex justify-between items-center">
                       <span className="text-[10px] font-black uppercase opacity-60">Valor a Receber</span>
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
                      <CreditCard className="w-3 h-3" /> Método Pref.
                    </p>
                    <p className="text-xs font-black text-slate-800 uppercase">{selectedSale.paymentMethod}</p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                    <User className="w-3 h-3" /> Cliente & Transação
                  </p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs items-center">
                       <span className="text-slate-400 font-bold uppercase text-[9px]">Cliente</span>
                       <span className="text-slate-800 font-black">{selectedSale.customerName || 'Não Informado'}</span>
                    </div>
                    {selectedSale.installments && selectedSale.installments > 1 && (
                      <div className="flex justify-between text-xs items-center">
                         <span className="text-slate-400 font-bold uppercase text-[9px]">Parcelamento</span>
                         <span className="text-slate-800 font-black">{selectedSale.installments}x</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs items-center">
                       <span className="text-slate-400 font-bold uppercase text-[9px]">Status PGTO</span>
                       <span className="text-danger font-black uppercase text-[10px]">Pendente</span>
                    </div>
                  </div>
                </div>

                {selectedSale.installmentsList && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                      <CreditCard className="w-3 h-3" /> Parcelas ({selectedSale.installments})
                    </p>
                    <div className="space-y-2">
                      {selectedSale.installmentsList.map((inst) => (
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
                                handlePayInstallment(selectedSale, inst.id);
                              }}
                              className="px-3 py-1.5 bg-danger text-white text-[9px] font-black rounded-lg shadow-md shadow-danger/10 uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                            >
                              Receber
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-[8px] font-black uppercase">Pago</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1 px-1">
                    <Package className="w-3 h-3" /> Itens na Venda ({selectedSale.items.reduce((acc, i) => acc + i.quantity, 0)})
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

              <div className="p-8 pt-0 flex gap-3">
                <button 
                  onClick={(e) => selectedSale && handleDelete(selectedSale, e)}
                  disabled={isProcessing}
                  className="w-16 h-16 bg-slate-100 text-slate-400 font-black rounded-3xl flex items-center justify-center hover:bg-danger/10 hover:text-danger transition-all active:scale-95 shadow-sm"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => handleFinalize(selectedSale)}
                  disabled={isProcessing}
                  className="flex-1 h-16 bg-danger text-white font-black rounded-3xl flex items-center justify-center text-sm shadow-xl shadow-danger/20 hover:scale-[1.02] transition-transform uppercase disabled:opacity-50"
                >
                  {isProcessing && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
                  Efetivar Recebimento
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
