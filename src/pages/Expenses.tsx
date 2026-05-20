import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc,
  doc,
  limit,
  Timestamp,
  where
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { Expense, Purchase } from '@/src/types';
import { 
  Plus, 
  Trash2, 
  Pencil,
  Search, 
  Filter, 
  Calendar as CalendarIcon,
  DollarSign,
  ArrowDownRight,
  X,
  CheckCircle2,
  Loader2,
  FileText,
  ShoppingBag
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const getBrasiliaTime = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * -3));
};

const getBrasiliaISO = () => {
  return getBrasiliaTime().toISOString();
};

interface UnifiedExpense {
  id: string;
  description: string;
  amount: number;
  paymentMethod: string;
  category: string;
  timestamp: string;
  date: string;
  userName: string;
  type: 'expense' | 'purchase';
  purchaseId?: string;
  supplierName?: string;
  status: 'paid' | 'pending';
}

export default function Expenses() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [unifiedExpenses, setUnifiedExpenses] = useState<UnifiedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'realizadas' | 'futuras'>('realizadas');

  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [category, setCategory] = useState<'operacional' | 'pessoal' | 'manutenção' | 'outros'>('operacional');
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [date, setDate] = useState(getBrasiliaTime().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let expData: UnifiedExpense[] = [];
    let purData: UnifiedExpense[] = [];

    const updateCombined = () => {
      const combined = [...expData, ...purData].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setUnifiedExpenses(combined);
      setLoading(false);
    };

    // Listen to manual expenses
    const qExp = query(collection(db, 'expenses'), orderBy('timestamp', 'desc'), limit(150));
    const unsubExp = onSnapshot(qExp, (expSnap) => {
      expData = expSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          status: data.status || 'paid',
          type: 'expense'
        } as UnifiedExpense;
      });
      updateCombined();
    });

    // Listen to purchases
    const qPur = query(collection(db, 'purchases'), orderBy('timestamp', 'desc'), limit(150));
    const unsubPur = onSnapshot(qPur, (purSnap) => {
      const localPurData: UnifiedExpense[] = [];
      purSnap.docs.forEach(doc => {
        const data = doc.data() as Purchase;
        const ts = (data.timestamp as any) instanceof Timestamp ? (data.timestamp as any).toDate() : new Date(data.timestamp);
        
        if (data.isSplitPayment) {
          // Part 1
          localPurData.push({
            id: `${doc.id}-1`,
            description: `Compra: ${data.supplierName || 'Fornecedor'} (1/2)`,
            amount: data.splitAmount1 || (data.total / 2),
            paymentMethod: data.paymentMethod,
            category: 'compra',
            timestamp: ts.toISOString(),
            date: ts.toISOString(),
            userName: data.userName || 'Sistema',
            type: 'purchase',
            purchaseId: doc.id,
            supplierName: data.supplierName,
            status: data.paymentStatus || 'pending'
          });
          // Part 2
          localPurData.push({
            id: `${doc.id}-2`,
            description: `Compra: ${data.supplierName || 'Fornecedor'} (2/2)`,
            amount: data.splitAmount2 || (data.total / 2),
            paymentMethod: data.paymentMethod2 || data.paymentMethod,
            category: 'compra',
            timestamp: ts.toISOString(),
            date: ts.toISOString(),
            userName: data.userName || 'Sistema',
            type: 'purchase',
            purchaseId: doc.id,
            supplierName: data.supplierName,
            status: data.paymentStatus2 || 'pending'
          });
        } else {
          localPurData.push({
            id: doc.id,
            description: `Compra: ${data.supplierName || 'Fornecedor'}`,
            amount: data.total,
            paymentMethod: data.paymentMethod,
            category: 'compra',
            timestamp: ts.toISOString(),
            date: ts.toISOString(),
            userName: data.userName || 'Sistema',
            type: 'purchase',
            purchaseId: doc.id,
            supplierName: data.supplierName,
            status: data.paymentStatus || 'pending'
          });
        }
      });
      purData = localPurData;
      updateCombined();
    });

    return () => {
      unsubExp();
      unsubPur();
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setShowAddModal(true);
      // Remove the parameter after showing the modal
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('new');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submitting) return;

    try {
      setSubmitting(true);
      const expenseData = {
        description,
        amount: Number(amount),
        paymentMethod,
        category,
        status,
        date,
        userId: profile.uid,
        userName: profile.name
      };

      if (editingId) {
        await updateDoc(doc(db, 'expenses', editingId), expenseData);
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...expenseData,
          timestamp: getBrasiliaISO(),
        });
      }

      setShowAddModal(false);
      setEditingId(null);
      resetForm();
      alert(editingId ? "Despesa atualizada!" : "Despesa lançada com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar despesa:", error);
      alert("Erro ao salvar despesa.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditExpense = (expense: UnifiedExpense) => {
    if (expense.type === 'purchase') {
      alert("Compras devem ser editadas no menu de Compras.");
      return;
    }
    setEditingId(expense.id);
    setDescription(expense.description);
    setAmount(expense.amount.toString());
    setPaymentMethod(expense.paymentMethod);
    setCategory(expense.category as any);
    setStatus(expense.status || 'paid');
    setDate(expense.date);
    setShowAddModal(true);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteExpense = async (expense: UnifiedExpense) => {
    if (expense.type === 'purchase') {
      alert("Exclua a compra diretamente no Histórico de Compras para estornar o estoque.");
      return;
    }

    if (!expense.id) {
      alert("Erro: ID da despesa não encontrado.");
      return;
    }

    // Use state-based confirmation instead of window.confirm
    if (deleteConfirmId !== expense.id) {
      setDeleteConfirmId(expense.id);
      // Auto-reset after 3 seconds
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      setSubmitting(true);
      console.log(`Tentando excluir despesa ID: ${expense.id}`);
      const expenseDocRef = doc(db, 'expenses', expense.id);
      await deleteDoc(expenseDocRef);
      console.log(`Despesa ${expense.id} excluída com sucesso.`);
      setDeleteConfirmId(null);
      alert("Despesa removida com sucesso!");
    } catch (error: any) {
      console.error("Erro ao deletar despesa:", error);
      alert(`Erro ao remover despesa: ${error.message || 'Verifique sua conexão ou permissões.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async (expense: UnifiedExpense) => {
    if (expense.type === 'purchase') {
      alert("Compras devem ser pagas no menu de Compras a Pagar.");
      return;
    }

    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'expenses', expense.id), {
        status: 'paid'
      });
      alert("Despesa marcada como paga!");
    } catch (error) {
      console.error(error);
      alert("Erro ao atualizar despesa.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setPaymentMethod('dinheiro');
    setCategory('operacional');
    setStatus('paid');
    setDate(getBrasiliaTime().toISOString().slice(0, 16));
  };

  const filteredExpenses = unifiedExpenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (e.supplierName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesStatus = activeTab === 'realizadas' ? e.status === 'paid' : e.status === 'pending';

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalFiltered = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-primary uppercase tracking-tighter">Despesas</h1>
          <p className="text-slate-400 font-bold text-sm uppercase tracking-widest mt-1">Gestão de Gastos e Compras</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-accent text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-accent/20 hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-3"
        >
          <Plus className="w-5 h-5" />
          Nova Despesa
        </button>
      </header>

      {/* Tabs */}
      <div className="flex items-center p-1 bg-slate-100 rounded-2xl">
        <button 
          onClick={() => setActiveTab('realizadas')}
          className={cn(
            "flex-1 py-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
            activeTab === 'realizadas' ? "bg-white text-primary shadow-sm" : "text-slate-500"
          )}
        >
          Despesas Realizadas
        </button>
        <button 
          onClick={() => setActiveTab('futuras')}
          className={cn(
            "flex-1 py-4 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
            activeTab === 'futuras' ? "bg-white text-primary shadow-sm" : "text-slate-500"
          )}
        >
          Despesas Futuras
        </button>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            {activeTab === 'realizadas' ? 'Total Pago' : 'Total a Pagar'}
          </p>
          <p className={cn("text-2xl font-black", activeTab === 'realizadas' ? "text-danger" : "text-amber-500")}>
            {formatCurrency(totalFiltered)}
          </p>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Registros</p>
          <p className="text-2xl font-black text-primary">{filteredExpenses.length}</p>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Filtro Ativo</p>
          <p className="text-2xl font-black text-success uppercase italic">
            {activeTab === 'realizadas' ? 'Realizadas' : 'Futuras'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <input 
            type="text"
            placeholder="Buscar despesa por descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-14 bg-white border border-slate-100 rounded-2xl pl-12 pr-4 font-bold text-slate-600 focus:ring-2 focus:ring-accent/20 transition-all outline-none"
          />
        </div>
        <div className="relative w-full md:w-64">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full h-14 bg-white border border-slate-100 rounded-2xl pl-12 pr-4 font-bold text-slate-600 appearance-none outline-none"
          >
            <option value="all">Todas Categorias</option>
            <option value="compra">Compras estoque</option>
            <option value="operacional">Operacional</option>
            <option value="pessoal">Pessoal</option>
            <option value="manutenção">Manutenção</option>
            <option value="outros">Outros</option>
          </select>
        </div>
      </div>

      {/* Expenses Table/List */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data / Categoria</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pagamento</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valor</th>
                <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredExpenses.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="p-6">
                    <p className="text-xs font-black text-slate-800">{format(new Date(e.date), "dd/MM/yyyy")}</p>
                    <p className={cn(
                      "text-[9px] font-black uppercase tracking-widest mt-0.5 px-2 py-0.5 rounded-md inline-block",
                      e.type === 'purchase' ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"
                    )}>
                      {e.category}
                    </p>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                       {e.type === 'purchase' && <ShoppingBag className="w-4 h-4 text-primary" />}
                       <p className="text-sm font-bold text-slate-700">{e.description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Usuário: {e.userName}</p>
                      {e.purchaseId && (
                        <p className="text-[10px] text-primary font-black uppercase tracking-widest leading-none bg-primary/5 px-2 py-1 rounded-md">
                          Pedido: #{e.purchaseId.slice(-6).toUpperCase()}
                        </p>
                      )}
                      {e.supplierName && e.type === 'expense' && (
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none bg-slate-50 px-2 py-1 rounded-md">
                          Fornecedor: {e.supplierName}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                      {e.paymentMethod}
                    </span>
                  </td>
                  <td className="p-6 text-right">
                    <p className={cn(
                      "text-sm font-black",
                      e.status === 'paid' ? "text-danger" : "text-amber-500"
                    )}>
                      -{formatCurrency(e.amount)}
                    </p>
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center gap-2">
                      {e.status === 'pending' && e.type === 'expense' && (
                        <button 
                          onClick={() => handleMarkAsPaid(e)}
                          className="p-3 text-success hover:bg-success/10 rounded-xl transition-all"
                          title="Marcar como Pago"
                        >
                          <CheckCircle2 className="w-5 h-5" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditExpense(e)}
                        className={cn(
                          "p-3 rounded-xl transition-all",
                          e.type === 'purchase' ? "text-slate-200 cursor-not-allowed" : "text-slate-300 hover:text-accent hover:bg-accent/10"
                        )}
                        title={e.type === 'purchase' ? "Editar na aba Compras" : "Editar"}
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDeleteExpense(e);
                        }}
                        className={cn(
                          "p-3 rounded-xl transition-all relative overflow-hidden",
                          e.type === 'purchase' 
                            ? "text-slate-200 cursor-not-allowed" 
                            : deleteConfirmId === e.id
                              ? "bg-danger text-white hover:bg-danger/90 px-4"
                              : "text-slate-300 hover:text-danger hover:bg-danger/10"
                        )}
                        title={e.type === 'purchase' ? "Excluir na aba Compras" : deleteConfirmId === e.id ? "Clique novamente para confirmar" : "Excluir"}
                      >
                        {submitting && deleteConfirmId === e.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : deleteConfirmId === e.id ? (
                          <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Confirmar?</span>
                        ) : (
                          <Trash2 className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200 mb-4">
                        <FileText className="w-8 h-8" />
                      </div>
                      <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhuma despesa encontrada</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-xl overflow-hidden relative z-[1001]"
            >
              <div className="bg-slate-50 p-8 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center text-white",
                      editingId ? "bg-accent" : "bg-danger"
                    )}>
                      {editingId ? <Pencil className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-primary uppercase">
                        {editingId ? "Editar Despesa" : "Nova Despesa"}
                      </h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {editingId ? "Alterar Lançamento" : "Lançamento de Gastos"}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingId(null);
                      resetForm();
                    }} 
                    className="p-2 hover:bg-white rounded-xl transition-all"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleAddExpense} className="p-8 space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Descrição da Despesa</label>
                  <input 
                    type="text"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ex: Aluguel da Loja, Luz, Internet..."
                    className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Valor Pagamento</label>
                    <div className="relative">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 font-black">R$</div>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0,00"
                        className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl pl-12 pr-6 font-black text-slate-800 transition-all outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Data do Gasto</label>
                    <input 
                      type="datetime-local"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Meio de Pagamento</label>
                    <select 
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none appearance-none"
                    >
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="cartão">Cartão</option>
                      <option value="transferência">Transf.</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Status Pagamento</label>
                    <select 
                      value={status}
                      onChange={(e) => setStatus(e.target.value as any)}
                      className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none appearance-none"
                    >
                      <option value="paid">Já Pago ✅</option>
                      <option value="pending">A Pagar (Futuro) ⏳</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 tracking-widest">Categoria</label>
                  <select 
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none appearance-none"
                  >
                    <option value="operacional">Operacional</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="manutenção">Manutenção</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  className={cn(
                    "w-full h-18 text-white font-black rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-widest text-sm mt-4",
                    editingId ? "bg-accent shadow-accent/30" : "bg-danger shadow-danger/30"
                  )}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-6 h-6" />}
                  {editingId ? "Salvar Alterações" : "Confirmar Lançamento"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
