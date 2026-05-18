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
  Loader2
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { formatCurrency, formatDate, cn, getBrasiliaTime } from '@/src/lib/utils';
import { Sale, Product, Movement } from '@/src/types';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export default function Reports() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [timeFilter, setTimeFilter] = useState<'all' | '7d' | '30d' | 'month'>('all');

  useEffect(() => {
    const fetchData = async () => {
      const salesSnap = await getDocs(query(collection(db, 'sales'), orderBy('timestamp', 'desc')));
      const productsSnap = await getDocs(collection(db, 'products'));
      
      setSales(salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
      setProducts(productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    };
    fetchData();
  }, []);

  const getFilteredSales = () => {
    const now = getBrasiliaTime();
    if (timeFilter === '7d') {
      const sevenDaysAgo = getBrasiliaTime();
      sevenDaysAgo.setTime(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return sales.filter(s => new Date(s.timestamp) >= sevenDaysAgo);
    }
    if (timeFilter === '30d') {
      const thirtyDaysAgo = getBrasiliaTime();
      thirtyDaysAgo.setTime(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return sales.filter(s => new Date(s.timestamp) >= thirtyDaysAgo);
    }
    if (timeFilter === 'month') {
      return sales.filter(s => {
        const saleDate = new Date(s.timestamp);
        return saleDate.getMonth() === now.getMonth() && saleDate.getFullYear() === now.getFullYear();
      });
    }
    return sales;
  };

  const filteredSales = getFilteredSales();
  const faturamentoPeriodo = filteredSales.reduce((acc, s) => acc + s.total, 0);
  
  // Calculate Profit
  const lucroPeriodo = filteredSales.reduce((acc, s) => {
    const saleCost = s.items?.reduce((itemAcc, item) => itemAcc + ((item.costPrice || 0) * item.quantity), 0) || 0;
    return acc + (s.total - saleCost);
  }, 0);

  const margemLucro = faturamentoPeriodo > 0 ? (lucroPeriodo / faturamentoPeriodo) * 100 : 0;
  const ticketMedio = filteredSales.length > 0 ? faturamentoPeriodo / filteredSales.length : 0;

  const lowStock = products.filter(p => p.stock <= p.minStock);

  const exportToExcel = () => {
    setIsExporting(true);
    const ws = XLSX.utils.json_to_sheet(filteredSales.map(s => ({
      ID: s.id,
      Data: formatDate(s.timestamp),
      Cliente: s.customerName || 'Direto',
      Subtotal: s.subtotal || s.total,
      Desconto: s.discount || 0,
      Taxa: s.fee || 0,
      Total: s.total,
      Pagamento: s.paymentMethod,
      Vendedor: s.userName
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");
    XLSX.writeFile(wb, `Relatorio_Vendas_${timeFilter}_${getBrasiliaTime().toISOString().split('T')[0]}.xlsx`);
    setIsExporting(false);
  };

  const exportToPDF = () => {
    setIsExporting(true);
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Relatório de Vendas - EstoquePro', 14, 22);
    doc.setFontSize(10);
    doc.text(`Período: ${timeFilter.toUpperCase()} | Gerado em: ${getBrasiliaTime().toLocaleString('pt-BR')}`, 14, 30);

    let y = 40;
    doc.line(14, y, 196, y);
    y += 10;

    filteredSales.slice(0, 50).forEach((sale, index) => {
      doc.text(`${formatDate(sale.timestamp)} - ${sale.customerName || 'Cliente'} - ${formatCurrency(sale.total)}`, 14, y);
      y += 7;
      if (y > 280) { doc.addPage(); y = 20; }
    });

    doc.save(`Relatorio_Vendas_${timeFilter}_${getBrasiliaTime().toISOString().split('T')[0]}.pdf`);
    setIsExporting(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <FileBarChart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Relatórios</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Estatísticas e Desempenho</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
           <div className="flex bg-white rounded-xl border border-gray-100 p-1 mr-2 shadow-sm">
             <button 
               onClick={() => setTimeFilter('all')}
               className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", timeFilter === 'all' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}
             >Tudo</button>
             <button 
               onClick={() => setTimeFilter('7d')}
               className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", timeFilter === '7d' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}
             >7 Dias</button>
             <button 
               onClick={() => setTimeFilter('30d')}
               className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", timeFilter === '30d' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}
             >30 Dias</button>
             <button 
               onClick={() => setTimeFilter('month')}
               className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", timeFilter === 'month' ? "bg-primary text-white" : "text-slate-500 hover:bg-slate-50")}
             >Mês</button>
           </div>
           <button 
            disabled={isExporting}
            onClick={exportToExcel}
            className="bg-success/10 text-success font-bold py-2 px-4 rounded-lg flex items-center gap-2 hover:bg-success hover:text-white transition-all text-sm border border-success/20"
           >
             <FileSpreadsheet className="w-4 h-4" /> Excel
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Faturamento" 
          value={formatCurrency(faturamentoPeriodo)} 
          subValue={`${filteredSales.length} vendas`}
          icon={TrendingUp}
          theme="accent"
        />
        <StatCard 
          label="Lucro Estimado" 
          value={formatCurrency(lucroPeriodo)} 
          subValue={`${margemLucro.toFixed(1)}% de margem`}
          icon={TrendingUp}
          theme="success"
        />
        <StatCard 
          label="Ticket Médio" 
          value={formatCurrency(ticketMedio)} 
          subValue="Por venda finalizada"
          icon={BarChart3}
          theme="primary"
        />
        <StatCard 
          label="Saúde Estoque" 
          value={lowStock.length.toString()} 
          subValue="Itens abaixo do mínimo"
          icon={Package}
          theme={lowStock.length > 0 ? "danger" : "success"}
          alert={lowStock.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-6">
               <h3 className="font-bold text-slate-800 text-lg">Alertas de Reposição</h3>
               <span className="text-xs bg-danger/10 text-danger px-2 py-1 rounded-full font-bold">{lowStock.length} alertas</span>
            </div>
            <div className="space-y-3">
               {lowStock.map(p => (
                 <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-danger/30 transition-all">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-danger">
                          <AlertTriangle className="w-5 h-5" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-slate-800">{p.name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">SKU: {p.sku}</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-sm font-black text-danger">{p.stock} un</p>
                       <p className="text-[10px] text-slate-400">Mínimo: {p.minStock}</p>
                    </div>
                 </div>
               ))}
               {lowStock.length === 0 && (
                 <div className="py-12 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold">Excelente! Estoque em dia.</p>
                 </div>
               )}
            </div>
         </div>

         <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="font-bold text-slate-800 text-lg mb-6">Patrimônio Investido</h3>
            <div className="space-y-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Total em Estoque (Custo)</p>
                   <p className="text-2xl font-black text-primary">
                     {formatCurrency(products.reduce((acc, p) => acc + (p.stock * p.costPrice), 0))}
                   </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Potencial de Venda</p>
                   <p className="text-2xl font-black text-success">
                     {formatCurrency(products.reduce((acc, p) => acc + (p.stock * p.salePrice), 0))}
                   </p>
                </div>
                <div className="p-6 bg-accent/5 rounded-2xl border border-accent/10 border-dashed">
                   <p className="text-[10px] font-black text-accent uppercase tracking-tighter mb-1">Lucro Potencial Residual</p>
                   <p className="text-2xl font-black text-accent">
                     {formatCurrency(products.reduce((acc, p) => acc + (p.stock * (p.salePrice - p.costPrice)), 0))}
                   </p>
                   <p className="text-[10px] text-accent/60 font-medium mt-2 leading-tight">Representa o lucro caso todo o estoque atual seja vendido pelo preço de tabela.</p>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subValue, icon: Icon, theme, alert }: any) {
  const themes = {
    primary: "border-primary/10 bg-primary/5 text-primary",
    accent: "border-accent/10 bg-accent/5 text-accent",
    success: "border-success/10 bg-success/5 text-success",
    danger: "border-danger/10 bg-danger/5 text-danger"
  };

  return (
    <div className={cn("p-6 rounded-3xl border shadow-sm transition-all hover:scale-[1.02]", (themes as any)[theme])}>
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-white rounded-xl shadow-sm">
          <Icon className="w-5 h-5" />
        </div>
        {alert && <div className="w-3 h-3 bg-danger rounded-full animate-pulse shadow-lg shadow-danger/20" />}
      </div>
      <p className="text-[10px] font-extrabold uppercase tracking-widest opacity-60 mb-1">{label}</p>
      <h4 className="text-2xl font-black mb-1">{value}</h4>
      <p className="text-[10px] font-bold opacity-50 uppercase tracking-tight">{subValue}</p>
    </div>
  );
}
