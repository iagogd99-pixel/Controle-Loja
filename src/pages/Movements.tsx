import React, { useState, useEffect, useMemo } from 'react';
import { 
  History,
  Search,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  Edit2,
  Trash2,
  X,
  Lock,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  Clock,
  User,
  Receipt,
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { db } from '@/src/lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  Timestamp 
} from 'firebase/firestore';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatCurrency, formatDate, getBrasiliaISO, getBrasiliaTime } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface CashMovement {
  id: string;
  amount: number;
  type: 'in' | 'out';
  category: 'venda' | 'compra' | 'sangria' | 'suprimento' | 'despesa' | string;
  paymentMethod: string;
  reason: string;
  userId: string;
  userName: string;
  timestamp: string;
  saleId?: string;
  purchaseId?: string;
  installmentId?: number;
}

interface UserListItem {
  uid: string;
  name: string;
}

export default function Movements() {
  const { profile, isAdmin, verifyPassword } = useAuth();
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [dateRangeOption, setDateRangeOption] = useState<'all' | 'today' | 'yesterday' | '7days' | 'month' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);

  // Editing and Deleting states
  const [selectedMovement, setSelectedMovement] = useState<CashMovement | null>(null);
  const [editingMovement, setEditingMovement] = useState<CashMovement | null>(null);
  const [editForm, setEditForm] = useState({
    reason: '',
    amount: '',
    type: 'in' as 'in' | 'out',
    category: 'venda',
    paymentMethod: 'dinheiro',
    timestamp: ''
  });

  // Security Prompt
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => Promise<void>>(() => async () => {});
  const [passwordPromptTitle, setPasswordPromptTitle] = useState('Acesso Restrito');

  // Load cash movements and users in real-time
  useEffect(() => {
    const q = query(collection(db, 'cash_movements'), orderBy('timestamp', 'desc'));
    const unsubscribeMovements = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          ...item
        } as CashMovement;
      });
      setMovements(data);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar movimentações:", error);
      setLoading(false);
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        uid: doc.id,
        name: doc.data().name || 'Sem nome'
      }));
      setUsers(usersList);
    });

    return () => {
      unsubscribeMovements();
      unsubscribeUsers();
    };
  }, []);

  // Filter functionality
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // 1. Search term match (reason, userName, ID, or amount)
      const matchesSearch = 
        m.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(m.amount).includes(searchTerm);

      // 2. Type filter
      const matchesType = typeFilter === 'all' || m.type === typeFilter;

      // 3. Category filter
      const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter;

      // 4. User filter
      const matchesUser = userFilter === 'all' || m.userId === userFilter;

      // 5. Date filter
      let matchesDate = true;
      const movementTime = m.timestamp ? new Date(m.timestamp) : new Date();
      const today = getBrasiliaTime();
      today.setHours(0, 0, 0, 0);

      if (dateRangeOption === 'today') {
        matchesDate = movementTime >= today;
      } else if (dateRangeOption === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(today);
        matchesDate = movementTime >= yesterday && movementTime < endOfYesterday;
      } else if (dateRangeOption === '7days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        matchesDate = movementTime >= sevenDaysAgo;
      } else if (dateRangeOption === 'month') {
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        matchesDate = movementTime >= firstDayOfMonth;
      } else if (dateRangeOption === 'custom') {
        if (customStartDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          matchesDate = matchesDate && movementTime >= start;
        }
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          matchesDate = matchesDate && movementTime <= end;
        }
      }

      return matchesSearch && matchesType && matchesCategory && matchesUser && matchesDate;
    });
  }, [movements, searchTerm, typeFilter, categoryFilter, userFilter, dateRangeOption, customStartDate, customEndDate]);

  // Statistics calculations based on current filters
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    filteredMovements.forEach(m => {
      if (m.type === 'in') {
        totalIn += (m.amount || 0);
      } else {
        totalOut += (m.amount || 0);
      }
    });

    return {
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
      count: filteredMovements.length
    };
  }, [filteredMovements]);

  // Handle Edit form opening
  const handleOpenEdit = (m: CashMovement) => {
    setEditingMovement(m);
    
    // Safely parse timestamp to local datetime input format (yyyy-MM-ddThh:mm)
    let formattedTs = '';
    try {
      const dateObj = m.timestamp ? new Date(m.timestamp) : new Date();
      // compensate for local timezone manually to build ISO string matching local clock
      const userOffset = dateObj.getTimezoneOffset() * 60000; 
      const localDate = new Date(dateObj.getTime() - userOffset);
      formattedTs = localDate.toISOString().slice(0, 16);
    } catch {
      formattedTs = new Date().toISOString().slice(0, 16);
    }

    setEditForm({
      reason: m.reason || '',
      amount: String(m.amount || 0),
      type: m.type || 'in',
      category: m.category || 'venda',
      paymentMethod: m.paymentMethod || 'dinheiro',
      timestamp: formattedTs
    });
  };

  // Run the Edit Firebase action after verification
  const handleSaveEdit = async () => {
    if (!editingMovement) return;

    const action = async () => {
      try {
        const movementRef = doc(db, 'cash_movements', editingMovement.id);
        
        let targetTimestamp = editingMovement.timestamp;
        if (editForm.timestamp) {
          targetTimestamp = new Date(editForm.timestamp).toISOString();
        }

        await updateDoc(movementRef, {
          reason: editForm.reason,
          amount: Number(editForm.amount),
          type: editForm.type,
          category: editForm.category,
          paymentMethod: editForm.paymentMethod,
          timestamp: targetTimestamp
        });

        alert('Movimentação atualizada com sucesso!');
        setEditingMovement(null);
      } catch (err: any) {
        console.error('Erro ao atualizar movimentação:', err);
        alert('Erro ao atualizar movimentação: ' + err.message);
      }
    };

    setPasswordPromptTitle('Confirmar Alteração');
    setPendingAction(() => action);
    setShowPasswordPrompt(true);
  };

  // Delete flow helper
  const handleDelete = (m: CashMovement) => {
    const action = async () => {
      try {
        await deleteDoc(doc(db, 'cash_movements', m.id));
        alert('Movimentação excluída com sucesso!');
      } catch (err: any) {
        console.error('Erro ao excluir movimentação:', err);
        alert('Erro ao excluir: ' + err.message);
      }
    };

    setPasswordPromptTitle('Confirmar Exclusão');
    setPendingAction(() => action);
    setShowPasswordPrompt(true);
  };

  // Confirms password verification
  const confirmPassword = async () => {
    setVerifyingPassword(true);
    const isValid = await verifyPassword(passwordInput);
    setVerifyingPassword(false);
    
    if (isValid) {
      setShowPasswordPrompt(false);
      setPasswordInput('');
      await pendingAction();
    } else {
      alert('Senha incorreta');
    }
  };

  // Quick reset filters helper
  const handleResetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setUserFilter('all');
    setDateRangeOption('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  return (
    <div className="space-y-8 pb-20 p-2 sm:p-0">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary shrink-0">
            <History className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Movimentações</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Histórico consolidado do fluxo de caixa e transações</p>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Entradas</p>
            <p className="text-2xl font-black text-[#0d9488]">{formatCurrency(stats.totalIn)}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-slate-400">
            <ArrowUpRight className="w-3.5 h-3.5 text-[#0d9488]" /> Receitas & Suprimentos
          </div>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saídas</p>
            <p className="text-2xl font-black text-danger">{formatCurrency(stats.totalOut)}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-slate-400">
            <ArrowDownRight className="w-3.5 h-3.5 text-danger" /> Gastos, Compras & Sangrias
          </div>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Saldo Consolidado</p>
            <p className={`text-2xl font-black ${stats.balance >= 0 ? "text-accent" : "text-danger"}`}>
              {formatCurrency(stats.balance)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-slate-400">
            Diferença líquida do período
          </div>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 font-sans">Total de Registros</p>
            <p className="text-2xl font-black text-primary">{stats.count}</p>
          </div>
          <div className="flex items-center gap-1.5 mt-4 text-[10px] font-bold text-slate-400">
            Transações filtradas
          </div>
        </div>
      </div>

      {/* Advanced Filters Card */}
      <div className="bg-white rounded-[28px] border border-slate-100 shadow-sm overflow-hidden">
        {/* Toggle Header for Filters */}
        <div 
          onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
          className="flex items-center justify-between p-6 cursor-pointer select-none hover:bg-slate-50/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wider">Filtros de Pesquisa</h2>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider">
            <span>{isFiltersExpanded ? 'Ocultar' : 'Exibir'}</span>
            {isFiltersExpanded ? <ChevronUp className="w-4 h-4 text-accent" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Expandable Panel */}
        <AnimatePresence initial={false}>
          {isFiltersExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden border-t border-slate-100"
            >
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {/* Search Term */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Buscar por Texto</label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Motivo, usuário ou id..."
                        className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 transition-all text-slate-700"
                      />
                    </div>
                    {/* Reset Filters right underneath style box */}
                    <button
                      onClick={handleResetFilters}
                      className="text-slate-400 hover:text-accent transition-colors flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider mt-2.5 cursor-pointer hover:underline"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Limpar Filtros
                    </button>
                  </div>

                  {/* Type Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tipo</label>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                    >
                      <option value="all">TODOS OS TIPOS</option>
                      <option value="in">ENTRADA (INFLOW)</option>
                      <option value="out">SAÍDA (OUTFLOW)</option>
                    </select>
                  </div>

                  {/* Category Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Categoria</label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                    >
                      <option value="all">TODAS AS CATEGORIAS</option>
                      <option value="venda">VENDA</option>
                      <option value="compra">COMPRA</option>
                      <option value="sangria">SANGRIA (RETIRADA)</option>
                      <option value="suprimento">SUPRIMENTO</option>
                      <option value="despesa">DESPESA</option>
                      <option value="operacional">OPERACIONAL</option>
                      <option value="pessoal">PESSOAL</option>
                      <option value="manutenção">MANUTENÇÃO</option>
                      <option value="outros">OUTROS</option>
                    </select>
                  </div>

                  {/* User Filter */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Usuário</label>
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                    >
                      <option value="all">TODOS OS USUÁRIOS</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.name.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range Preset */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Período</label>
                    <select
                      value={dateRangeOption}
                      onChange={(e) => setDateRangeOption(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                    >
                      <option value="all">SISTEMA COMPLETO</option>
                      <option value="today">HOJE</option>
                      <option value="yesterday">ONTEM</option>
                      <option value="7days">ÚLTIMOS 7 DIAS</option>
                      <option value="month">ESTE MÊS</option>
                      <option value="custom">FAIXA DE DATA PERSONALIZADA</option>
                    </select>
                  </div>

                  {/* Custom Date Bounds */}
                  {dateRangeOption === 'custom' && (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data de Início</label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Data de Término</label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl pl-11 pr-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dynamic Grid of Cards (Boxes) */}
      <div>
        {loading ? (
          <div className="bg-white rounded-[28px] border border-slate-100 p-20 text-center flex flex-col items-center justify-center gap-4 shadow-sm">
            <Loader2 className="w-10 h-10 text-accent animate-spin" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando histórico...</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="bg-white rounded-[28px] border border-slate-100 p-20 text-center flex flex-col items-center justify-center gap-4 text-slate-400 shadow-sm">
            <History className="w-12 h-12 stroke-1" />
            <p className="text-sm font-black uppercase tracking-wider">Nenhuma movimentação encontrada</p>
            <p className="text-xs font-bold text-slate-400">Tente ajustar suas opções de filtragem acima.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 px-2">
            {filteredMovements.map((m) => {
              const isInput = m.type === 'in';
              const dateObj = m.timestamp ? new Date(m.timestamp) : new Date();
              const formattedDate = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              
              // Category pill theme style calculation
              let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
              if (m.category === 'venda') badgeStyle = "bg-teal-50 text-teal-700 border-teal-100";
              else if (m.category === 'suprimento') badgeStyle = "bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/20";
              else if (m.category === 'sangria') badgeStyle = "bg-red-50 text-red-600 border-red-100";
              else if (m.category === 'compra') badgeStyle = "bg-amber-50 text-amber-700 border-amber-100";
              else if (m.category === 'despesa') badgeStyle = "bg-rose-50 text-rose-600 border-rose-100";

              return (
                <motion.div
                  key={m.id}
                  layoutId={`movement-card-${m.id}`}
                  onClick={() => setSelectedMovement(m)}
                  className={`bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col justify-between group relative cursor-pointer gap-4 border-b-4 ${isInput ? "border-b-[#0d9488] hover:border-b-accent" : "border-b-danger hover:border-b-danger-dark"}`}
                >
                  {/* Top Header Row of the Box */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${isInput ? "bg-[#0d9488]/10 text-[#0d9488]" : "bg-danger/10 text-danger"}`}>
                        {isInput ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {isInput ? 'Entrada' : 'Saída'}
                      </span>
                    </div>

                    <span className={`text-[8px] font-black tracking-widest px-2.5 py-0.5 rounded-full uppercase border ${badgeStyle}`}>
                      {m.category || 'LANÇAMENTO'}
                    </span>
                  </div>

                  {/* Mid Section: Styled Large Value */}
                  <div>
                    <h3 className={`text-xl font-black tracking-tight ${isInput ? "text-[#0d9488]" : "text-danger"}`}>
                      {isInput ? '+' : '-'} {formatCurrency(m.amount)}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-bold truncate mt-1 uppercase tracking-tight" title={m.reason}>
                      {m.reason}
                    </p>
                  </div>

                  {/* Bottom Footer Info Details */}
                  <div className="pt-2 border-t border-slate-50 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                      <Clock className="w-3 h-3 text-slate-350" />
                      <span>{formattedDate} ás {formattedTime}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate uppercase font-extrabold">{m.userName || 'Sistema'}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Advanced Details Modal */}
      <AnimatePresence>
        {selectedMovement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMovement(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              layoutId={`movement-card-${selectedMovement.id}`}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header section themed by transaction type */}
              <div className={`p-8 pb-6 text-white relative ${selectedMovement.type === 'in' ? 'bg-[#0d9488]' : 'bg-danger'}`}>
                <div className="absolute top-6 right-6 z-20">
                  <button 
                    onClick={() => setSelectedMovement(null)} 
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-white/10 rounded-2xl w-fit mb-4">
                  <History className="w-6 h-6" />
                </div>
                
                <span className="text-[10px] font-black uppercase tracking-widest bg-white/25 px-2.5 py-0.5 rounded-full inline-block">
                  {selectedMovement.type === 'in' ? 'Entrada no Caixa (Inflow)' : 'Saída do Caixa (Outflow)'}
                </span>
                
                <h2 className="text-3xl font-black tracking-tight mt-2">{formatCurrency(selectedMovement.amount)}</h2>
                <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider mt-1">ID: {selectedMovement.id}</p>
              </div>

              {/* Body Details */}
              <div className="flex-1 overflow-y-auto p-8 space-y-5">
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100/50 space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px]">Operador</span>
                    <span className="font-black text-slate-800 uppercase">{selectedMovement.userName || 'Sistema'}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px]">Categoria</span>
                    <span className="font-black text-slate-800 uppercase px-2 py-0.5 bg-slate-100 rounded text-[9px] tracking-widest">{selectedMovement.category || 'N/A'}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px]">Meio de Pagamento</span>
                    <span className="font-black text-slate-800 uppercase">{selectedMovement.paymentMethod || 'Dinheiro'}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px]">Data e Hora</span>
                    <span className="font-black text-slate-800 tracking-tight">{formatDate(selectedMovement.timestamp)}</span>
                  </div>
                </div>

                {/* Narrative Description / Reason */}
                <div className="space-y-1 bg-slate-50 p-6 rounded-3xl border border-slate-100/50">
                  <span className="text-slate-400 font-extrabold uppercase tracking-wider text-[9px] block">Motivo / Histórico</span>
                  <p className="text-xs font-black text-slate-800 uppercase leading-snug mt-1 break-words">
                    {selectedMovement.reason || 'Nenhuma justificativa fornecida.'}
                  </p>
                  
                  {selectedMovement.saleId && (
                    <div className="pt-2.5 mt-2.5 border-t border-slate-200/50 flex justify-between text-[10px] font-bold">
                      <span className="text-slate-400">ID DA VENDA:</span>
                      <span className="text-accent uppercase font-black">#{selectedMovement.saleId.slice(-6).toUpperCase()}</span>
                    </div>
                  )}

                  {selectedMovement.purchaseId && (
                    <div className="pt-2.5 mt-2.5 border-t border-slate-200/50 flex justify-between text-[10px] font-bold">
                      <span className="text-slate-400">ID DA COMPRA:</span>
                      <span className="text-amber-600 uppercase font-black">#{selectedMovement.purchaseId.slice(-6).toUpperCase()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Styled Square Action Buttons */}
              <div className="p-8 pt-4 pb-8 flex gap-3 border-t border-slate-50 bg-slate-50/55">
                <button
                  onClick={() => {
                    handleOpenEdit(selectedMovement);
                    setSelectedMovement(null);
                  }}
                  className="flex-1 py-4 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-extrabold rounded-2xl text-[10px] uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  <Edit2 className="w-3.5 h-3.5 text-accent" />
                  Editar Registro
                </button>

                <button
                  onClick={() => {
                    handleDelete(selectedMovement);
                    setSelectedMovement(null);
                  }}
                  className="flex-1 py-4 bg-white hover:bg-danger/5 border border-red-100 hover:border-danger text-danger font-extrabold rounded-2xl text-[10px] uppercase flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  <Trash2 className="w-3.5 h-3.5 text-danger" />
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Dialog Modal */}
      <AnimatePresence>
        {editingMovement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingMovement(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="p-8 pb-4 flex items-center justify-between border-b border-slate-50">
                <div>
                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">Ajuste de Registro</span>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">Editar Transação</h3>
                </div>
                <button
                  onClick={() => setEditingMovement(null)}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {/* Reason/Description */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição / Motivo</label>
                  <input
                    type="text"
                    value={editForm.reason}
                    onChange={(e) => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-xs outline-none focus:ring-2 focus:ring-accent/20 transition-all text-slate-700"
                    placeholder="Ex: Suprimento diário, Venda manual..."
                  />
                </div>

                {/* Amount / Value */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-xs outline-none focus:ring-2 focus:ring-accent/20 transition-all text-slate-700"
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Type */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tipo</label>
                    <div className="flex p-1 bg-slate-100 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, type: 'in' }))}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${editForm.type === 'in' ? "bg-white text-[#0d9488] shadow-sm" : "text-slate-500"}`}
                      >
                        Entrada
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm(prev => ({ ...prev, type: 'out' }))}
                        className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${editForm.type === 'out' ? "bg-white text-danger shadow-sm" : "text-slate-500"}`}
                      >
                        Saída
                      </button>
                    </div>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Meio de Pgto</label>
                    <select
                      value={editForm.paymentMethod}
                      onChange={(e) => setEditForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                      className="w-full bg-slate-50 border-none rounded-xl px-4 py-2.5 font-bold text-xs outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                    >
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="cartão">Cartão</option>
                      <option value="outro">Outro/Misto</option>
                    </select>
                  </div>
                </div>

                {/* Category Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-xs outline-none focus:ring-2 focus:ring-accent/20 text-slate-700"
                  >
                    <option value="venda">Venda</option>
                    <option value="compra">Compra estoque</option>
                    <option value="sangria">Sangria (Retirada)</option>
                    <option value="suprimento">Suprimento</option>
                    <option value="despesa">Despesa Geral</option>
                    <option value="operacional">Operacional</option>
                    <option value="pessoal">Pessoal</option>
                    <option value="manutenção">Manutenção</option>
                    <option value="outros">Outros</option>
                  </select>
                </div>

                {/* Timestamp date-time input */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Data e Horário</label>
                  <input
                    type="datetime-local"
                    value={editForm.timestamp}
                    onChange={(e) => setEditForm(prev => ({ ...prev, timestamp: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-4 font-bold text-xs outline-none focus:ring-2 focus:ring-accent/20 transition-all text-slate-700"
                  />
                </div>
              </div>

              <div className="p-8 pt-4 pb-8 flex gap-3 border-t border-slate-50 bg-slate-50/50">
                <button
                  onClick={() => setEditingMovement(null)}
                  className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 font-extrabold rounded-2xl text-[10px] uppercase transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 py-4 bg-accent text-white font-extrabold rounded-2xl text-[10px] uppercase tracking-wide shadow-lg shadow-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
                >
                  Confirmar & Salvar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Security Master Password Prompt Modal */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">{passwordPromptTitle}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Confirme sua senha para continuar</p>

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
                    className="w-full py-4 bg-accent text-white font-black rounded-2xl text-[10px] uppercase shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {verifyingPassword ? 'Verificando...' : 'Confirmar Acesso'}
                  </button>
                  <button
                    onClick={() => setShowPasswordPrompt(false)}
                    className="w-full py-4 bg-slate-50 text-slate-400 font-black rounded-2xl text-[10px] uppercase cursor-pointer"
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
