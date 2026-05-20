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
  Lock,
  Loader2,
  Save,
  FileDown,
  ShoppingCart as ShoppingCartIcon
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
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
  getDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Sale } from '@/src/types';
import { formatCurrency, formatDate, cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';

export default function SalesHistory() {
  const { isAdmin, profile, verifyPassword } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  
  // Password Verification State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

  const [editForm, setEditForm] = useState({
    timestamp: '',
    customerName: '',
    paymentMethod: '' as any,
    paymentStatus: '' as any,
    total: 0
  });

  const handleStartEdit = (sale: Sale) => {
    const action = () => {
      setEditingSale(sale);
      setEditForm({
        timestamp: sale.timestamp.slice(0, 16), // datetime-local format
        customerName: sale.customerName || '',
        paymentMethod: sale.paymentMethod,
        paymentStatus: sale.paymentStatus,
        total: sale.total
      });
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

  const handleUpdateSale = async () => {
    if (!editingSale) return;
    try {
      setLoading(true);
      const saleRef = doc(db, 'sales', editingSale.id);
      const updateData = {
        timestamp: new Date(editForm.timestamp).toISOString(),
        customerName: editForm.customerName,
        paymentMethod: editForm.paymentMethod,
        paymentStatus: editForm.paymentStatus,
        total: editForm.total
      };

      await updateDoc(saleRef, updateData);

      // Update linked cash movements
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
      setLoading(false);
    }
  };
  const [searchTerm, setSearchTerm] = useState('');
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
    const q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (sale: Sale, e?: React.MouseEvent) => {
    e?.stopPropagation();

    const action = async () => {
      if (!profile) return;
      
      try {
        setLoading(true);
        const batch = writeBatch(db);
        
        // 1. Revert product stock
        for (const item of sale.items) {
          if (!item.productId) continue;

          const productRef = doc(db, 'products', item.productId);
          try {
            const productSnap = await getDoc(productRef);
            if (productSnap.exists()) {
              const updateData: any = {
                stock: increment(item.quantity)
              };

              // Revert size stock if applicable
              if (item.size) {
                updateData[`sizeStock.${item.size}`] = increment(item.quantity);
              }

              batch.update(productRef, updateData);
            }
          } catch (e) {
            console.warn(`Erro ao buscar produto ${item.productId}:`, e);
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
        alert('Venda excluída e estoque estornado com sucesso!');
        setSelectedSale(null);
      } catch (err: any) {
        console.error('ERRO AO EXCLUIR VENDA:', err);
        alert('Erro ao excluir venda: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    if (isAdmin) {
      setPendingAction(() => action);
      setShowPasswordPrompt(true);
    } else {
      alert('Acesso restrito a administradores');
    }
  };

  const handleDownloadPDF = async (sale: Sale) => {
    const element = document.getElementById(`receipt-to-print`);
    if (!element) {
      alert('Selecione uma venda primeiro');
      return;
    }
    
    try {
      setLoading(true);
      // Wait a bit for images to load if any
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const canvas = await html2canvas(element, {
        scale: 3, // Higher scale for better quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      // Center the receipt on the A4 page if it's small, or stay at top if long
      const xOffset = 0;
      const yOffset = 0;
      
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, pdfWidth, Math.min(pdfHeight, 297));
      pdf.save(`comprovante-venda-${sale.id.slice(-6)}.pdf`);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar PDF. Verifique se o navegador suporta esta função.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const filteredSales = sales.filter(s => {
    const saleDate = new Date(s.timestamp);
    const matchesSearch = s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.userName || '').toLowerCase().includes(searchTerm.toLowerCase());
    
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
      item.name.toLowerCase().includes(filters.productName.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(filters.productName.toLowerCase()))
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
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <ShoppingCartIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Vendas Recebidas</h1>
            <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase leading-none mt-1">Histórico & Movimentações</p>
          </div>
        </div>
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            showFilters ? "bg-primary text-white" : "bg-white text-slate-400 border border-slate-100"
          )}
        >
          <Receipt className="w-4 h-4" />
          {showFilters ? 'Ocultar Filtros' : 'Filtros Avançados'}
        </button>
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
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Produto</label>
                  <input 
                    type="text"
                    value={filters.productName}
                    onChange={(e) => setFilters({...filters, productName: e.target.value})}
                    placeholder="Nome do produto..."
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Início</label>
                  <input 
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Fim</label>
                  <input 
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
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
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Máximo</label>
                  <input 
                    type="number"
                    value={filters.maxValue}
                    onChange={(e) => setFilters({...filters, maxValue: e.target.value})}
                    placeholder="R$ 9999,99"
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
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
                  <div className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                    sale.paymentStatus === 'pending' ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                  )}>
                    {sale.paymentStatus === 'pending' ? 'A Receber' : 'Recebido'}
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(sale, e);
                    }}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
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
                  <span className="text-[10px] font-black text-accent">
                    {formatCurrency(
                      (sale.paymentStatus === 'paid' ? (sale.splitAmount1 || sale.total) : 0) + 
                      (sale.paymentStatus2 === 'paid' ? (sale.splitAmount2 || 0) : 0)
                    )}
                  </span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase">
                    {sale.isSplitPayment ? (
                      <>
                        {sale.paymentStatus === 'paid' && sale.paymentMethod}
                        {sale.paymentStatus === 'paid' && sale.paymentStatus2 === 'paid' && ' + '}
                        {sale.paymentStatus2 === 'paid' && sale.paymentMethod2}
                        {(sale.paymentStatus === 'pending' && sale.paymentStatus2 === 'pending') && 'Pendente'}
                      </>
                    ) : (sale.paymentStatus === 'paid' ? sale.paymentMethod : 'Pendente')}
                  </span>
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
              {/* Printable Receipt Content */}
              <div id="printable-receipt" className="print:block fixed left-[-9999px] top-0 print:left-0 print:inset-0 print:z-[100] print:bg-white opacity-0 pointer-events-none print:opacity-100 print:pointer-events-auto">
                <div id="receipt-to-print" className="p-8 max-w-sm mx-auto bg-white">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
                      <Receipt className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-black uppercase tracking-tighter">Comprovante de Venda</h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Nº: {selectedSale.id}</p>
                  </div>

                  <div className="border-t border-b border-dashed border-slate-200 py-4 mb-4">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <span>Data</span>
                      <span>{formatDate(selectedSale.timestamp)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      <span>Método</span>
                      <span>
                        {selectedSale.isSplitPayment 
                          ? `${selectedSale.paymentMethod} (${formatCurrency(selectedSale.splitAmount1 || 0)}${selectedSale.installments && selectedSale.installments > 1 ? ` ${selectedSale.installments}x` : ''}) + ${selectedSale.paymentMethod2} (${formatCurrency(selectedSale.splitAmount2 || 0)}${selectedSale.installments2 && selectedSale.installments2 > 1 ? ` ${selectedSale.installments2}x` : ''})`
                          : `${selectedSale.paymentMethod}${selectedSale.installments && selectedSale.installments > 1 ? ` ${selectedSale.installments}x` : ''}`
                        }
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      <span>Vendedor</span>
                      <span>{selectedSale.userName}</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      <span>Cliente</span>
                      <span>{selectedSale.customerName || 'Não Informado'}</span>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {selectedSale.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start">
                        <div className="max-w-[70%]">
                          <p className="font-black text-[11px] uppercase leading-tight">{item.name}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{item.quantity}un x {formatCurrency(item.price)}</p>
                        </div>
                        <p className="font-black text-xs">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-900 pt-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold uppercase text-slate-400">Total da Venda</span>
                      <span className="text-xl font-black text-slate-900">{formatCurrency(selectedSale.total)}</span>
                    </div>
                    <p className="text-[8px] font-bold text-slate-400 text-center mt-6 uppercase tracking-widest italic">Obrigado pela preferência!</p>
                  </div>
                </div>
              </div>

              <div className="absolute top-5 right-5 z-20 no-print">
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
                {editingSale ? (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Data e Hora</label>
                      <input 
                        type="datetime-local"
                        value={editForm.timestamp}
                        onChange={(e) => setEditForm({...editForm, timestamp: e.target.value})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                      <input 
                        type="text"
                        value={editForm.customerName}
                        onChange={(e) => setEditForm({...editForm, customerName: e.target.value})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Método</label>
                        <select 
                          value={editForm.paymentMethod}
                          onChange={(e) => setEditForm({...editForm, paymentMethod: e.target.value as any})}
                          className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                        >
                          <option value="dinheiro">Dinheiro</option>
                          <option value="pix">PIX</option>
                          <option value="cartão">Cartão</option>
                          <option value="transferência">Transferência</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status</label>
                        <select 
                          value={editForm.paymentStatus}
                          onChange={(e) => setEditForm({...editForm, paymentStatus: e.target.value as any})}
                          className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10"
                        >
                          <option value="paid">Recebido</option>
                          <option value="pending">A Receber</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Total (R$)</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={editForm.total}
                        onChange={(e) => setEditForm({...editForm, total: Number(e.target.value)})}
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/10 text-accent"
                      />
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
                          <CreditCard className="w-3 h-3" /> Método
                        </p>
                        <p className="text-[10px] font-black text-slate-800 uppercase leading-tight">
                          {selectedSale.isSplitPayment ? (
                            <>
                              <div className="flex justify-between items-center">
                                <span>
                                  {selectedSale.paymentMethod}: {formatCurrency(selectedSale.splitAmount1 || 0)}
                                  {selectedSale.installments && selectedSale.installments > 1 && ` (${selectedSale.installments}x)`}
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
                                  {selectedSale.installments2 && selectedSale.installments2 > 1 && ` (${selectedSale.installments2}x)`}
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
                              <span>
                                {selectedSale.paymentMethod}
                                {selectedSale.installments && selectedSale.installments > 1 && ` (${selectedSale.installments}x)`}
                              </span>
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-full text-[8px] ml-2",
                                selectedSale.paymentStatus === 'paid' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                              )}>
                                {selectedSale.paymentStatus === 'paid' ? 'PAGO' : 'PENDENTE'}
                              </span>
                            </div>
                          )}
                        </p>
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

                    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                        <Receipt className="w-3 h-3" /> Resumo Financeiro
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] items-center">
                           <span className="text-slate-400 font-bold uppercase">Subtotal</span>
                           <span className="text-slate-800 font-black">{formatCurrency(selectedSale.subtotal)}</span>
                        </div>
                        {(selectedSale.discount > 0 || (selectedSale.discount2 && selectedSale.discount2 > 0)) && (
                          <div className="flex justify-between text-[10px] items-center">
                             <span className="text-danger font-bold uppercase">Total Desconto</span>
                             <span className="text-danger font-black">-{formatCurrency((selectedSale.discount || 0) + (selectedSale.discount2 || 0))}</span>
                          </div>
                        )}
                        {(selectedSale.customerFee > 0 || (selectedSale.customerFee2 && selectedSale.customerFee2 > 0)) && (
                          <div className="flex justify-between text-[10px] items-center">
                             <span className="text-success font-bold uppercase">Total Juros (Cliente)</span>
                             <span className="text-success font-black">+{formatCurrency((selectedSale.customerFee || 0) + (selectedSale.customerFee2 || 0))}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs items-center mt-1 pt-1 border-t border-slate-200">
                           <span className="text-slate-900 font-black uppercase">Total Líquido</span>
                           <span className="text-accent font-black">{formatCurrency(selectedSale.total)}</span>
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
                                <div className="flex items-center gap-2 mt-0.5">
                                  {item.sku && (
                                    <span className="text-[9px] font-bold text-slate-400">SKU: {item.sku}</span>
                                  )}
                                  <span className="text-[10px] text-slate-400 font-bold">{item.quantity}un x {formatCurrency(item.price)}</span>
                                </div>
                              </div>
                            <p className="font-black text-slate-900 text-xs">{formatCurrency(item.total)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="p-8 pt-0 space-y-3">
                {editingSale ? (
                  <div className="flex gap-3">
                    <button 
                      onClick={handleUpdateSale}
                      disabled={loading}
                      className="flex-1 py-4 bg-success text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-success/20 hover:scale-[1.02] transition-transform uppercase cursor-pointer"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar Alterações
                    </button>
                    <button 
                      onClick={() => setEditingSale(null)}
                      className="flex-1 py-4 bg-slate-100 text-slate-600 font-black rounded-3xl text-xs uppercase"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => handleStartEdit(selectedSale)}
                      className="w-full py-4 bg-accent text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-accent/20 hover:scale-[1.02] transition-transform uppercase cursor-pointer"
                    >
                      <Receipt className="w-4 h-4" /> Editar Venda
                    </button>
                    <button 
                      onClick={handlePrintReceipt}
                      className="w-full py-4 bg-slate-900 text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-sm hover:bg-slate-800 transition-colors uppercase"
                    >
                      <Receipt className="w-4 h-4" /> Emitir Comprovante
                    </button>

                    <button 
                      onClick={() => handleDownloadPDF(selectedSale)}
                      disabled={loading}
                      className="w-full py-4 bg-slate-100 text-slate-700 font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-sm hover:bg-slate-200 transition-colors uppercase disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4" />
                      )}
                      Baixar como PDF
                    </button>
                    
                    <button 
                      onClick={(e) => selectedSale && handleDelete(selectedSale, e)}
                      className="w-full py-4 bg-danger text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-danger/20 hover:scale-[1.02] transition-transform uppercase cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" /> Cancelar / Estornar Venda
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
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
