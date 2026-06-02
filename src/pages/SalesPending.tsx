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
  XCircle,
  Edit2,
  Save
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
import { Sale, Product, SaleItem } from '@/src/types';
import { formatCurrency, formatDate, cn, getBrasiliaISO, getBrasiliaTime, sanitizeForFirestore } from '@/src/lib/utils';
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

  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editForm, setEditForm] = useState({
    timestamp: '',
    customerName: '',
    paymentMethod: '' as any,
    paymentStatus: '' as any,
    total: 0,
    items: [] as SaleItem[]
  });

  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [selectedProdForAdd, setSelectedProdForAddState] = useState<Product | null>(null);
  const [selectedSizeForAdd, setSelectedSizeForAdd] = useState<string>('');
  const [addQty, setAddQty] = useState<number>(1);
  const [addPrice, setAddPrice] = useState<number>(0);
  const [prodSearch, setProdSearch] = useState<string>('');

  const setSelectedProdForAdd = (prod: Product | null) => {
    setSelectedProdForAddState(prod);
    if (prod) {
      setAddPrice(prod.salePrice || 0);
    }
  };

  const handleStartEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditForm({
      timestamp: sale.timestamp.slice(0, 16), // datetime-local format
      customerName: sale.customerName || '',
      paymentMethod: sale.paymentMethod,
      paymentStatus: sale.paymentStatus,
      total: sale.total,
      items: JSON.parse(JSON.stringify(sale.items || []))
    });
  };

  const handleUpdateSale = async () => {
    if (!editingSale) return;
    try {
      setIsProcessing(true);

      // 1. Revert original items' stock levels
      for (const item of (editingSale.items || [])) {
        if (!item.productId) continue;
        const productRef = doc(db, 'products', item.productId);
        const updateData: any = {
          stock: increment(item.quantity)
        };
        if (item.size) {
          updateData[`sizeStock.${item.size}`] = increment(item.quantity);
        }
        await updateDoc(productRef, updateData);
      }

      // 2. Deduct new items' stock levels
      for (const item of (editForm.items || [])) {
        if (!item.productId) continue;
        const productRef = doc(db, 'products', item.productId);
        const updateData: any = {
          stock: increment(-item.quantity)
        };
        if (item.size) {
          updateData[`sizeStock.${item.size}`] = increment(-item.quantity);
        }
        await updateDoc(productRef, updateData);
      }

      const saleRef = doc(db, 'sales', editingSale.id);
      const newSubtotal = (editForm.items || []).reduce((acc, i) => acc + i.total, 0);
      const updateData = {
        timestamp: new Date(editForm.timestamp).toISOString(),
        customerName: editForm.customerName,
        paymentMethod: editForm.paymentMethod,
        paymentStatus: editForm.paymentStatus,
        total: editForm.total,
        subtotal: newSubtotal,
        items: editForm.items
      };

      await updateDoc(saleRef, sanitizeForFirestore(updateData));

      // Update linked cash movements if they exist
      const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), where('saleId', '==', editingSale.id)));
      for (const d of cashMovementsSnap.docs) {
        await updateDoc(d.ref, {
          amount: editForm.total,
          paymentMethod: editForm.paymentMethod,
          timestamp: new Date(editForm.timestamp).toISOString()
        });
      }

      alert('Venda atualizada com sucesso!');
      setEditingSale(null);
      setSelectedSale(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar venda');
    } finally {
      setIsProcessing(false);
    }
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const requestConfirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar'
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      description,
      onConfirm,
      confirmText,
      cancelText
    });
  };

  useEffect(() => {
    const q = query(
      collection(db, 'sales'), 
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribeSales = onSnapshot(q, (snapshot) => {
      const allSales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      const pendingSales = allSales.filter(s => s.paymentStatus === 'pending' || s.paymentStatus2 === 'pending');
      setSales(pendingSales);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching pending sales:", error);
      setLoading(false);
    });

    const qP = query(collection(db, 'products'));
    const unsubscribeProducts = onSnapshot(qP, (snapshot) => {
      setDbProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });
    
    return () => {
      unsubscribeSales();
      unsubscribeProducts();
    };
  }, []);

  const handleFinalize = async (sale: Sale) => {
    if (!profile) return;
    
    let unpaidAmount = 0;
    if (sale.installmentsList) {
      unpaidAmount = sale.installmentsList.filter(i => i.status === 'pending').reduce((acc, i) => acc + i.amount, 0);
    } else if (sale.isSplitPayment) {
      if (sale.paymentStatus === 'pending') {
        unpaidAmount += (sale.splitAmount1 || 0);
      }
      if (sale.paymentStatus2 === 'pending') {
        unpaidAmount += (sale.splitAmount2 || 0);
      }
    } else {
      unpaidAmount = sale.total;
    }

    requestConfirm(
      'Efetivar Recebimento',
      `Deseja quitar o valor restante de ${formatCurrency(unpaidAmount)} desta venda?`,
      async () => {
        setIsProcessing(true);
        try {
          // 1. Update sale status
          const saleRef = doc(db, 'sales', sale.id);
          const updates: any = {
            paymentStatus: 'paid',
            finalizedAt: getBrasiliaISO()
          };

          if (sale.isSplitPayment || sale.paymentStatus2) {
            updates.paymentStatus2 = 'paid';
          }

          if (sale.installmentsList) {
            updates.installmentsList = sale.installmentsList.map(i => ({
              ...i,
              status: 'paid',
              paidAt: i.paidAt || getBrasiliaISO()
            }));
          }

          await updateDoc(saleRef, updates);

          // 2. Record Financial Movement(s)
          if (sale.installmentsList) {
            const pendingInstallments = sale.installmentsList.filter(i => i.status === 'pending');
            for (const inst of pendingInstallments) {
              let instPaymentMethod = sale.paymentMethod;
              let instStoreFee = sale.storeFee || 0;
              let instInstallments = sale.installments || 1;

              if (sale.isSplitPayment) {
                if (sale.paymentStatus2 === 'pending' && sale.paymentStatus === 'paid') {
                  instPaymentMethod = sale.paymentMethod2 || sale.paymentMethod;
                  instStoreFee = sale.storeFee2 || 0;
                  instInstallments = sale.installments2 || 1;
                } else if (sale.paymentStatus === 'pending' && sale.paymentStatus2 === 'pending') {
                  if (inst.id > (sale.installments || 0)) {
                    instPaymentMethod = sale.paymentMethod2 || sale.paymentMethod;
                    instStoreFee = sale.storeFee2 || 0;
                    instInstallments = sale.installments2 || 1;
                  }
                }
              }

              const storeFeePerInstallment = instStoreFee / instInstallments;
              const netAmount = inst.amount - storeFeePerInstallment;

              await addDoc(collection(db, 'cash_movements'), {
                amount: netAmount,
                type: 'in',
                category: 'venda',
                paymentMethod: instPaymentMethod,
                reason: `Receb. Parcela ${inst.id} Venda #${sale.id.slice(-4)} (Efetivada)`,
                userId: profile.uid,
                userName: profile.name,
                saleId: sale.id,
                installmentId: inst.id,
                timestamp: getBrasiliaISO()
              });
            }
          } else if (sale.isSplitPayment) {
            if (sale.paymentStatus === 'pending') {
              const amount1 = sale.splitAmount1 || 0;
              const netAmount1 = amount1 - (sale.storeFee || 0);
              await addDoc(collection(db, 'cash_movements'), {
                amount: netAmount1,
                type: 'in',
                category: 'venda',
                paymentMethod: sale.paymentMethod,
                reason: `Quitação Venda #${sale.id.slice(-4)} (Parte 1/2 - ${(sale.paymentMethod || '').toUpperCase()})`,
                userId: profile.uid,
                userName: profile.name,
                saleId: sale.id,
                timestamp: getBrasiliaISO()
              });
            }
            if (sale.paymentStatus2 === 'pending') {
              const amount2 = sale.splitAmount2 || 0;
              const netAmount2 = amount2 - (sale.storeFee2 || 0);
              await addDoc(collection(db, 'cash_movements'), {
                amount: netAmount2,
                type: 'in',
                category: 'venda',
                paymentMethod: sale.paymentMethod2 || '',
                reason: `Quitação Venda #${sale.id.slice(-4)} (Parte 2/2 - ${(sale.paymentMethod2 || '').toUpperCase()})`,
                userId: profile.uid,
                userName: profile.name,
                saleId: sale.id,
                timestamp: getBrasiliaISO()
              });
            }
          } else {
            const netAmount = sale.total - (sale.storeFee || 0);
            await addDoc(collection(db, 'cash_movements'), {
              amount: netAmount,
              type: 'in',
              category: 'venda',
              paymentMethod: sale.paymentMethod,
              reason: `Quitação Venda #${sale.id.slice(-4)}`,
              userId: profile.uid,
              userName: profile.name,
              saleId: sale.id,
              timestamp: getBrasiliaISO()
            });
          }

          setSelectedSale(null);
          alert('Venda quitada com sucesso!');
        } catch (error) {
          console.error(error);
          alert('Erro ao efetivar venda');
        } finally {
          setIsProcessing(false);
        }
      },
      'Sim, Efetivar',
      'Cancelar'
    );
  };

  const handlePayInstallment = async (sale: Sale, installmentId: number) => {
    if (!profile) return;
    const installment = sale.installmentsList?.find(i => i.id === installmentId);
    if (!installment) return;
    
    requestConfirm(
      'Receber Parcela',
      `Confirmar o recebimento da parcela ${installmentId} no valor de ${formatCurrency(installment.amount)}?`,
      async () => {
        setIsProcessing(true);
        try {
          const updatedInstallments = sale.installmentsList?.map(i => 
            i.id === installmentId ? { ...i, status: 'paid', paidAt: getBrasiliaISO() } : i
          );

          const allPaid = updatedInstallments?.every(i => i.status === 'paid');
          
          const saleRef = doc(db, 'sales', sale.id);
          const updates: any = {
            installmentsList: updatedInstallments,
            paymentStatus: allPaid ? 'paid' : 'pending',
            finalizedAt: allPaid ? getBrasiliaISO() : null
          };

          if (allPaid && (sale.isSplitPayment || sale.paymentStatus2)) {
            updates.paymentStatus2 = 'paid';
          }

          await updateDoc(saleRef, updates);

          // Record Financial Movement
          let instPaymentMethod = sale.paymentMethod;
          let instStoreFee = sale.storeFee || 0;
          let instInstallments = sale.installments || 1;

          if (sale.isSplitPayment) {
            if (sale.paymentStatus2 === 'pending' && sale.paymentStatus === 'paid') {
              instPaymentMethod = sale.paymentMethod2 || sale.paymentMethod;
              instStoreFee = sale.storeFee2 || 0;
              instInstallments = sale.installments2 || 1;
            } else if (sale.paymentStatus === 'pending' && sale.paymentStatus2 === 'pending') {
              if (installmentId > (sale.installments || 0)) {
                instPaymentMethod = sale.paymentMethod2 || sale.paymentMethod;
                instStoreFee = sale.storeFee2 || 0;
                instInstallments = sale.installments2 || 1;
              }
            }
          }

          const storeFeePerInstallment = instStoreFee / instInstallments;
          const netAmount = installment.amount - storeFeePerInstallment;

          const totalInst = sale.isSplitPayment && installmentId > (sale.installments || 0)
            ? (sale.installments2 || 1)
            : (sale.installments || 1);
          const displayInstId = sale.isSplitPayment && installmentId > (sale.installments || 0)
            ? (installmentId - (sale.installments || 0))
            : installmentId;

          await addDoc(collection(db, 'cash_movements'), {
            amount: netAmount,
            type: 'in',
            category: 'venda',
            paymentMethod: instPaymentMethod,
            reason: `Receb. Parcela ${displayInstId}/${totalInst} Venda #${sale.id.slice(-4)}`,
            userId: profile.uid,
            userName: profile.name,
            saleId: sale.id,
            installmentId: installmentId,
            timestamp: getBrasiliaISO()
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
      },
      'Sim, Confirmar',
      'Cancelar'
    );
  };

  const handleDelete = async (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!profile) return;
    
    requestConfirm(
      'Cancelar Venda',
      `Deseja realmente cancelar a venda pendente ${sale.id}? Esta ação devolverá os itens ao estoque e é irreversível.`,
      async () => {
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
      },
      'Sim, Excluir',
      'Cancelar'
    );
  };

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.timestamp);
    const matchesSearch = s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCustomer = !filters.customer || (s.customerName || '').toLowerCase().includes(filters.customer.toLowerCase());
    
    let matchesDate = true;
    if (filters.startDate) {
      const start = getBrasiliaTime();
      const [y, m, d] = filters.startDate.split('-').map(Number);
      start.setFullYear(y, m - 1, d);
      start.setHours(0, 0, 0, 0);
      matchesDate = matchesDate && saleDate >= start;
    }
    if (filters.endDate) {
      const end = getBrasiliaTime();
      const [y, m, d] = filters.endDate.split('-').map(Number);
      end.setFullYear(y, m - 1, d);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && saleDate <= end;
    }

    const pendingAmountTotal = (s.paymentStatus === 'pending' ? (s.splitAmount1 || s.total) : 0) + (s.paymentStatus2 === 'pending' ? (s.splitAmount2 || 0) : 0);

    const matchesMinVal = !filters.minValue || pendingAmountTotal >= Number(filters.minValue);
    const matchesMaxVal = !filters.maxValue || pendingAmountTotal <= Number(filters.maxValue);
    
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

  const getParsedDate = (ts: any): Date => {
    if (!ts) return new Date();
    if (typeof ts.toDate === 'function') return ts.toDate();
    return new Date(ts);
  };

  const groupSalesByDate = (salesList: Sale[]) => {
    const groups: { [key: string]: Sale[] } = {};
    salesList.forEach(sale => {
      const dateObj = getParsedDate(sale.timestamp);
      const dateKey = dateObj.toLocaleDateString('pt-BR');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(sale);
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
             <p className="text-[10px] font-black text-danger uppercase">Total Pendente: {formatCurrency(sales.reduce((acc, s) => {
               const amt = (s.paymentStatus === 'pending' ? (s.splitAmount1 || s.total) : 0) + (s.paymentStatus2 === 'pending' ? (s.splitAmount2 || 0) : 0);
               return acc + amt;
             }, 0))}</p>
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

      <div className="space-y-8 px-2">
        {groupSalesByDate(filteredSales).map(({ dateKey, items }) => (
          <div key={dateKey} className="space-y-3 break-before-page print:break-before-page">
            <div className="flex items-center gap-4 my-2">
              <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1 rounded-full uppercase tracking-widest border border-slate-100 flex items-center gap-1.5 shadow-sm">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {dateKey}
              </span>
              <div className="h-px bg-slate-100 flex-1" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((sale) => {
                const date = getParsedDate(sale.timestamp);
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
                        <span className="text-lg font-black text-danger">
                          {formatCurrency(
                            (sale.paymentStatus === 'pending' ? (sale.splitAmount1 || sale.total) : 0) + 
                            (sale.paymentStatus2 === 'pending' ? (sale.splitAmount2 || 0) : 0)
                          )}
                        </span>
                        <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                          {sale.isSplitPayment ? (
                            <>
                              {sale.paymentStatus === 'pending' && sale.paymentMethod}
                              {sale.paymentStatus === 'pending' && sale.paymentStatus2 === 'pending' && ' + '}
                              {sale.paymentStatus2 === 'pending' && sale.paymentMethod2}
                            </>
                          ) : sale.paymentMethod}
                        </span>
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
                        Efetivar Recebimento
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
          </div>
        ))}
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
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-y-auto relative z-10 max-h-[90vh]"
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

              <div className="p-8 space-y-6">
                {editingSale ? (
                  <div className="space-y-4">
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data e Hora</label>
                      <input 
                        type="datetime-local"
                        value={editForm.timestamp}
                        onChange={(e) => setEditForm({...editForm, timestamp: e.target.value})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                      />
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                      <input 
                        type="text"
                        value={editForm.customerName}
                        onChange={(e) => setEditForm({...editForm, customerName: e.target.value})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Método</label>
                        <select 
                          value={editForm.paymentMethod}
                          onChange={(e) => setEditForm({...editForm, paymentMethod: e.target.value as any})}
                          className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                        >
                          <option value="dinheiro">Dinheiro</option>
                          <option value="pix">PIX</option>
                          <option value="cartão">Cartão</option>
                          <option value="transferência">Transferência</option>
                        </select>
                      </div>
                      <div className="space-y-1 text-left">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                        <select 
                          value={editForm.paymentStatus}
                          onChange={(e) => setEditForm({...editForm, paymentStatus: e.target.value as any})}
                          className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10"
                        >
                          <option value="paid">Recebido</option>
                          <option value="pending">A Receber</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1 text-left">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Total (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={editForm.total}
                        onChange={(e) => setEditForm({...editForm, total: Number(e.target.value)})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-danger/10 text-accent font-sans"
                      />
                    </div>

                    {/* Items Edition Section */}
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 text-left">
                        Itens da Venda ({editForm.items.reduce((acc, i) => acc + i.quantity, 0)})
                      </p>
                      
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {editForm.items.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="min-w-0 flex-1 mr-2 text-left">
                              <p className="font-bold text-slate-800 text-[11px] leading-tight uppercase truncate">
                                {item.name} {item.size ? `(${item.size})` : ''}
                              </p>
                              <p className="text-[9px] text-slate-400 font-bold mt-0.5">
                                {formatCurrency(item.price)}/un
                              </p>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* Quantity inputs/buttons */}
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = [...editForm.items];
                                  if (newItems[idx].quantity > 1) {
                                    newItems[idx].quantity -= 1;
                                    newItems[idx].total = newItems[idx].quantity * newItems[idx].price;
                                    const newTotal = newItems.reduce((acc, i) => acc + i.total, 0);
                                    setEditForm({ ...editForm, items: newItems, total: newTotal });
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-150 text-xs font-bold"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold text-slate-800 w-4 text-center font-sans">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = [...editForm.items];
                                  newItems[idx].quantity += 1;
                                  newItems[idx].total = newItems[idx].quantity * newItems[idx].price;
                                  const newTotal = newItems.reduce((acc, i) => acc + i.total, 0);
                                  setEditForm({ ...editForm, items: newItems, total: newTotal });
                                }}
                                className="w-6 h-6 flex items-center justify-center bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-150 text-xs font-bold"
                              >
                                +
                              </button>
                              
                              <button
                                type="button"
                                onClick={() => {
                                  const newItems = editForm.items.filter((_, i) => i !== idx);
                                  const newTotal = newItems.reduce((acc, i) => acc + i.total, 0);
                                  setEditForm({ ...editForm, items: newItems, total: newTotal });
                                }}
                                className="p-1 px-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors text-[10px] font-bold uppercase"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        ))}
                        {editForm.items.length === 0 && (
                          <p className="text-[10px] font-bold text-slate-400 italic text-center py-2">
                            Nenhum item na venda. Adicione produtos abaixo.
                          </p>
                        )}
                      </div>

                      {/* Add Product Sub-interface */}
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-3 mt-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none text-left font-black">
                          Adicionar Novo Produto
                        </p>
                        <div className="space-y-2 relative text-left">
                          <input 
                            type="text"
                            placeholder="Buscar produto..."
                            value={prodSearch}
                            onChange={(e) => setProdSearch(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-danger/20"
                          />
                          {prodSearch.trim() !== '' && (
                            <div className="absolute left-0 right-0 z-30 bg-white border border-slate-150 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 shadow-xl mt-1">
                              {dbProducts
                                .filter(p => 
                                  p.name.toLowerCase().includes(prodSearch.toLowerCase()) || 
                                  (p.sku && p.sku.toLowerCase().includes(prodSearch.toLowerCase()))
                                )
                                .slice(0, 5)
                                .map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedProdForAdd(p);
                                      setProdSearch('');
                                      if (p.sizes && p.sizes.length > 0) {
                                        setSelectedSizeForAdd(p.sizes[0]);
                                      } else if (p.sizeStock && Object.keys(p.sizeStock).length > 0) {
                                        setSelectedSizeForAdd(Object.keys(p.sizeStock)[0]);
                                      } else {
                                        setSelectedSizeForAdd('');
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 block uppercase text-slate-700"
                                  >
                                    {p.name} - {formatCurrency(p.salePrice)}
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>

                        {selectedProdForAdd && (
                          <div className="bg-white p-3 rounded-xl border border-slate-150 space-y-2">
                            <div className="flex justify-between items-center text-left">
                              <span className="text-[11px] font-black text-primary uppercase truncate max-w-[150px]">
                                {selectedProdForAdd.name}
                              </span>
                              <button 
                                onClick={() => setSelectedProdForAdd(null)}
                                className="text-slate-400 hover:text-danger"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Size selector if product has sizes */}
                            {((selectedProdForAdd.sizes && selectedProdForAdd.sizes.length > 0) || 
                              (selectedProdForAdd.sizeStock && Object.keys(selectedProdForAdd.sizeStock || {}).length > 0)) && (
                              <div className="space-y-1 text-left">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tamanho</label>
                                <div className="flex flex-wrap gap-1">
                                  {(selectedProdForAdd.sizes || Object.keys(selectedProdForAdd.sizeStock || {})).map(s => (
                                    <button
                                      key={s}
                                      type="button"
                                      onClick={() => setSelectedSizeForAdd(s)}
                                      className={cn(
                                        "px-2 py-0.5 text-[9px] font-black rounded border uppercase transition-all",
                                        selectedSizeForAdd === s 
                                          ? "bg-slate-900 text-white border-slate-900" 
                                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                                      )}
                                    >
                                      {s}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Qty and Price and OK buttons */}
                            <div className="flex gap-2 items-center text-left">
                              <div className="flex-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preço Un.</label>
                                <input 
                                  type="number"
                                  step="0.01"
                                  value={addPrice}
                                  onChange={(e) => setAddPrice(Number(e.target.value))}
                                  className="w-full bg-slate-50 border-none rounded-xl px-2 py-1 text-xs font-bold outline-none"
                                />
                              </div>
                              <div className="w-16">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Qtd</label>
                                <input 
                                  type="number"
                                  min="1"
                                  value={addQty}
                                  onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                                  className="w-full bg-slate-50 border-none rounded-xl px-2 py-1 text-xs font-bold outline-none text-center font-sans"
                                />
                              </div>
                              <div className="flex items-end h-full pt-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newItem: SaleItem = {
                                      productId: selectedProdForAdd.id,
                                      sku: selectedProdForAdd.sku || '',
                                      size: selectedSizeForAdd || undefined,
                                      name: selectedProdForAdd.name,
                                      price: addPrice,
                                      costPrice: selectedProdForAdd.costPrice || 0,
                                      quantity: addQty,
                                      total: addPrice * addQty
                                    };
                                    const newItems = [...editForm.items, newItem];
                                    const newTotal = newItems.reduce((acc, i) => acc + i.total, 0);
                                    setEditForm({ ...editForm, items: newItems, total: newTotal });
                                    setSelectedProdForAdd(null);
                                    setSelectedSizeForAdd('');
                                    setAddQty(1);
                                  }}
                                  className="px-3 py-1.5 bg-success text-white text-[10px] font-black rounded-lg uppercase tracking-wider shadow-sm hover:brightness-105"
                                >
                                  ADD
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
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
                        <div className="text-[10px] font-black text-slate-800 uppercase leading-tight">
                          {selectedSale.isSplitPayment ? (
                            <>
                              <div className="flex justify-between items-center">
                                <span>
                                  {selectedSale.paymentMethod}: {formatCurrency(selectedSale.splitAmount1 || 0)}
                                </span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                                  selectedSale.paymentStatus === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                                )}>
                                  {selectedSale.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}
                                </span>
                              </div>
                              <div className="mt-1 flex justify-between items-center">
                                <span>
                                  {selectedSale.paymentMethod2}: {formatCurrency(selectedSale.splitAmount2 || 0)}
                                </span>
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                                  selectedSale.paymentStatus2 === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                                )}>
                                  {selectedSale.paymentStatus2 === 'paid' ? 'PAGO' : 'PENDENTE'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between items-center">
                              <span>{selectedSale.paymentMethod}</span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                                selectedSale.paymentStatus === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                              )}>
                                {selectedSale.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}
                              </span>
                            </div>
                          )}
                        </div>
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
                  </>
                )}
              </div>

              <div className="p-8 pt-0 pb-8 flex gap-2">
                {editingSale ? (
                  <div className="flex gap-3 w-full animate-fade-in">
                    <button 
                      onClick={handleUpdateSale}
                      disabled={isProcessing}
                      className="flex-1 h-14 bg-success text-white font-black rounded-2xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-success/20 hover:scale-[1.02] transition-transform uppercase cursor-pointer"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar Alterações
                    </button>
                    <button 
                      onClick={() => setEditingSale(null)}
                      className="flex-1 h-14 bg-slate-100 text-slate-600 font-black rounded-2xl text-xs uppercase"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={(e) => selectedSale && handleDelete(selectedSale, e)}
                      disabled={isProcessing}
                      className="w-14 h-14 bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-sm shrink-0 cursor-pointer"
                      title="Excluir Venda"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleStartEdit(selectedSale)}
                      disabled={isProcessing}
                      className="w-14 h-14 bg-accent/10 text-accent hover:bg-accent hover:text-white rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-sm shrink-0 cursor-pointer"
                      title="Editar Venda"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => handleFinalize(selectedSale)}
                      disabled={isProcessing}
                      className="flex-1 h-14 bg-danger text-white font-black rounded-2xl flex items-center justify-center text-xs shadow-lg shadow-danger/20 hover:scale-[1.02] transition-transform uppercase disabled:opacity-50 cursor-pointer"
                    >
                      {isProcessing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                      Efetivar Recebimento
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Dialog Modal */}
      <AnimatePresence>
        {confirmDialog && confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] p-6 shadow-2xl relative z-10 w-full max-w-sm border border-slate-100"
            >
              <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-800 title-case">{confirmDialog.title}</h3>
              <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">{confirmDialog.description}</p>
              
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  {confirmDialog.cancelText || 'Cancelar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="flex-1 py-3 bg-danger text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-lg shadow-danger/25 hover:opacity-90 transition-opacity"
                >
                  {confirmDialog.confirmText || 'Confirmar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
