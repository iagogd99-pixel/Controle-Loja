import React, { useState, useEffect } from 'react';
import { 
  FileBarChart,
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  FileText,
  Calendar,
  Filter,
  TrendingUp,
  Package,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  Loader2,
  DollarSign,
  Users,
  CheckCircle2,
  History,
  ShoppingBag,
  ArrowDownRight,
  Percent,
  Briefcase,
  Clock,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Layers,
  Inbox,
  UserCheck
} from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { formatCurrency, formatDate, cn, getBrasiliaTime } from '@/src/lib/utils';
import { Sale, Product, Purchase } from '@/src/types';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell
} from 'recharts';

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

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // Tabs and view filters
  const [activeTab, setActiveTab] = useState<'geral' | 'vendas' | 'estoque' | 'caixa'>('geral');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last_month' | 'custom'>('all');
  
  // Custom dates
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch all collections on component mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const salesSnap = await getDocs(query(collection(db, 'sales'), orderBy('timestamp', 'desc')));
        const productsSnap = await getDocs(collection(db, 'products'));
        const purchasesSnap = await getDocs(query(collection(db, 'purchases'), orderBy('timestamp', 'desc')));
        const cashMovementsSnap = await getDocs(query(collection(db, 'cash_movements'), orderBy('timestamp', 'desc')));
        
        setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
        setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
        setPurchases(purchasesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Purchase)));
        setCashMovements(cashMovementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as CashMovement)));
      } catch (err) {
        console.error("Erro ao carregar dados dos relatórios:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter checker
  const isWithinPeriod = (timestampStr: string) => {
    if (!timestampStr) return false;
    const date = new Date(timestampStr);
    const now = getBrasiliaTime();
    
    // Set hours to 0 to compare days easily
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const startOfToday = today.getTime();
    
    switch (timeFilter) {
      case 'today':
        return date.getTime() >= startOfToday;
      case 'yesterday': {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return date.getTime() >= yesterday.getTime() && date.getTime() < startOfToday;
      }
      case '7d': {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return date.getTime() >= sevenDaysAgo.getTime();
      }
      case '30d': {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return date.getTime() >= thirtyDaysAgo.getTime();
      }
      case 'month':
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      case 'last_month': {
        let prevMonth = now.getMonth() - 1;
        let prevYear = now.getFullYear();
        if (prevMonth < 0) {
          prevMonth = 11;
          prevYear -= 1;
        }
        return date.getMonth() === prevMonth && date.getFullYear() === prevYear;
      }
      case 'custom': {
        if (!startDate) return true;
        const start = new Date(startDate + 'T00:00:00');
        const end = endDate ? new Date(endDate + 'T23:59:59') : new Date();
        return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
      }
      case 'all':
      default:
        return true;
    }
  };

  // Dynamic calculations based on filters
  const periodSales = sales.filter(s => s.status !== 'cancelled' && isWithinPeriod(s.timestamp));
  const periodCancelledSales = sales.filter(s => s.status === 'cancelled' && isWithinPeriod(s.timestamp));
  const periodCashIn = cashMovements.filter(m => m.type === 'in' && isWithinPeriod(m.timestamp));
  const periodCashOut = cashMovements.filter(m => m.type === 'out' && isWithinPeriod(m.timestamp));
  const periodPurchases = purchases.filter(p => isWithinPeriod(p.timestamp));

  // --- TAB 1 METRICS ---
  const faturamentoTotal = periodSales.reduce((acc, s) => acc + s.total, 0);
  const cancelamentosTotal = periodCancelledSales.reduce((acc, s) => acc + s.total, 0);
  
  // Cost of Goods Sold (CMV)
  const cmvTotal = periodSales.reduce((acc, s) => {
    const saleCost = s.items?.reduce((itemAcc, item) => itemAcc + ((item.costPrice || 0) * item.quantity), 0) || 0;
    return acc + saleCost;
  }, 0);

  // Estimado Profit margins
  const lucroBrutoEstimado = faturamentoTotal - cmvTotal;
  const margemLucroBruto = faturamentoTotal > 0 ? (lucroBrutoEstimado / faturamentoTotal) * 100 : 0;
  const ticketMedio = periodSales.length > 0 ? faturamentoTotal / periodSales.length : 0;

  // Real Cash Flow Metrics
  const totalCashReceived = periodCashIn.reduce((acc, m) => acc + m.amount, 0);
  const totalCashPaid = periodCashOut.reduce((acc, m) => acc + m.amount, 0);
  const saldoCaixaReal = totalCashReceived - totalCashPaid;

  // Group outflows by category
  const despesasEstoque = periodCashOut.filter(m => m.category === 'compra').reduce((acc, m) => acc + m.amount, 0);
  const despesasOperacionaisField = periodCashOut.filter(m => m.category === 'despesa').reduce((acc, m) => acc + m.amount, 0);
  const despesasSangria = periodCashOut.filter(m => m.category === 'sangria').reduce((acc, m) => acc + m.amount, 0);
  const despesasOutros = periodCashOut.filter(m => m.category !== 'compra' && m.category !== 'despesa' && m.category !== 'sangria').reduce((acc, m) => acc + m.amount, 0);

  // --- TAB 2 METRICS (SALES) ---
  // Preferred payment methods
  const methodsMap: Record<string, number> = {};
  periodSales.forEach(s => {
    if (s.isSplitPayment) {
      const m1 = (s.paymentMethod || 'Dinheiro').toUpperCase();
      const m2 = (s.paymentMethod2 || 'Dinheiro').toUpperCase();
      methodsMap[m1] = (methodsMap[m1] || 0) + (s.splitAmount1 || 0);
      methodsMap[m2] = (methodsMap[m2] || 0) + (s.splitAmount2 || 0);
    } else {
      const m1 = (s.paymentMethod || 'Dinheiro').toUpperCase();
      methodsMap[m1] = (methodsMap[m1] || 0) + s.total;
    }
  });
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];
  const paymentMethodsList = Object.entries(methodsMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

  // Sales per seller
  const sellerMap: Record<string, { name: string; total: number; count: number }> = {};
  periodSales.forEach(s => {
    const sellerId = s.userId || 'unknown';
    const sellerName = s.userName || 'Outro';
    if (!sellerMap[sellerId]) {
      sellerMap[sellerId] = { name: sellerName, total: 0, count: 0 };
    }
    sellerMap[sellerId].total += s.total;
    sellerMap[sellerId].count += 1;
  });
  const sellerRanking = Object.values(sellerMap).sort((a,b) => b.total - a.total);

  // Top Customers
  const customerMap: Record<string, { id: string; name: string; total: number; count: number }> = {};
  periodSales.forEach(s => {
    const customerId = s.clientId || 'default';
    const customerName = s.customerName || 'Consumidor Final';
    if (!customerMap[customerId]) {
      customerMap[customerId] = { id: customerId, name: customerName, total: 0, count: 0 };
    }
    customerMap[customerId].total += s.total;
    customerMap[customerId].count += 1;
  });
  const customerRanking = Object.values(customerMap).filter(c => c.id !== 'default').sort((a,b) => b.total - a.total).slice(0, 5);

  // --- TAB 3 METRICS (PRODUCTS) ---
  // Best Sellers
  const itemsMap: Record<string, { id: string; name: string; sku: string; quantity: number; revenue: number; costPrice: number }> = {};
  periodSales.forEach(s => {
    s.items?.forEach(item => {
      const pId = item.productId;
      if (!itemsMap[pId]) {
        itemsMap[pId] = { 
          id: pId, 
          name: item.name, 
          sku: item.sku || '', 
          quantity: 0, 
          revenue: 0,
          costPrice: item.costPrice || 0
        };
      }
      itemsMap[pId].quantity += item.quantity;
      itemsMap[pId].revenue += item.total || (item.price * item.quantity);
    });
  });
  const bestSellers = Object.values(itemsMap).sort((a, b) => b.quantity - a.quantity);

  // Dead Stock (Products with literally raw zero sales during period)
  const activeProducts = products.filter(p => p.status === 'active');
  const productsWithoutSales = activeProducts.filter(p => !itemsMap[p.id]).map(p => {
    const inventoryCost = p.stock * p.costPrice;
    const potentialValue = p.stock * p.salePrice;
    return {
      ...p,
      inventoryCost,
      potentialValue
    };
  }).sort((a,b) => b.stock - a.stock);

  // Low stock counts
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  // Total Portfolio Equity
  const totalInventoryStock = products.reduce((acc, p) => acc + p.stock, 0);
  const totalCostValue = products.reduce((acc, p) => acc + (p.stock * p.costPrice), 0);
  const totalSaleValue = products.reduce((acc, p) => acc + (p.stock * p.salePrice), 0);
  const potentialRemainingProfit = totalSaleValue - totalCostValue;

  // --- TAB 4 METRICS (CASH FLOW / OUTFLOWS BREAKDOWN) ---
  const expenseCategories = [
    { name: 'Estoque (Compras)', value: despesasEstoque, color: '#f59e0b', percent: totalCashPaid > 0 ? (despesasEstoque / totalCashPaid) * 100 : 0 },
    { name: 'Despesas S-staff/Operacional', value: despesasOperacionaisField, color: '#3b82f6', percent: totalCashPaid > 0 ? (despesasOperacionaisField / totalCashPaid) * 100 : 0 },
    { name: 'Sangrias / Retiradas', value: despesasSangria, color: '#ef4444', percent: totalCashPaid > 0 ? (despesasSangria / totalCashPaid) * 100 : 0 },
    { name: 'Outras Saídas', value: despesasOutros, color: '#8b5cf6', percent: totalCashPaid > 0 ? (despesasOutros / totalCashPaid) * 100 : 0 },
  ].filter(c => c.value > 0).sort((a,b) => b.value - a.value);

  // Chart Data Generator
  const getChartData = () => {
    const dateMap: Record<string, { faturamento: number; entradas: number; saidas: number; dateStr: string }> = {};
    
    // Period sales
    const sortedSales = [...periodSales].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sortedInflows = [...periodCashIn].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const sortedOutflows = [...periodCashOut].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    const getShortDate = (timestampStr: string) => {
      try {
        const d = new Date(timestampStr);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      } catch {
        return '';
      }
    };

    sortedSales.forEach(s => {
      const dateKey = getShortDate(s.timestamp);
      if (!dateKey) return;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { faturamento: 0, entradas: 0, saidas: 0, dateStr: dateKey };
      }
      dateMap[dateKey].faturamento += s.total;
    });

    sortedInflows.forEach(m => {
      const dateKey = getShortDate(m.timestamp);
      if (!dateKey) return;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { faturamento: 0, entradas: 0, saidas: 0, dateStr: dateKey };
      }
      dateMap[dateKey].entradas += m.amount;
    });

    sortedOutflows.forEach(m => {
      const dateKey = getShortDate(m.timestamp);
      if (!dateKey) return;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { faturamento: 0, entradas: 0, saidas: 0, dateStr: dateKey };
      }
      dateMap[dateKey].saidas += m.amount;
    });

    const list = Object.values(dateMap);
    if (list.length === 0) {
      return [{ dateStr: 'Sem dados', faturamento: 0, entradas: 0, saidas: 0 }];
    }
    return list;
  };

  const chartData = getChartData();

  // Excel multidoc output download
  const exportMultiSheetExcel = () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // 1. DRE Sheet
      const dreData = [
        ["DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE) SIMPLIFICADA", ""],
        ["Período:", timeFilter.toUpperCase()],
        ["Gerado em:", new Date().toLocaleDateString('pt-BR')],
        ["", ""],
        ["Conta Contábil", "Valor (R$)"],
        ["(+) RECEITAS BRUTAS DE VENDAS", faturamentoTotal],
        ["(-) CMV (CUSTO DAS MERCADORIAS VENDIDAS)", cmvTotal],
        ["(=) LUCRO OPERACIONAL ESTIMADO", lucroBrutoEstimado],
        ["", ""],
        ["(-) EXCLUSÕES GERAIS E EXPENSAS REAIS NO CAIXA", ""],
        ["(-) Aquisição de Estoque (Compras Pagas)", despesasEstoque],
        ["(-) Despesas Operacionais Gerais", despesasOperacionaisField],
        ["(-) Sangrias de Caixa Realizadas", despesasSangria],
        ["(-) Outras Despesas", despesasOutros],
        ["(=) RESULTADO FINANCEIRO LÍQUIDO", faturamentoTotal - cmvTotal - despesasOperacionaisField - despesasEstoque - despesasSangria - despesasOutros]
      ];
      const wsDRE = XLSX.utils.aoa_to_sheet(dreData);
      XLSX.utils.book_append_sheet(wb, wsDRE, "DRE e Financeiro");

      // 2. Sales Sheet
      const wsSales = XLSX.utils.json_to_sheet(periodSales.map(s => ({
        ID_Venda: s.id,
        Data: formatDate(s.timestamp),
        ClienteName: s.customerName || 'Consumidor Final',
        Subtotal: s.subtotal || s.total,
        Desconto: s.discount || 0,
        Total_Bruto: s.total,
        Metodo_Pagamento: s.paymentMethod,
        Vendedor: s.userName
      })));
      XLSX.utils.book_append_sheet(wb, wsSales, "Vendas no Período");

      // 3. Best Sellers Sheet
      const wsBestSellers = XLSX.utils.json_to_sheet(bestSellers.map((p, idx) => ({
        Ranking: idx + 1,
        Nome_Produto: p.name,
        SKU: p.sku,
        Unidades_Vendidas: p.quantity,
        Faturamento_Gerado: p.revenue,
        Custo_Produto: p.costPrice * p.quantity,
        Retorno_MarginalBruto: p.revenue - (p.costPrice * p.quantity)
      })));
      XLSX.utils.book_append_sheet(wb, wsBestSellers, "Produtos Mais Vendidos");

      // 4. Dead Stock Sheet
      const wsDeadStock = XLSX.utils.json_to_sheet(productsWithoutSales.map(p => ({
        Produto: p.name,
        SKU: p.sku,
        Categoria: p.category,
        Estoque_Peças: p.stock,
        Custo_Unitario: p.costPrice,
        Preço_Venda: p.salePrice,
        Custo_Investido: p.inventoryCost,
        Retorno_Potencial: p.potentialValue
      })));
      XLSX.utils.book_append_sheet(wb, wsDeadStock, "Produtos Sem Giro");

      XLSX.writeFile(wb, `Planilha_Corporativa_${timeFilter}_${getBrasiliaTime().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Erro ao exportar planilha:", err);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59);
      doc.text('Relatório Executivo Empresarial', 14, 22);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Período analisado: ${timeFilter.toUpperCase()} | Gerado em: ${getBrasiliaTime().toLocaleString('pt-BR')}`, 14, 29);

      let y = 38;
      doc.setDrawColor(226, 232, 240);
      doc.line(14, y, 196, y);
      y += 10;

      // Overview
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text('1. Demonstração de Resultados (DRE)', 14, y);
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Faturamento Bruto Comercial: ${formatCurrency(faturamentoTotal)}`, 14, y);
      y += 6;
      doc.text(`Custo das Mercadorias Vendidas (CMV): ${formatCurrency(cmvTotal)}`, 14, y);
      y += 6;
      doc.setFont("helvetica", "bold");
      doc.text(`Lucro Bruto Operacional: ${formatCurrency(lucroBrutoEstimado)} (${margemLucroBruto.toFixed(1)}% Margem)`, 14, y);
      y += 10;

      // Expenses
      doc.setFont("helvetica", "bold");
      doc.text('Despesas Reais do Período (Movimentações de Caixa):', 14, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.text(`- Compras de Estoque pagas: ${formatCurrency(despesasEstoque)}`, 18, y); y += 6;
      doc.text(`- Despesas Administrativas/Operacionais: ${formatCurrency(despesasOperacionaisField)}`, 18, y); y += 6;
      doc.text(`- Sangrias / Retiradas: ${formatCurrency(despesasSangria)}`, 18, y); y += 6;
      doc.text(`- Outros Debitos: ${formatCurrency(despesasOutros)}`, 18, y); y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y - 1, 182, 9, "F");
      doc.setTextColor(15, 23, 42);
      doc.text(`RESULTADO FINANCEIRO LÍQUIDO DOS EXPANDIDOS: ${formatCurrency(faturamentoTotal - cmvTotal - despesasOperacionaisField - despesasEstoque - despesasSangria - despesasOutros)}`, 16, y + 5);
      y += 18;

      // Best sellers table header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 41, 59);
      doc.text('2. Melhores Produtos Vendidos (Top 5)', 14, y);
      y += 8;

      doc.setFontSize(9);
      doc.text('Produto (SKU)', 14, y);
      doc.text('Unidades', 120, y);
      doc.text('Recebimento Bruto', 150, y);
      doc.line(14, y + 2, 196, y + 2);
      y += 8;

      bestSellers.slice(0, 5).forEach(p => {
        doc.setFont("helvetica", "normal");
        doc.text(`${p.name.substring(0, 45)} (${p.sku})`, 14, y);
        doc.text(`${p.quantity} peças`, 120, y);
        doc.text(`${formatCurrency(p.revenue)}`, 150, y);
        y += 6;
      });

      doc.save(`Corporate_PDF_Review_${timeFilter}_${getBrasiliaTime().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-sm font-black text-slate-500 uppercase tracking-widest animate-pulse">
          Gerando Analíticos Corporativos...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 pb-12 px-2 sm:px-4">
      {/* HEADER SECTION WITH FILTER */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 md:gap-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-primary/5 rounded-xl flex items-center justify-center text-primary shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight leading-none">BI & Relatórios Corporativos</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-black tracking-widest mt-1.5 flex items-center flex-wrap gap-1.5">
              <span>Auditoria Geral e Métricas de Performance</span>
              <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            </p>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 bg-white p-3 md:p-3.5 rounded-2xl sm:rounded-3xl border border-slate-100 shadow-sm w-full xl:w-auto">
          <div className="flex items-center gap-2 bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="text-xs font-black uppercase tracking-tight text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-8 w-full block focus:outline-none"
            >
              <option value="all">Todas as Datas (~Tudo)</option>
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="month">Este Mês</option>
              <option value="last_month">Mês Passado</option>
              <option value="custom">Período Customizado</option>
            </select>
          </div>

          {timeFilter === 'custom' && (
            <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-3.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:ring-1 focus:ring-primary w-full max-w-[130px]"
              />
              <span className="text-[10px] text-slate-400 font-extrabold uppercase shrink-0">Até</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs font-bold text-slate-600 bg-slate-50 border border-slate-200 p-1.5 rounded-xl focus:ring-1 focus:ring-primary w-full max-w-[130px]"
              />
            </div>
          )}

          <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-slate-100 pt-3 sm:pt-0 sm:pl-3.5 w-full sm:w-auto">
            <button
              onClick={exportMultiSheetExcel}
              disabled={isExporting}
              className="flex-1 sm:flex-initial justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider py-2 md:py-2.5 px-3 rounded-xl flex items-center gap-1.5 border border-emerald-100 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Planilha BI</span>
            </button>
            <button
              onClick={exportToPDF}
              disabled={isExporting}
              className="flex-1 sm:flex-initial justify-center bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white transition-all text-[10px] font-black uppercase tracking-wider py-2 md:py-2.5 px-3 rounded-xl flex items-center gap-1.5 border border-rose-100 cursor-pointer disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">PDF Executivo</span>
            </button>
          </div>
        </div>
      </div>

      {/* TABS INTERFACE */}
      <div className="grid grid-cols-2 md:flex bg-white rounded-2xl border border-slate-100 p-1 shadow-sm w-full md:max-w-3xl gap-1 md:gap-0">
        <button
          onClick={() => setActiveTab('geral')}
          className={cn(
            "py-2.5 md:py-3 px-2 text-[10px] sm:text-xs font-black uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 md:gap-2 transition-all cursor-pointer md:flex-1",
            activeTab === 'geral' ? "bg-primary text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <TrendingUp className="w-4 h-4 shrink-0" /> <span className="truncate">Geral & DRE</span>
        </button>
        <button
          onClick={() => setActiveTab('vendas')}
          className={cn(
            "py-2.5 md:py-3 px-2 text-[10px] sm:text-xs font-black uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 md:gap-2 transition-all cursor-pointer md:flex-1",
            activeTab === 'vendas' ? "bg-primary text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <DollarSign className="w-4 h-4 shrink-0" /> <span className="truncate">Vendas & Clientes</span>
        </button>
        <button
          onClick={() => setActiveTab('estoque')}
          className={cn(
            "py-2.5 md:py-3 px-2 text-[10px] sm:text-xs font-black uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 md:gap-2 transition-all cursor-pointer md:flex-1",
            activeTab === 'estoque' ? "bg-primary text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <Package className="w-4 h-4 shrink-0" /> <span className="truncate">Produtos & Estoque</span>
        </button>
        <button
          onClick={() => setActiveTab('caixa')}
          className={cn(
            "py-2.5 md:py-3 px-2 text-[10px] sm:text-xs font-black uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 md:gap-2 transition-all cursor-pointer md:flex-1",
            activeTab === 'caixa' ? "bg-primary text-white shadow-md" : "text-slate-500 hover:bg-slate-50"
          )}
        >
          <History className="w-4 h-4 shrink-0" /> <span className="truncate">Despesas & Fluxo</span>
        </button>
      </div>

      {/* ACTIVE TAB RENDER */}
      {activeTab === 'geral' && (
        <React.Fragment>
          {/* STATS HIGHLIGHT GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="p-5 md:p-6 bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-[1.01] transition-transform">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Receita Bruto (Vendas)</span>
                <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500 shadow-inner">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
                  {formatCurrency(faturamentoTotal)}
                </h4>
                <p className="text-[9px] text-[#94a3b8] font-bold uppercase mt-1">
                  {periodSales.length} transações concluídas
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6 bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-[1.01] transition-transform">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Custo Total (CMV)</span>
                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500 shadow-inner">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
                  {formatCurrency(cmvTotal)}
                </h4>
                <p className="text-[9px] text-amber-500 font-extrabold uppercase mt-1">
                  {faturamentoTotal > 0 ? ((cmvTotal / faturamentoTotal)*100).toFixed(1) : 0}% peso s/ receita
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6 bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-[1.01] transition-transform">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Resultado Operacional</span>
                <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-500 shadow-inner">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-black text-[#3b82f6] tracking-tight font-sans">
                  {formatCurrency(lucroBrutoEstimado)}
                </h4>
                <p className="text-[9px] text-blue-500 font-extrabold uppercase mt-1">
                  {margemLucroBruto.toFixed(1)}% margem bruta
                </p>
              </div>
            </div>

            <div className="p-5 md:p-6 bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-[1.01] transition-transform">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ticket Médio Geral</span>
                <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500 shadow-inner">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h4 className="text-2xl font-black text-slate-800 tracking-tight font-sans">
                  {formatCurrency(ticketMedio)}
                </h4>
                <p className="text-[9px] text-[#94a3b8] font-bold uppercase mt-1">
                  Média de consumo p/ pedido
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* DRE SIMPLIFICADO TABULAR SHEET */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Demonstração do Resultado (DRE) Simplificada
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Estrutura contábil sintética de rendimentos e despesas operacionais
                </p>
              </div>

              <div className="border border-slate-100 rounded-2xl shadow-inner overflow-x-auto bg-white">
                <table className="w-full min-w-[500px] text-xs text-left text-slate-600">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4 font-black">Estrutura de Resultados</th>
                      <th className="py-3 px-4 font-black text-right">Montante Equivalente (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-emerald-600 font-extrabold">
                        (+) RECEITA BRUTA COMERCIAL (Vendas Concluídas)
                      </td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-extrabold">
                        {formatCurrency(faturamentoTotal)}
                      </td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-red-500 font-semibold pl-6">
                        (-) Custo das Mercadorias Vendidas (CMV de Aquisição)
                      </td>
                      <td className="py-3 px-4 text-right text-red-500 font-semibold">
                        -{formatCurrency(cmvTotal)}
                      </td>
                    </tr>
                    <tr className="bg-slate-50/80 font-black border-y border-slate-100">
                      <td className="py-3.5 px-4 text-slate-800">
                        (=) RESULTADO OPERACIONAL COMPILADO (LUCRO BRUTO)
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-800">
                        {formatCurrency(lucroBrutoEstimado)}
                      </td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 pl-6">
                        (-) Aquisições Reais de Estoque (Compras Pagas no Caixa)
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        -{formatCurrency(despesasEstoque)}
                      </td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 pl-6">
                        (-) Despesas A-staff / Administrativas e Operacionais
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        -{formatCurrency(despesasOperacionaisField)}
                      </td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 pl-6">
                        (-) Sangrias / Retiradas de Caixa Administrativas
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        -{formatCurrency(despesasSangria)}
                      </td>
                    </tr>
                    <tr className="bg-white hover:bg-slate-50/50">
                      <td className="py-3 px-4 text-slate-500 pl-6">
                        (-) Outras Saídas Gerais Não Informadas
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        -{formatCurrency(despesasOutros)}
                      </td>
                    </tr>
                    <tr className={cn(
                      "font-black text-sm border-t border-double border-slate-300 py-4",
                      (faturamentoTotal - cmvTotal - despesasOperacionaisField - despesasEstoque - despesasSangria - despesasOutros) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    )}>
                      <td className="py-4 px-4 uppercase font-black">
                        (=) RESULTADO FINANCEIRO LÍQUIDO DO NEGÓCIO
                      </td>
                      <td className="py-4 px-4 text-right font-black">
                        {formatCurrency(faturamentoTotal - cmvTotal - despesasOperacionaisField - despesasEstoque - despesasSangria - despesasOutros)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-[#f8fafc] border border-slate-200/60 p-4 rounded-2xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-[#475569] shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-500 font-bold leading-normal uppercase">
                  Nota contábil: O DRE relaciona faturamento (receita imputada por notas/vendas no período) compensada com despesas operacionais realizadas no caixa de forma coerente com o regime de competência parcial acumulado.
                </p>
              </div>
            </div>

            {/* REAL CASH BALANCES BOX */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Caixa Operacional Real
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Demonstração em tempo real das movimentações financeiras
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl">
                  <p className="text-[9px] font-black text-emerald-500 uppercase">Total de Entradas no Periodo</p>
                  <p className="text-xl font-black text-emerald-600 mt-1">{formatCurrency(totalCashReceived)}</p>
                </div>

                <div className="p-4 bg-rose-50/60 border border-rose-100 rounded-2xl">
                  <p className="text-[9px] font-black text-rose-500 uppercase">Total de Saídas no Periodo</p>
                  <p className="text-xl font-black text-rose-600 mt-1">{formatCurrency(totalCashPaid)}</p>
                </div>

                <div className="p-4 bg-[#f8fafc] border border-slate-200/80 rounded-2xl">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Saldo de Caixa Final (Sintético)</p>
                  <p className={cn(
                    "text-xl font-black mt-1",
                    saldoCaixaReal >= 0 ? "text-[#1e293b]" : "text-rose-600"
                  )}>
                    {formatCurrency(saldoCaixaReal)}
                  </p>
                </div>
              </div>

              <div className="border border-slate-100 rounded-2xl p-4 bg-amber-50/10 border-amber-200 border-dashed space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-500 uppercase">Notas a Pagar Pendentes</span>
                  <span className="font-black text-amber-600">{formatCurrency(periodPurchases.filter(p => p.paymentStatus === 'pending').reduce((acc,p)=>acc+p.total, 0))}</span>
                </div>
                <div className="flex justify-between items-center text-[10px]">
                  <span className="font-bold text-slate-500 uppercase">Vendas em Aberto a Receber</span>
                  <span className="font-black text-[#3b82f6]">{formatCurrency(periodSales.filter(s => s.paymentStatus === 'pending').reduce((acc,s)=>acc+s.total, 0))}</span>
                </div>
              </div>
            </div>
          </div>

          {/* HISTORICAL REVENUE TREND AREA CHART */}
          <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                Volume de Faturamento vs Movimentações Diárias
              </h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                Curva de entradas, faturamento bruto de vendas e saídas por dia letivo
              </p>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="dateStr" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    tickFormatter={(val) => `R$ ${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid #e2e8f0', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)',
                      backgroundColor: '#ffffff',
                      padding: '12px'
                    }}
                    labelStyle={{ color: '#0f172a', fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}
                    formatter={(val: number) => [formatCurrency(val)]}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold', color: '#64748b' }} />
                  <Area type="monotone" name="Faturamento de Notas" dataKey="faturamento" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorFaturamento)" />
                  <Area type="monotone" name="Fluxo Entradas" dataKey="entradas" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEntradas)" />
                  <Area type="monotone" name="Fluxo Saídas" dataKey="saidas" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorSaidas)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </React.Fragment>
      )}

      {activeTab === 'vendas' && (
        <React.Fragment>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* PAYMENT METHODS POPULARITY */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Métodos de Pagamento Priorizados
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Meios de recebimento ponderados por volume financeiro total
                </p>
              </div>

              {paymentMethodsList.length === 0 ? (
                <div className="py-12 text-center text-slate-350">
                  <p className="text-xs font-bold font-sans">Sem movimentação de vendas registradas.</p>
                </div>
              ) : (
                <React.Fragment>
                  <div className="h-60 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentMethodsList}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {paymentMethodsList.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => [formatCurrency(val), 'Volume']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-3">
                    {paymentMethodsList.map((p, idx) => (
                      <div key={p.name} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{p.name}</span>
                        </div>
                        <span className="text-xs font-black text-slate-800 tracking-tight font-sans">
                          {formatCurrency(p.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              )}
            </div>

            {/* SELLER RANKINGS AND CLIENT ANALYTICS */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6 flex flex-col justify-between">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                    Ranking de Atendimentos & Staff
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                    Metas de volume financeiro faturado sob a gestão de cada vendedor
                  </p>
                </div>

                <div className="space-y-4">
                  {sellerRanking.length === 0 ? (
                    <div className="py-8 text-center text-slate-350">
                      <p className="text-xs font-bold font-sans">Nenhum atendimento listado p/ o período.</p>
                    </div>
                  ) : (
                    sellerRanking.map((s, idx) => {
                      const percentageOfBest = sellerRanking[0].total > 0 ? (s.total / sellerRanking[0].total) * 100 : 0;
                      return (
                        <div key={s.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-black uppercase text-white shadow-sm",
                                idx === 0 ? "bg-amber-500 animate-pulse" : idx === 1 ? "bg-slate-400" : "bg-slate-300"
                              )}>
                                {idx + 1}°
                              </span>
                              <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{s.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-black text-slate-800 tracking-tight">{formatCurrency(s.total)}</span>
                              <p className="text-[8px] font-black text-[#94a3b8] uppercase tracking-wider">{s.count} vendas</p>
                            </div>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                            <div className="bg-primary h-full transition-all duration-500" style={{ width: `${percentageOfBest}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* CLIENT EXECUTORS LIST */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Clientes mais Reincidentes no Período (Top 5)
                  </h3>
                  <p className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">
                    Volume acumulado de compras realizadas por clientes cadastrados
                  </p>
                </div>

                {customerRanking.length === 0 ? (
                  <p className="text-[10px] text-slate-400 italic">Sem registros relevantes para o período.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customerRanking.map((c) => (
                      <div key={c.id} className="p-3 bg-[#f8fafc] border border-slate-100 rounded-xl flex justify-between items-center">
                        <div>
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight truncate max-w-[140px]">{c.name}</p>
                          <span className="text-[8px] text-slate-400 font-extrabold uppercase">{c.count} compras realizadas</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-800 tracking-tight font-mono">
                          {formatCurrency(c.total)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </React.Fragment>
      )}

      {activeTab === 'estoque' && (
        <React.Fragment>
          {/* ASSET PORTFOLIO BANNER */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Patrimônio de Estoque
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Consolidação do balanço geral do estoque ativo atualmente
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-120 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">Peças Estocadas</span>
                    <p className="text-xl font-black text-slate-800 mt-1">{totalInventoryStock} un.</p>
                  </div>
                  <Package className="w-8 h-8 text-slate-200" />
                </div>

                <div className="p-4 bg-amber-50/20 border border-amber-200/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black text-amber-500 uppercase">Patrimônio Custo</span>
                    <p className="text-xl font-black text-amber-600 mt-1">{formatCurrency(totalCostValue)}</p>
                  </div>
                  <TrendingDown className="w-8 h-8 text-amber-300" />
                </div>

                <div className="p-4 bg-emerald-50/20 border border-emerald-200/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black text-emerald-500 uppercase">Patrimônio Estimado de Venda</span>
                    <p className="text-xl font-black text-emerald-600 mt-1">{formatCurrency(totalSaleValue)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-emerald-300" />
                </div>

                <div className="p-4 bg-blue-50/20 border border-blue-200/50 rounded-2xl flex justify-between items-center">
                  <div>
                    <span className="text-[9px] font-black text-blue-500 uppercase">Alavancagem / Margem Teórica</span>
                    <p className="text-xl font-black text-blue-600 mt-1">{formatCurrency(potentialRemainingProfit)}</p>
                  </div>
                  <Percent className="w-8 h-8 text-blue-300" />
                </div>
              </div>

              <p className="text-[9px] text-[#94a3b8] font-bold uppercase text-center leading-normal">
                Reflete o estoque de {products.length} referências ativas do banco de dados principal.
              </p>
            </div>

            {/* BEST SELLING PRODUCTS METERS */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Curva de Giro: Produtos Campeões de Venda
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Itens com maior escoabilidade de estoque e retorno bruto de faturamento
                </p>
              </div>

              {bestSellers.length === 0 ? (
                <div className="py-24 text-center text-slate-300">
                  <Package className="w-12 h-12 mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-bold">Nenhum produto foi vendido no período selecionado.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                  {bestSellers.map((item, index) => {
                    const percentage = (item.quantity / bestSellers[0].quantity) * 100;
                    return (
                      <div key={item.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-primary min-w-[20px]">#{index + 1}</span>
                            <h4 className="text-xs font-black text-slate-800 uppercase truncate tracking-tight">{item.name}</h4>
                          </div>
                          <div className="flex items-center gap-3 text-[9px] text-[#94a3b8] font-black uppercase mt-1 pl-6">
                            <span>SKU: {item.sku}</span>
                            <span>•</span>
                            <span className="text-emerald-600 font-extrabold">{formatCurrency(item.revenue)} Gerado</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2.5 ml-6 max-w-sm">
                            <div className="bg-primary h-full" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-slate-800 font-sans">{item.quantity} unidades</span>
                          <p className="text-[9px] text-[#94a3b8] font-black uppercase">Faturamento Direto</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            {/* PRODUCTS WITHOUT SALES (DEAD STOCK MONITOR) */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none text-rose-600">
                    Estoque Sem Giro (Dead Inventory)
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                    Produtos ativos no catálogo mas com ZERO vendas efetuadas no período
                  </p>
                </div>
                <span className="bg-rose-50 text-rose-600 text-[10px] font-black py-1 px-3 rounded-full border border-rose-100">
                  {productsWithoutSales.length} Itens Traificados
                </span>
              </div>

              {productsWithoutSales.length === 0 ? (
                <div className="py-12 text-center text-slate-300">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Excelente! Todos os produtos possuíram conversão.</p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {productsWithoutSales.slice(0, 10).map((p) => (
                    <div key={p.id} className="p-3.5 bg-[#f8fafc] border border-slate-100 rounded-2xl flex justify-between items-center group hover:border-rose-100 transition-colors">
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-700 uppercase truncate max-w-[280px]">{p.name}</h4>
                        <div className="flex items-center gap-2 mt-1 text-[8px] text-slate-400 font-black uppercase tracking-wider">
                          <span>Estoque: {p.stock} peças</span>
                          <span>•</span>
                          <span>SKU: {p.sku}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-slate-800 font-sans">{formatCurrency(p.inventoryCost)}</span>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">custo detido</p>
                      </div>
                    </div>
                  ))}
                  {productsWithoutSales.length > 10 && (
                    <p className="text-center text-[9px] text-slate-400 font-extrabold uppercase mt-2">
                      e mais {productsWithoutSales.length - 10} produtos sem escoamento listado.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* MINIMUM STOCK RESTOCK ALERT PANEL */}
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none text-amber-600">
                    Alerta crítico de Reposição
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                    Itens cuja contagem de estoque físico é menor ou igual ao estoque de reserva mínimo
                  </p>
                </div>
                <span className="bg-amber-50 text-amber-600 text-[10px] font-black py-1 px-3 rounded-full border border-amber-100">
                  {lowStockProducts.length} Alertas
                </span>
              </div>

              {lowStockProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-350">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Stoque Operacional Normal!</p>
                </div>
              ) : (
                <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {lowStockProducts.map((p) => (
                    <div key={p.id} className="p-3.5 bg-[#f8fafc] border border-slate-100 rounded-2xl flex justify-between items-center hover:border-amber-100 transition-colors">
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-slate-700 uppercase truncate max-w-[280px]">{p.name}</h4>
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1 block">SKU: {p.sku}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-black text-amber-600 font-sans">{p.stock} / {p.minStock} un.</span>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Atual vs Mínimo</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </React.Fragment>
      )}

      {activeTab === 'caixa' && (
        <React.Fragment>
          {/* EXPENSE BREAKDOWN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            <div className="bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                  Estrutura de Gastos do Caixa
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                  Classificação das saídas de caixa operacionais do período filtrado
                </p>
              </div>

              {expenseCategories.length === 0 ? (
                <div className="py-12 text-center text-slate-300">
                  <p className="text-xs font-bold font-sans">Sem saídas ou despesas no período selecionado.</p>
                </div>
              ) : (
                <React.Fragment>
                  <div className="space-y-4">
                    {expenseCategories.map((c) => (
                      <div key={c.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-black text-slate-700 uppercase tracking-tight">{c.name}</span>
                          <span className="font-extrabold text-[#1e293b]">{formatCurrency(c.value)}</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden shadow-inner">
                           <div className="h-full rounded-full transition-all duration-300" style={{ width: `${c.percent}%`, backgroundColor: c.color }} />
                        </div>
                        <p className="text-[8.5px] font-bold text-slate-400 uppercase text-right leading-none">{c.percent.toFixed(1)}% das despesas totes</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 bg-amber-50/10 border border-dashed border-amber-200 rounded-2xl">
                    <p className="text-[9px] font-black text-amber-500 uppercase leading-normal">Insight de Alocação de Caixa</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 leading-relaxed">
                      Sua maior despesa de dinheiro foi em <span className="font-black text-slate-600 uppercase">{expenseCategories[0]?.name}</span> totalizando <span className="font-black text-slate-600">{formatCurrency(expenseCategories[0]?.value || 0)}</span> no período analisado.
                    </p>
                  </div>
                </React.Fragment>
              )}
            </div>

            {/* DETAILED LEDGER MOVE RECORD */}
            <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl md:rounded-[32px] border border-slate-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest leading-none">
                    Fluxo e Histórico de Lançamentos de Caixa
                  </h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                    Lançamentos de entrada e saída processados no período correspondente
                  </p>
                </div>
                <span className="bg-slate-50 text-[#1e293b] text-[10px] font-black py-1 px-3 rounded-full border border-slate-200">
                  {periodCashIn.length + periodCashOut.length} Registros
                </span>
              </div>

              {periodCashIn.length + periodCashOut.length === 0 ? (
                <div className="py-24 text-center text-slate-300">
                  <Inbox className="w-11 h-11 mx-auto text-slate-200 mb-3" />
                  <p className="text-xs font-bold uppercase tracking-wider">Sem transações ou lançamentos contábeis.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {[...periodCashIn, ...periodCashOut].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 15).map((m) => (
                    <div key={m.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm",
                          m.type === 'in' ? "bg-emerald-50 text-emerald-500 border border-emerald-100" : "bg-rose-50 text-rose-500 border border-rose-100"
                        )}>
                          {m.type === 'in' ? '+' : '-'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-700 uppercase truncate tracking-tight">{m.reason || 'Sem descrição'}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[8.5px] text-slate-400 font-black uppercase tracking-wider">
                            <span>{new Date(m.timestamp).toLocaleDateString('pt-BR')} {new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            <span>•</span>
                            <span className="bg-slate-200/60 px-1.5 py-0.5 rounded text-slate-600">{m.category}</span>
                            <span>•</span>
                            <span>{m.paymentMethod}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn(
                          "text-xs font-black font-mono",
                          m.type === 'in' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {m.type === 'in' ? '+' : '-'}{formatCurrency(m.amount)}
                        </span>
                        <p className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate max-w-[80px]">{m.userName}</p>
                      </div>
                    </div>
                  ))}
                  {[...periodCashIn, ...periodCashOut].length > 15 && (
                    <p className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest text-center mt-2.5">
                      Mostrando os últimos 15 lançamentos contábeis. Use a planilha BI para auditar o fluxo completo!
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
