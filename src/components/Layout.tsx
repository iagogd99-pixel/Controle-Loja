import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Users, 
  Settings, 
  Menu,
  BarChart3,
  DollarSign,
  Truck,
  Minus,
  Tag,
  LogOut,
  Mail,
  Edit2,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  FileText,
  History
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { auth } from '@/src/lib/firebase';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface MenuItem {
  path?: string;
  label: string;
  icon: any;
  adminOnly?: boolean;
  hidden?: boolean;
  children?: { path: string; label: string; icon?: any }[];
}

const menuItems: MenuItem[] = [
  { path: '/', label: 'Início', icon: LayoutDashboard },
  { path: '/financas', label: 'Caixa', icon: DollarSign },
  { 
    label: 'Despesas', 
    icon: Minus,
    children: [
      { path: '/despesas/nova', label: 'Nova Despesa', icon: Plus },
      { path: '/despesas', label: 'Despesas', icon: FileText },
    ]
  },
  { 
    label: 'Vendas', 
    icon: ShoppingCart,
    children: [
      { path: '/vendas', label: 'Nova Venda', icon: Plus },
      { path: '/historico-vendas', label: 'Vendas Recebidas', icon: ShoppingCart },
      { path: '/vendas-pendentes', label: 'Vendas a Receber', icon: Clock },
    ]
  },
  { 
    label: 'Compras', 
    icon: Truck,
    children: [
      { path: '/compras/nova', label: 'Nova Compra', icon: Plus },
      { path: '/compras', label: 'Compras Pagas', icon: Truck },
      { path: '/compras-pendentes', label: 'Compras a Pagar', icon: Clock },
    ]
  },
  { 
    label: 'Produtos / Estoque', 
    icon: Package,
    children: [
      { path: '/produtos/lancar-nota', label: 'Lançar Nota', icon: Plus },
      { path: '/produtos', label: 'Estoque', icon: Package },
    ]
  },
  { path: '/movimentacoes', label: 'Movimentações', icon: History },
  { path: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/fornecedores', label: 'Fornecedores', icon: Truck },
  { path: '/categorias', label: 'Categorias', icon: Tag },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, logout, mustChangePassword } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const [openSubmenus, setOpenSubmenus] = React.useState<string[]>([]);
  const profileMenuRef = React.useRef<HTMLDivElement>(null);

  const toggleSubmenu = (label: string) => {
    setOpenSubmenus(prev => 
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    );
  };

  React.useEffect(() => {
    if (mustChangePassword && location.pathname !== '/configuracoes') {
      // Opt-in: We could force redirect, but a banner is better for UX 
      // so they can see the message.
    }
  }, [mustChangePassword, location.pathname]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 relative transition-colors duration-300">
      {/* Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {mustChangePassword && (
        <div className="fixed top-0 left-0 right-0 bg-danger text-white px-4 py-2 text-center z-[100] text-sm font-bold flex items-center justify-center gap-2 shadow-lg">
          <ShieldAlert className="w-4 h-4" />
          <span>Atenção: Você precisa alterar sua senha inicial por segurança.</span>
          <button 
            onClick={() => {
              navigate('/configuracoes');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="bg-white text-danger px-3 py-1 rounded-lg text-xs hover:bg-opacity-90 transition-all uppercase tracking-widest font-black"
          >
            Alterar Agora
          </button>
        </div>
      )}

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          x: isSidebarOpen ? 0 : -280,
          opacity: isSidebarOpen ? 1 : 0
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="bg-primary dark:bg-slate-900 text-white flex flex-col z-50 shadow-2xl fixed inset-y-0 left-0 w-[280px]"
      >
        <div className="p-4 flex items-center justify-between h-16 border-b border-white/5">
          <AnimatePresence mode="wait">
            {isSidebarOpen ? (
              <motion.span 
                key="logo"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="font-black text-xl tracking-tighter flex items-center gap-2"
              >
                <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20">
                  <Package className="w-5 h-5" />
                </div>
                Estoque<span className="text-accent italic">Pro</span>
              </motion.span>
            ) : (
              <motion.div key="icon" className="w-full flex justify-center">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/20">
                  <Package className="w-6 h-6" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto">
          {menuItems.filter(item => (!item.adminOnly || isAdmin) && !item.hidden).map((item) => {
            if (item.children) {
              const isOpen = openSubmenus.includes(item.label);
              const isChildActive = item.children.some(child => location.pathname === child.path);
              const Icon = item.icon;

              return (
                <div key={item.label} className="space-y-1">
                  <button
                    onClick={() => toggleSubmenu(item.label)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 group",
                      isChildActive && !isOpen ? "bg-white/5 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={cn("w-5 h-5 flex-shrink-0 transition-colors", isChildActive ? "text-accent" : "group-hover:text-accent")} />
                      <span className="font-bold text-sm tracking-tight truncate">{item.label}</span>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-black/5 rounded-2xl"
                      >
                        <div className="py-1 px-1 space-y-1">
                          {item.children.map((child) => {
                            const isChildActive = location.pathname === child.path;
                            const ChildIcon = child.icon || Icon;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                onClick={() => setIsSidebarOpen(false)}
                                className={cn(
                                  "flex items-center gap-3 px-8 py-2.5 rounded-xl transition-all duration-300 group relative",
                                  isChildActive 
                                    ? "bg-accent text-white shadow-lg shadow-accent/20" 
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                                )}
                              >
                                {ChildIcon && <ChildIcon className={cn("w-4 h-4 flex-shrink-0", isChildActive ? "text-white" : "group-hover:text-accent")} />}
                                <span className={cn("text-xs font-bold truncate", isChildActive ? "text-white" : "text-slate-400 group-hover:text-slate-100")}>
                                  {child.label}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            }

            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.path || item.label}
                to={item.path || '#'}
                onClick={() => setIsSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 group relative",
                  isActive 
                    ? "bg-accent text-white shadow-xl shadow-accent/25" 
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon className={cn("w-5 h-5 flex-shrink-0 transition-colors", isActive ? "text-white" : "group-hover:text-accent")} />
                <motion.span
                  className="font-bold text-sm tracking-tight truncate"
                >
                  {item.label}
                </motion.span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 bg-black/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-xl transition-all group"
          >
            <LogOut className="w-5 h-5" />
            {isSidebarOpen && <span className="font-bold text-sm">Sair do Sistema</span>}
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Desktop & Mobile Header combined logic */}
        <header className="sticky top-0 z-30 h-14 md:h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 flex items-center justify-between transition-colors duration-300">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => {
                const nextState = !isSidebarOpen;
                if (nextState) setOpenSubmenus([]);
                setIsSidebarOpen(nextState);
              }}
              className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-500 dark:text-slate-400"
            >
              <Menu className="w-5 h-5 md:w-6 h-6" />
            </button>
            
            <Link to="/" className="flex items-center gap-2 group transition-all">
              <div className="w-8 h-8 bg-primary dark:bg-slate-800 rounded-lg flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
                <Package className="w-4 h-4" />
              </div>
              <span className="font-black text-sm tracking-tighter text-primary dark:text-white hidden sm:inline">
                Estoque<span className="text-accent italic">Pro</span>
              </span>
            </Link>

            <div className="h-6 w-px bg-slate-100 dark:bg-slate-800 hidden xs:block ml-2" />

            <div className="hidden xs:block">
               <h2 className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 tracking-widest">
                 {menuItems.find(i => i.path === location.pathname)?.label || 'Sistema'}
               </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
             <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-500 dark:text-slate-400 uppercase tracking-widest text-[8px] font-bold">
                <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                Sistema Online
             </div>

             {profile && (
               <div className="flex items-center gap-2 md:gap-3 pl-2 relative" ref={profileMenuRef}>
                 <div className="text-right hidden xs:block">
                   <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-none truncate max-w-[80px]">{profile.name}</p>
                   <p className="text-[8px] text-accent font-black uppercase tracking-widest mt-0.5">{profile.role}</p>
                 </div>
                 <button 
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-accent flex items-center justify-center text-white font-black text-sm shadow-lg shadow-accent/20 hover:scale-105 transition-transform active:scale-95"
                 >
                    {profile.name.charAt(0).toUpperCase()}
                 </button>

                 <AnimatePresence>
                    {isProfileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-900 rounded-[24px] shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-50 transition-colors duration-300"
                      >
                        <div className="p-4 border-b border-slate-50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-white font-black text-sm shadow-lg shadow-accent/20">
                                {profile.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="overflow-hidden">
                                 <p className="font-black text-slate-800 dark:text-slate-100 text-sm truncate uppercase tracking-tighter">{profile.name}</p>
                                 <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> {profile.email}
                                 </p>
                              </div>
                           </div>
                        </div>

                        <div className="p-2">
                           <button
                             onClick={() => {
                               navigate('/configuracoes');
                               setIsProfileMenuOpen(false);
                             }}
                             className="w-full flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-[18px] transition-all group"
                           >
                             <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                               <Edit2 className="w-4 h-4" />
                             </div>
                             <span className="text-xs font-black uppercase tracking-tight">Editar Perfil</span>
                           </button>

                           <button
                             onClick={handleLogout}
                             className="w-full flex items-center gap-3 px-4 py-3 text-danger hover:bg-danger/5 rounded-[18px] transition-all group"
                           >
                             <div className="p-2 bg-danger/10 rounded-xl transition-colors">
                               <LogOut className="w-4 h-4" />
                             </div>
                             <span className="text-xs font-black uppercase tracking-tight">Sair do Sistema</span>
                           </button>
                        </div>
                      </motion.div>
                    )}
                 </AnimatePresence>
               </div>
             )}
          </div>
        </header>
        
        <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 scroll-smooth">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="max-w-[1600px] mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
};
