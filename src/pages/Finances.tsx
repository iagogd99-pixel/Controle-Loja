import React, { useState, useEffect } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  Plus, 
  History as HistoryIcon,
  Search,
  Calendar,
  AlertCircle,
  Loader2,
  DollarSign,
  Download,
  Filter,
  Smartphone,
  CreditCard,
  TrendingUp,
  Calculator,
  Minus,
  Trash2,
  X,
  Lock,
  CheckCircle2
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { cn, formatCurrency, getBrasiliaISO, getBrasiliaTime } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface CashSession {
  id: string;
  openingBalance: number;
  closingBalance?: number;
  status: 'open' | 'closed';
  userId: string;
  userName: string;
  openedAt: any;
  closedAt?: any;
}

interface Movement {
  id: string;
  amount: number;
  type: 'in' | 'out';
  category?: 'venda' | 'sangria' | 'suprimento' | 'compra' | 'outros';
  paymentMethod?: string;
  reason: string;
  userId: string;
  userName: string;
  saleId?: string;
  timestamp: any;
}

export default function Finances() {
  const { profile, verifyPassword } = useAuth();
  const [activeSession, setActiveSession] = useState<CashSession | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'current' | 'future'>('current');
  
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [submittingStats, setSubmittingStats] = useState(false);

  // Modals
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  
  // Forms
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [supplyReason, setSupplyReason] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmountReal, setClosingAmountReal] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Password Verification State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [passwordPromptTitle, setPasswordPromptTitle] = useState('Acesso Restrito');
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const confirmPassword = async () => {
    if (!passwordInput) return;
    setVerifyingPassword(true);
    const isValid = await verifyPassword(passwordInput);
    setVerifyingPassword(false);
    
    if (isValid) {
      setShowPasswordPrompt(false);
      setPasswordInput('');
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      alert('Senha incorreta. Tente novamente.');
    }
  };

  // Stats
  const [stats, setStats] = useState({
    totalSales: 0,
    totalWithdrawals: 0,
    totalSupplies: 0,
    totalPurchases: 0,
    lucroHoje: 0,
    dinheiroIn: 0,
    dinheiroOut: 0,
    pixIn: 0,
    pixOut: 0,
    cartaoIn: 0,
    cartaoOut: 0
  });

  useEffect(() => {
    const qSession = query(
      collection(db, 'cash_sessions'),
      where('status', '==', 'open'),
      limit(1)
    );

    const unsubSession = onSnapshot(qSession, (snapshot) => {
      if (!snapshot.empty) {
        const doc_ = snapshot.docs[0];
        setActiveSession({ id: doc_.id, ...doc_.data() } as CashSession);
      } else {
        setActiveSession(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cash_sessions');
      setLoading(false);
    });

    return () => {
      unsubSession();
    };
  }, []);

  useEffect(() => {
    if (!activeSession) return;

    const sessStartStr = (activeSession.openedAt instanceof Timestamp ? activeSession.openedAt.toDate() : getBrasiliaTime()).toISOString();
    
    const qMovements = query(
      collection(db, 'cash_movements'),
      where('timestamp', '>=', sessStartStr),
      orderBy('timestamp', 'desc')
    );

    const unsubMovements = onSnapshot(qMovements, (snapshot) => {
      const docs = snapshot.docs.map(doc_ => ({
        id: doc_.id,
        ...doc_.data()
      })) as Movement[];
      setMovements(docs);

      let salesSum = 0;
      let withSum = 0;
      let supSum = 0;
      let moneyIn = 0;
      let moneyOut = 0;
      let pixIn = 0;
      let pixOut = 0;
      let cardIn = 0;
      let cardOut = 0;
      let purchaseSum = 0;

      docs.forEach(m => {
        if (m.type === 'in') {
           if (m.category === 'venda') salesSum += m.amount;
           if (m.category === 'suprimento') supSum += m.amount;
           
           // Por método
           if (m.paymentMethod === 'dinheiro') moneyIn += m.amount;
           if (m.paymentMethod === 'pix') pixIn += m.amount;
           if (m.paymentMethod === 'cartão') cardIn += m.amount;
        } else if (m.type === 'out') {
           if (m.category === 'sangria') withSum += m.amount;
           if (m.category === 'compra') purchaseSum += m.amount;
           // If manually added withdrawal, count as withSum if no category
           if (!m.category) withSum += m.amount;

           // Por método (saídas)
           if (m.paymentMethod === 'dinheiro') moneyOut += m.amount;
           if (m.paymentMethod === 'pix') pixOut += m.amount;
           if (m.paymentMethod === 'cartão') cardOut += m.amount;
        }
      });

      setStats(prev => ({ 
        ...prev, 
        totalSales: salesSum, 
        totalWithdrawals: withSum, 
        totalSupplies: supSum,
        totalPurchases: purchaseSum,
        dinheiroIn: moneyIn,
        dinheiroOut: moneyOut,
        pixIn: pixIn,
        pixOut: pixOut,
        cartaoIn: cardIn,
        cartaoOut: cardOut
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cash_movements');
    });

    const unsubPendingSales = onSnapshot(collection(db, 'sales'), (snapshot) => {
      const pending = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((s: any) => s.paymentStatus === 'pending' || s.paymentStatus2 === 'pending');
      setPendingSales(pending);
    });

    const unsubPendingPurchases = onSnapshot(collection(db, 'purchases'), (snapshot) => {
      const pending = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((p: any) => p.paymentStatus === 'pending' || p.paymentStatus2 === 'pending');
      setPendingPurchases(pending);
    });

    // Fetch Profit for Today (Sales items items: price - costPrice)
    const qSales = query(collection(db, 'sales'), where('timestamp', '>=', sessStartStr), where('status', '==', 'completed'));
    
    const unsubSales = onSnapshot(qSales, (snapshot) => {
      let profit = 0;
      snapshot.forEach(doc_ => {
        const sale = doc_.data();
        if (sale.items && Array.isArray(sale.items)) {
          sale.items.forEach((item: any) => {
            profit += (item.price - (item.costPrice || 0)) * item.quantity;
          });
        }
      });
      // Deduct potential discounts or add fees from the sale level if desired, but items usually include that
      setStats(prev => ({ ...prev, lucroHoje: profit }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    return () => {
      unsubMovements();
      unsubSales();
      unsubPendingSales();
      unsubPendingPurchases();
    };
  }, [activeSession]);

  const handleOpenCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submitting) return;

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'cash_sessions'), {
        openingBalance: Number(openingAmount),
        status: 'open',
        userId: profile.uid,
        userName: profile.name,
        openedAt: serverTimestamp()
      });
      setOpeningAmount('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cash_sessions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submitting || !activeSession) return;

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'cash_movements'), {
        amount: Number(withdrawalAmount),
        type: 'out',
        category: 'sangria',
        paymentMethod: 'dinheiro',
        reason: withdrawalReason || 'Sangria de Caixa',
        userId: profile.uid,
        userName: profile.name,
        timestamp: getBrasiliaISO()
      });
      setShowWithdrawalModal(false);
      setWithdrawalAmount('');
      setWithdrawalReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cash_movements');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submitting || !activeSession) return;

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'cash_movements'), {
        amount: Number(supplyAmount),
        type: 'in',
        category: 'suprimento',
        paymentMethod: 'dinheiro',
        reason: supplyReason || 'Suprimento de Caixa',
        userId: profile.uid,
        userName: profile.name,
        timestamp: getBrasiliaISO()
      });
      setShowSupplyModal(false);
      setSupplyAmount('');
      setSupplyReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cash_movements');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseCash = async () => {
    if (!activeSession || !profile || submitting) return;
    setShowCloseConfirm(true);
  };

  const confirmCloseCash = async () => {
    if (!activeSession || !profile || submitting) return;

    const expectedBalance = activeSession.openingBalance + stats.totalSales + stats.totalSupplies - stats.totalWithdrawals;
    const realBalance = Number(closingAmountReal) || expectedBalance;
    const difference = realBalance - expectedBalance;

    try {
      setSubmitting(true);
      await updateDoc(doc(db, 'cash_sessions', activeSession.id), {
        status: 'closed',
        closingBalance: expectedBalance,
        closingBalanceReal: realBalance,
        closingDifference: difference,
        closingNote: closingNote,
        closedAt: serverTimestamp(),
        closedBy: profile.uid,
        closedByName: profile.name
      });
      setShowCloseConfirm(false);
      setClosingAmountReal('');
      setClosingNote('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cash_sessions/${activeSession.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const saldoAtual = activeSession ? (activeSession.openingBalance + stats.dinheiroIn + stats.totalSupplies - stats.totalWithdrawals - stats.dinheiroOut) : 0;
  const saldoTotal = activeSession ? (activeSession.openingBalance + stats.totalSales + stats.totalSupplies - stats.totalWithdrawals - stats.totalPurchases) : 0;

  const handleDeleteMovement = async (m: Movement) => {
     if (!profile || profile.role !== 'admin') {
       alert('Apenas administradores podem excluir movimentações.');
       return;
     }

     if (!confirm(`Deseja realmente excluir esta movimentação de ${formatCurrency(m.amount)} (${m.reason})?`)) return;

     try {
       setSubmitting(true);
       await deleteDoc(doc(db, 'cash_movements', m.id));
       
       // Handle side effects (e.g. if it was a purchase, maybe update purchase status)
       // For now, just delete the movement as requested to "not interfere"
       
       alert('Movimentação excluída com sucesso!');
     } catch (err) {
       console.error(err);
       alert('Erro ao excluir movimentação.');
     } finally {
       setSubmitting(false);
     }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-20 px-2 lg:px-0">
      <header className="flex items-center gap-3 mb-2 px-2">
        <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
          <DollarSign className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Caixa</h1>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Gestão de Caixa e Fluxo</p>
        </div>
      </header>

      <div className="space-y-6">
        <div className="flex items-center p-1 bg-slate-100 rounded-2xl mx-1">
          <button 
            onClick={() => setActiveTab('current')}
            className={cn(
              "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
              activeTab === 'current' ? "bg-white text-primary shadow-sm" : "text-slate-500"
            )}
          >
            Caixa Atual
          </button>
          <button 
            onClick={() => setActiveTab('future')}
            className={cn(
              "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
              activeTab === 'future' ? "bg-white text-primary shadow-sm" : "text-slate-500"
            )}
          >
            Movimentações Futuras
          </button>
        </div>

        {activeTab === 'current' ? (
          <div className="space-y-4">
            {activeSession && (
              <div className="mt-1 px-2">
                <p className="text-slate-400 text-xs font-bold">Aberto desde</p>
                <p className="text-slate-500 text-xs font-black">
                  {format(activeSession.openedAt instanceof Timestamp ? activeSession.openedAt.toDate() : new Date(activeSession.openedAt), "dd/MM/yyyy, HH:mm:ss", { locale: ptBR })}
                </p>
              </div>
            )}
            
            {activeSession && (
              <div className="grid grid-cols-2 gap-4 px-2">
                 <button 
                  onClick={() => setShowSupplyModal(true)}
                  className="flex items-center justify-center gap-2 py-3.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                 >
                   <Plus className="w-4 h-4" />
                   Suprimento
                 </button>
                 <button 
                  onClick={() => setShowWithdrawalModal(true)}
                  className="flex items-center justify-center gap-2 py-3.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                 >
                   <Minus className="w-4 h-4" />
                   Sangria
                 </button>
              </div>
            )}

            {/* Emergency reset button for admins */}
            {activeSession && profile?.role === 'admin' && (
              <div className="px-2">
                <div className="p-4 bg-red-50/50 border border-red-100 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
                      <AlertCircle className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">Ajuste de Fluxo</p>
                      <h4 className="text-[11px] font-black text-red-900">Zerar Registro de Vendas</h4>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <AnimatePresence mode="wait">
                      {!showResetConfirm ? (
                        <motion.button 
                          key="trigger"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          onClick={() => setShowResetConfirm(true)}
                          className="px-4 py-2 bg-red-600 text-white text-[10px] font-black rounded-lg hover:bg-red-700 transition-colors uppercase"
                        >
                          Zerar
                        </motion.button>
                      ) : (
                        <motion.div 
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-2"
                        >
                          <button onClick={() => setShowResetConfirm(false)} className="px-3 py-2 bg-slate-200 text-slate-600 text-[10px] font-black rounded-lg uppercase">Não</button>
                          <button 
                            disabled={submittingStats}
                            onClick={() => {
                              const action = async () => {
                                try {
                                  setSubmittingStats(true);
                                  const sessStartIso = (activeSession.openedAt instanceof Timestamp ? activeSession.openedAt.toDate() : getBrasiliaTime()).toISOString();
                                  const q = query(
                                    collection(db, 'cash_movements'), 
                                    where('timestamp', '>=', sessStartIso),
                                    where('category', '==', 'venda')
                                  );
                                  const snap = await getDocs(q);
                                  const batch = writeBatch(db);
                                  snap.docs.forEach(d => batch.delete(d.ref));
                                  await batch.commit();
                                  alert('As estatísticas de venda da sessão foram resetadas!');
                                  setShowResetConfirm(false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Erro ao processar limpeza.');
                                } finally {
                                  setSubmittingStats(false);
                                }
                              };
                              setPendingAction(() => action);
                              setPasswordPromptTitle('Confirmar Ajuste de Fluxo');
                              setShowPasswordPrompt(true);
                            }}
                            className="px-4 py-2 bg-red-600 text-white text-[10px] font-black rounded-lg hover:bg-red-700 transition-colors uppercase flex items-center gap-2"
                          >
                            {submittingStats && <Loader2 className="w-3 h-3 animate-spin" />}
                            Sim, Zerar
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

            {!activeSession ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 rounded-[20px] border border-gray-100 shadow-xl flex flex-col items-center text-center space-y-6 mx-1"
              >
                <div className="w-20 h-20 bg-slate-50 rounded-[15px] flex items-center justify-center text-slate-300">
                  <Wallet className="w-10 h-10" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-primary uppercase">Caixa Fechado</h2>
                  <p className="text-slate-400 text-xs font-bold leading-relaxed px-4">O caixa ainda não foi aberto. Informe o saldo inicial para começar.</p>
                </div>
                
                <form onSubmit={handleOpenCash} className="w-full space-y-4">
                  <div className="space-y-1 text-left">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Saldo Inicial (R$)</label>
                    <input 
                      type="number"
                      step="0.01"
                      required
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      placeholder="Ex: 500,00"
                      className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-accent rounded-xl px-6 font-black text-slate-800 transition-all outline-none"
                    />
                  </div>
                  <button 
                    type="submit"
                    disabled={submitting}
                    className="w-full h-14 bg-accent text-white font-black rounded-xl shadow-xl shadow-accent/25 hover:translate-y-[-2px] active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase text-xs"
                  >
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <DollarSign className="w-5 h-5" />}
                    Abrir Caixa
                  </button>
                </form>
              </motion.div>
            ) : (
              <div className="space-y-6 px-1">
                <div className="space-y-4">
                  <StatBox label="Saldo em Dinheiro (Físico)" value={saldoAtual} icon={DollarSign} iconColor="text-white" active />
                  <div className="grid grid-cols-2 gap-4">
                    <StatBox label="Vendas do Dia" value={stats.totalSales} icon={TrendingUp} iconColor="text-gray-400" />
                    <StatBox label="Lucro de Hoje" value={stats.lucroHoje} icon={TrendingUp} iconColor="text-gray-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <StatBox label="Saldo de Abertura" value={activeSession.openingBalance} icon={Calculator} iconColor="text-gray-400" />
                    <StatBox label="Liquidez Total" value={saldoTotal} icon={Wallet} iconColor="text-teal-600" />
                  </div>
                </div>

                <div className="space-y-3">
                  <PaymentMethodRow label="Dinheiro" value={stats.dinheiroIn - stats.dinheiroOut} icon={DollarSign} />
                  <PaymentMethodRow label="PIX" value={stats.pixIn - stats.pixOut} icon={Smartphone} />
                  <PaymentMethodRow label="Cartão" value={stats.cartaoIn - stats.cartaoOut} icon={CreditCard} />
                </div>

                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="p-5 border-b border-gray-50 bg-gray-50/50">
                    <h3 className="text-sm font-black text-slate-800">Transações Recentes</h3>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
                    {movements.map((m) => {
                      const date = m.timestamp instanceof Timestamp ? m.timestamp.toDate() : new Date(m.timestamp);
                      return (
                        <div key={m.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-800">{m.category === 'venda' ? `Venda #${m.saleId?.slice(-4)}` : m.reason}</p>
                              {m.paymentMethod && (
                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded uppercase">
                                  {m.paymentMethod}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                              {m.category || (m.type === 'in' ? 'entrada' : 'saída')} · {format(date, "dd/MM/yyyy, HH:mm:ss")}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className={cn("text-sm font-black", m.type === 'in' ? "text-success" : "text-danger")}>
                              {m.type === 'in' ? '+' : '-'} {formatCurrency(m.amount)}
                            </p>
                            {profile?.role === 'admin' && (
                              <button 
                                onClick={() => handleDeleteMovement(m)}
                                className="p-2 text-slate-300 hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                                title="Excluir movimentação"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {movements.length === 0 && (
                      <div className="p-12 text-center text-slate-300">
                        <HistoryIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p className="text-xs font-black uppercase tracking-widest">Sem movimentos</p>
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  onClick={handleCloseCash}
                  disabled={submitting}
                  className="w-full py-4 bg-danger/5 hover:bg-danger/10 text-danger font-black rounded-2xl text-[10px] uppercase tracking-widest transition-all border border-danger/10 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Encerrar Expediente (Fechar Caixa)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 px-1">
            <div className="grid grid-cols-2 gap-4">
              <StatBox label="A Receber (Vendas)" value={pendingSales.reduce((acc, s) => acc + (s.paymentStatus === 'pending' ? (s.splitAmount1 || s.total) : 0) + (s.paymentStatus2 === 'pending' ? (s.splitAmount2 || 0) : 0), 0)} icon={ArrowUpRight} iconColor="text-teal-500" />
              <StatBox label="A Pagar (Compras)" value={pendingPurchases.reduce((acc, p) => acc + (p.paymentStatus === 'pending' ? (p.splitAmount1 || p.total) : 0) + (p.paymentStatus2 === 'pending' ? (p.splitAmount2 || 0) : 0), 0)} icon={Minus} iconColor="text-rose-500" />
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Entradas Futuras</h3>
                <span className="text-[10px] font-black text-teal-600 bg-teal-50 px-2 py-1 rounded-lg uppercase tracking-widest">Vendas</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
                {pendingSales.map((s) => (
                  <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{s.customerName || 'Cliente Direto'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        VENDA #{s.id.slice(-4)} · {format(new Date(s.timestamp), "dd/MM")}
                      </p>
                    </div>
                    <p className="text-sm font-black text-teal-600">
                      + {formatCurrency((s.paymentStatus === 'pending' ? (s.splitAmount1 || s.total) : 0) + (s.paymentStatus2 === 'pending' ? (s.splitAmount2 || 0) : 0))}
                    </p>
                  </div>
                ))}
                {pendingSales.length === 0 && (
                  <div className="p-8 text-center text-slate-300">
                    <p className="text-[10px] font-black uppercase tracking-widest">Sem vendas pendentes</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Saídas Futuras</h3>
                <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg uppercase tracking-widest">Compras</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto">
                {pendingPurchases.map((p) => (
                  <div key={p.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{p.supplierName || 'Fornecedor'}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                        COMPRA #{p.id.slice(-4)} · {format(new Date(p.timestamp), "dd/MM")}
                      </p>
                    </div>
                    <p className="text-sm font-black text-rose-600">
                      - {formatCurrency((p.paymentStatus === 'pending' ? (p.splitAmount1 || p.total) : 0) + (p.paymentStatus2 === 'pending' ? (p.splitAmount2 || 0) : 0))}
                    </p>
                  </div>
                ))}
                {pendingPurchases.length === 0 && (
                  <div className="p-8 text-center text-slate-300">
                    <p className="text-[10px] font-black uppercase tracking-widest">Sem compras pendentes</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCloseConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCloseConfirm(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-danger/10 rounded-full flex items-center justify-center text-danger mx-auto mb-4">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-primary uppercase mb-1">Fechar Caixa?</h3>
                <p className="text-slate-500 text-xs font-bold">
                  Saldo esperado: <span className="text-primary">{formatCurrency(saldoAtual)}</span>
                </p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Valor Real no Caixa (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    value={closingAmountReal}
                    onChange={(e) => setClosingAmountReal(e.target.value)}
                    placeholder={saldoAtual.toFixed(2)}
                    className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-danger/30 rounded-xl px-6 font-black text-slate-800 transition-all outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Observação (Opcional)</label>
                  <textarea 
                    rows={2}
                    value={closingNote}
                    onChange={(e) => setClosingNote(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-slate-200 rounded-xl p-4 font-bold text-slate-600 transition-all outline-none resize-none text-sm"
                    placeholder="Alguma observação sobre o fechamento?"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={confirmCloseCash}
                  disabled={submitting || !closingAmountReal}
                  className="w-full h-14 bg-danger text-white font-black rounded-xl shadow-xl shadow-danger/20 flex items-center justify-center gap-2 disabled:opacity-50 uppercase text-xs transition-all active:scale-95"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirmar Fechamento"}
                </button>
                <button 
                  onClick={() => setShowCloseConfirm(false)}
                  className="w-full h-10 text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {(showWithdrawalModal || showSupplyModal) && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setShowWithdrawalModal(false); setShowSupplyModal(false); }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    showWithdrawalModal ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                  )}>
                    {showWithdrawalModal ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-primary uppercase">{showWithdrawalModal ? 'Sangria' : 'Suprimento'}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      {showWithdrawalModal ? 'Retirar Dinheiro' : 'Adicionar Saldo'}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowWithdrawalModal(false); setShowSupplyModal(false); }}>
                  <X className="w-5 h-5 text-slate-300" />
                </button>
              </div>

              <form onSubmit={showWithdrawalModal ? handleWithdrawal : handleSupply} className="space-y-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Valor (R$)</label>
                  <input 
                    type="number"
                    step="0.01"
                    required
                    autoFocus
                    value={showWithdrawalModal ? withdrawalAmount : supplyAmount}
                    onChange={(e) => showWithdrawalModal ? setWithdrawalAmount(e.target.value) : setSupplyAmount(e.target.value)}
                    className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-accent/30 rounded-xl px-6 font-black text-slate-800 transition-all outline-none"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Descrição</label>
                  <textarea 
                    rows={2}
                    value={showWithdrawalModal ? withdrawalReason : supplyReason}
                    onChange={(e) => showWithdrawalModal ? setWithdrawalReason(e.target.value) : setSupplyReason(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-slate-200 rounded-xl p-4 font-bold text-slate-600 transition-all outline-none resize-none text-sm"
                    placeholder="Ex: Troco inicial, pagamento..."
                  />
                </div>

                <button 
                  type="submit"
                  disabled={submitting}
                  className={cn(
                    "w-full h-14 text-white font-black rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase text-xs",
                    showWithdrawalModal ? "bg-danger shadow-danger/25" : "bg-success shadow-success/25"
                  )}
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Confirmar {showWithdrawalModal ? 'Sangria' : 'Suprimento'}
                </button>
              </form>
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
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
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
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-2">{passwordPromptTitle}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Confirme sua senha de Admin para prosseguir</p>
              
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

function StatBox({ label, value, icon: Icon, iconColor, active }: any) {
  return (
    <div className={cn(
      "p-5 rounded-2xl border transition-all",
      active 
        ? "bg-[#0d9488] border-[#0d9488] shadow-lg shadow-teal-500/20" 
        : "bg-white border-gray-100 shadow-sm"
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className={cn(
          "text-[10px] font-bold uppercase tracking-tight",
          active ? "text-white/60" : "text-slate-400"
        )}>{label}</span>
        {active ? (
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
            <Icon className="w-4 h-4 text-white" />
          </div>
        ) : <Icon className={cn("w-4 h-4", iconColor)} />}
      </div>
      <p className={cn(
        "text-2xl font-black tracking-tighter",
        active ? "text-white" : "text-primary"
      )}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function PaymentMethodRow({ label, value, icon: Icon }: any) {
  return (
    <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-4 shadow-sm">
      <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300">
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
        <p className="text-base font-black text-slate-800">{formatCurrency(value)}</p>
      </div>
    </div>
  );
}


