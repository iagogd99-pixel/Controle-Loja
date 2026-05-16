import React, { useEffect, useState } from 'react';
import { 
  LayoutDashboard,
  Package, 
  TrendingUp, 
  ShoppingCart, 
  AlertTriangle, 
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Activity
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  onSnapshot
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { formatCurrency, cn } from '@/src/lib/utils';
import { Product, Sale, Movement } from '@/src/types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    salesCount: 0,
    dailyRevenue: 0,
    monthlyRevenue: 0,
    dailyProfit: 0,
    monthlyProfit: 0,
    dailyExpenses: 0,
    monthlyExpenses: 0,
    totalProfitMargin: 0
  });
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const unsubSalesToday = onSnapshot(query(collection(db, 'sales'), where('timestamp', '>=', today.toISOString())), (snapshot) => {
      const sales = snapshot.docs.map(doc => doc.data() as Sale);
      const revenue = sales.filter(s => s.status === 'completed').reduce((acc, sale) => acc + (sale.total || 0), 0);
      const cost = sales.filter(s => s.status === 'completed').reduce((acc, sale) => {
        return acc + (sale.items?.reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantity), 0) || 0);
      }, 0);
      
      setStats(prev => ({
        ...prev,
        salesCount: sales.length,
        dailyRevenue: revenue,
        dailyProfit: revenue - cost
      }));
    });

    const unsubExpensesToday = onSnapshot(query(collection(db, 'cash_movements'), where('timestamp', '>=', today.toISOString()), where('type', '==', 'out')), (snapshot) => {
      const total = snapshot.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      setStats(prev => ({ ...prev, dailyExpenses: total }));
    });

    const unsubSalesMonth = onSnapshot(query(collection(db, 'sales'), where('timestamp', '>=', startOfMonth.toISOString())), (snapshot) => {
      const sales = snapshot.docs.map(doc => doc.data() as Sale);
      const revenue = sales.filter(s => s.status === 'completed').reduce((acc, sale) => acc + (sale.total || 0), 0);
      const cost = sales.filter(s => s.status === 'completed').reduce((acc, sale) => {
        return acc + (sale.items?.reduce((itemAcc, item) => itemAcc + (item.costPrice * item.quantity), 0) || 0);
      }, 0);

      const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
      
      setStats(prev => ({
        ...prev,
        monthlyRevenue: revenue,
        monthlyProfit: revenue - cost,
        totalProfitMargin: margin
      }));
    });

    const unsubExpensesMonth = onSnapshot(query(collection(db, 'cash_movements'), where('timestamp', '>=', startOfMonth.toISOString()), where('type', '==', 'out')), (snapshot) => {
      const total = snapshot.docs.reduce((acc, doc) => acc + (doc.data().amount || 0), 0);
      setStats(prev => ({ ...prev, monthlyExpenses: total }));
    });

    // Recent items
    const qRecentSales = query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(5));
    const unsubRecentSales = onSnapshot(qRecentSales, (snapshot) => {
      setRecentSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
    });

    const qRecentMovements = query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(5));
    const unsubRecentMovements = onSnapshot(qRecentMovements, (snapshot) => {
      setRecentMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Movement)));
    });

    // Daily Sales Chart Data (Last 10 days)
    const last10DaysData = async () => {
      const data = [];
      const now = new Date();
      
      // We'll fetch sales from the last 10 days to group them
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      tenDaysAgo.setHours(0,0,0,0);

      const q = query(
        collection(db, 'sales'),
        where('timestamp', '>=', tenDaysAgo.toISOString()),
        where('status', '==', 'completed')
      );

      const querySnapshot = await getDocs(q);
      const salesByDay: { [key: string]: number } = {};

      querySnapshot.forEach((doc) => {
        const sale = doc.data() as Sale;
        const date = new Date(sale.timestamp);
        const dateKey = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        salesByDay[dateKey] = (salesByDay[dateKey] || 0) + (sale.total || 0);
      });

      for (let i = 9; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        
        data.push({ 
          name: dayLabel, 
          valor: salesByDay[dayLabel] || 0 
        });
      }
      setChartData(data);
    };
    last10DaysData();

    return () => {
      unsubSalesToday();
      unsubExpensesToday();
      unsubSalesMonth();
      unsubExpensesMonth();
      unsubRecentSales();
      unsubRecentMovements();
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Painel</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Visão Geral do Negócio</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] bg-white dark:bg-slate-900 px-3 py-1.5 rounded-full shadow-sm border border-gray-100 dark:border-slate-800 w-fit">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">Sync Online</span>
        </div>
      </div>

      {/* Daily & Monthly Financial Summary (Image Style) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 px-2">
        <FinancialSummaryCard 
          title="Caixa da Empresa"
          subtitle="Resumo financeiro do dia"
          receitas={stats.dailyRevenue}
          despesas={stats.dailyExpenses}
          lucro={stats.dailyProfit - stats.dailyExpenses}
          saldo={stats.dailyRevenue - stats.dailyExpenses}
        />
        <FinancialSummaryCard 
          title="Resumo Mensal"
          subtitle="Performance consolidada do mês"
          receitas={stats.monthlyRevenue}
          despesas={stats.monthlyExpenses}
          lucro={stats.monthlyProfit - stats.monthlyExpenses}
          saldo={stats.monthlyRevenue - stats.monthlyExpenses}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-2">
        <StatCard 
          title="Lucro Realizado" 
          value={formatCurrency(stats.monthlyProfit)} 
          icon={ShoppingCart} 
          color="bg-accent"
          trend={`Hoje: ${formatCurrency(stats.dailyProfit)}`}
        />
        <StatCard 
          title="Margem Total" 
          value={`${stats.totalProfitMargin.toFixed(1)}%`} 
          icon={TrendingUp} 
          color="bg-slate-800"
          trend="Lucro sobre receita"
        />
      </div>

      {/* Main Charts & Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Daily Sales Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 tracking-tight">Vendas Diárias</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Últimos 10 Dias</p>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <span className="w-2 h-2 bg-accent rounded-full" />
              <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase">Faturamento (R$)</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.1} />
                <XAxis 
                   dataKey="name" 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}
                   dy={10}
                 />
                 <YAxis 
                   axisLine={false} 
                   tickLine={false} 
                   width={45}
                   tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}
                   tickFormatter={(val) => `R$${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                 />
                 <Tooltip 
                   cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                   contentStyle={{ 
                     borderRadius: '8px', 
                     border: 'none', 
                     boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                     backgroundColor: '#0f172a',
                     padding: '12px'
                   }}
                   itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                   labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 'black', marginBottom: '4px', textTransform: 'uppercase' }}
                   formatter={(val: number) => [formatCurrency(val), 'Faturamento']}
                 />
                 <Bar 
                   dataKey="valor" 
                   fill="#3b82f6" 
                   radius={[3, 3, 0, 0]}
                   barSize={32}
                 />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Sales List */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex flex-col">
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-6">Vendas Recentes</h3>
          <div className="space-y-4 flex-1">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center gap-4 group">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{sale.customerName || 'Cliente Direto'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(sale.timestamp).toLocaleTimeString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(sale.total)}</p>
                  <p className={cn(
                    "text-[10px] font-bold uppercase",
                    sale.status === 'completed' ? "text-success" : "text-danger"
                  )}>
                    {sale.status === 'completed' ? 'PAGO' : 'CANCELADO'}
                  </p>
                </div>
              </div>
            ))}
            {recentSales.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 py-8">
                <Package className="w-12 h-12 mb-2 opacity-20" />
                <p>Nenhuma venda hoje</p>
              </div>
            )}
          </div>
          <button className="mt-6 w-full py-2 text-sm font-bold text-accent hover:bg-accent/5 rounded-lg transition-colors border border-accent/20">
            Ver todas as vendas
          </button>
        </div>
      </div>

      {/* Stock Alerts & Movements */}
      <div className="grid grid-cols-1 gap-8 px-2">
         <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Últimas Movimentações
            </h3>
            <div className="space-y-4">
              {recentMovements.map((mov) => (
                <div key={mov.id} className="flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 p-2 rounded-xl transition-colors">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    mov.type === 'in' ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                  )}>
                    {mov.type === 'in' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{mov.productName}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{mov.userName} • {mov.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-bold text-slate-900 dark:text-slate-100", mov.type === 'in' ? "text-success" : "text-danger")}>
                      {mov.type === 'in' ? '+' : '-'}{mov.quantity}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(mov.timestamp).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
         </div>
      </div>
    </div>
  );
}

function FinancialSummaryCard({ title, subtitle, receitas, despesas, lucro, saldo }: any) {
  return (
    <div className="bg-[#0d9488] p-8 rounded-[20px] shadow-xl text-white space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-white/10 rounded-lg flex items-center justify-center">
          <Wallet className="w-7 h-7 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          <p className="text-white/60 text-xs font-bold leading-none mt-1">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Receitas */}
        <div className="bg-white/10 p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight className="w-4 h-4 text-white/60" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Receitas</span>
          </div>
          <p className="text-xl font-black">{formatCurrency(receitas)}</p>
        </div>

        {/* Despesas */}
        <div className="bg-white/10 p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5">
            <ArrowDownRight className="w-4 h-4 text-white/60" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Despesas</span>
          </div>
          <p className="text-xl font-black">{formatCurrency(despesas)}</p>
        </div>

        {/* Lucro */}
        <div className="bg-white/10 p-5 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-white/60" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Lucro</span>
          </div>
          <p className="text-xl font-black">{formatCurrency(lucro)}</p>
        </div>

        {/* Saldo do Dia */}
        <div className="bg-white/10 p-5 rounded-xl border border-white/20 space-y-2">
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-white/60" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Saldo</span>
          </div>
          <p className="text-xl font-black">{formatCurrency(saldo)}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color, trend, isWarning }: any) {
  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-white dark:bg-slate-900 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 relative overflow-hidden group transition-colors duration-300"
    >
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{title}</p>
          <h3 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{value}</h3>
          <p className={cn("text-[9px] mt-1.5 font-bold uppercase tracking-tight", isWarning ? "text-danger" : "text-slate-400 dark:text-slate-500")}>
            {trend}
          </p>
        </div>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-xl transition-transform group-hover:scale-110", color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="absolute -bottom-1 -right-1 opacity-[0.02] dark:opacity-[0.05] scale-150 rotate-12 transition-transform group-hover:rotate-0">
        <Icon className="w-16 h-16" />
      </div>
    </motion.div>
  );
}
