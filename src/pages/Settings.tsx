import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings as SettingsIcon, 
  User, 
  Shield, 
  Globe,
  Save,
  LogOut,
  ChevronRight,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Users,
  Trash2,
  RefreshCcw,
  UserCheck,
  UserPlus
} from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { cn } from '@/src/lib/utils';
import { auth, db } from '@/src/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, getDocs, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '@/src/types';

function UserCard({ 
  u, 
  currentUserUid, 
  onToggleRole, 
  onDelete 
}: any) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transition-all hover:border-accent/30 shadow-sm">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left group"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold">
            {u.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 group-hover:text-accent transition-colors">
            {u.name}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
        >
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">E-mail</p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{u.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nível de Acesso</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter",
                      u.role === 'admin' ? "bg-accent/10 text-accent" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    )}>
                      {u.role}
                    </span>
                  </div>
                </div>
              </div>

              {currentUserUid !== u.uid && (
                <div className="flex items-center gap-2 pt-2">
                  <button 
                    onClick={() => onToggleRole(u)}
                    className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-accent/10 text-accent rounded-xl text-[10px] font-black uppercase transition-all hover:bg-accent hover:text-white"
                  >
                    {u.role === 'admin' ? <RefreshCcw className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    Mudar para {u.role === 'admin' ? 'Membro' : 'Admin'}
                  </button>
                  <button 
                    onClick={() => onDelete(u)}
                    className="p-2.5 bg-danger/10 text-danger rounded-xl transition-all hover:bg-danger hover:text-white"
                    title="Remover Usuário"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {currentUserUid === u.uid && (
                <p className="text-[10px] text-slate-400 font-bold uppercase italic py-2">Este é o seu perfil</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Settings() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const securityRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  
  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User Management State
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setIsLoadingUsers(true);
      const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
        const users = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
        setUserList(users);
        setIsLoadingUsers(false);
      });
      return () => unsubscribe();
    }
  }, [isAdmin]);

  const scrollToSecurity = () => {
    securityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const scrollToUsers = () => {
    usersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (!auth.currentUser || !auth.currentUser.email) return;

    setIsUpdating(true);
    try {
      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Update password
      await updatePassword(auth.currentUser, newPassword);
      
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password') {
        setError('Senha atual incorreta.');
      } else {
        setError('Ocorreu um erro ao atualizar a senha. Tente novamente.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleUserRole = async (targetUser: UserProfile) => {
    const newRole = targetUser.role === 'admin' ? 'staff' : 'admin';
    try {
      await updateDoc(doc(db, 'users', targetUser.uid), { role: newRole });
    } catch (err) {
      console.error('Erro ao alternar cargo:', err);
    }
  };

  const deleteUser = async (targetUser: UserProfile) => {
    if (!window.confirm(`Tem certeza que deseja remover o acesso de ${targetUser.name}?`)) return;
    try {
      await deleteDoc(doc(db, 'users', targetUser.uid));
    } catch (err) {
      console.error('Erro ao remover usuário:', err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 px-2 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Configurações</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Ajuste as preferências e sua conta</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         {/* Navigation */}
         <div className="space-y-1">
            <SettingsLink icon={User} label="Meu Perfil" active />
            <SettingsLink icon={Shield} label="Segurança" onClick={scrollToSecurity} />
            {isAdmin && <SettingsLink icon={Users} label="Usuários" onClick={scrollToUsers} />}
         </div>

         {/* Content */}
         <div className="md:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 space-y-6 transition-colors">
               <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3">Informações Pessoais</h3>
               <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-2xl bg-accent flex items-center justify-center text-white text-2xl font-black">
                     {profile?.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                     <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">{profile?.name}</h4>
                     <p className="text-slate-500 dark:text-slate-400 text-sm">{profile?.email}</p>
                     <button className="text-accent text-xs font-bold mt-2 hover:underline">Alterar foto</button>
                  </div>
               </div>

               <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                     <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nome de Exibição</label>
                     <input className="form-input" defaultValue={profile?.name} />
                  </div>
                  <div className="space-y-1">
                     <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cargo / Função</label>
                     <input className="form-input opacity-60" defaultValue={profile?.role} readOnly />
                  </div>
               </div>
               <button className="bg-accent text-white font-bold py-2 px-6 rounded-xl text-sm shadow-lg shadow-accent/20 transition-transform active:scale-95">
                  Salvar Alterações
               </button>
            </div>

            <div ref={securityRef} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 space-y-6 transition-colors">
               <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                 <Shield className="w-5 h-5 text-accent" />
                 Segurança e Senha
               </h3>
               
               <form onSubmit={handleUpdatePassword} className="space-y-4">
                 {error && (
                   <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-bold">
                     {error}
                   </div>
                 )}
                 {success && (
                   <div className="p-3 bg-success/10 border border-success/20 rounded-xl text-success text-xs font-bold">
                     Senha atualizada com sucesso!
                   </div>
                 )}

                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Senha Atual</label>
                       <div className="relative">
                          <input 
                            type={showCurrent ? "text" : "password"}
                            required
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="form-input pr-10" 
                            placeholder="••••••••"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowCurrent(!showCurrent)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nova Senha</label>
                        <div className="relative">
                          <input 
                            type={showNew ? "text" : "password"}
                            required
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="form-input pr-10" 
                            placeholder="Min. 6 caracteres"
                          />
                          <button 
                            type="button" 
                            onClick={() => setShowNew(!showNew)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Confirmar Nova Senha</label>
                        <input 
                          type={showNew ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="form-input" 
                          placeholder="Repita a nova senha"
                        />
                      </div>
                    </div>
                 </div>

                 <button 
                  type="submit"
                  disabled={isUpdating}
                  className="bg-primary text-white font-bold py-3 px-8 rounded-xl text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                 >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Atualizar Senha
                 </button>
               </form>
            </div>

            {isAdmin && (
               <div ref={usersRef} className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 space-y-6 transition-colors">
                  <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3 flex items-center gap-2">
                    <Users className="w-5 h-5 text-accent" />
                    Gerenciar Usuários
                  </h3>
                  
                  <div className="space-y-4">
                     {isLoadingUsers ? (
                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                           <Loader2 className="w-8 h-8 animate-spin mb-2" />
                           <p className="text-[10px] font-black uppercase tracking-widest">Carregando usuários...</p>
                        </div>
                     ) : (
                        userList.map((u) => (
                           <UserCard 
                             key={u.uid} 
                             u={u} 
                             currentUserUid={profile?.uid}
                             onToggleRole={toggleUserRole}
                             onDelete={deleteUser}
                           />
                        ))
                     )}
                  </div>
               </div>
            )}

            <div className="bg-danger/5 dark:bg-danger/10 p-6 rounded-2xl border border-danger/10 space-y-4">
               <div className="flex items-center gap-3">
                  <LogOut className="w-6 h-6 text-danger" />
                  <div>
                    <h3 className="font-bold text-danger">Encerrar Sessão</h3>
                    <p className="text-xs text-danger/70">Você será desconectado deste dispositivo.</p>
                  </div>
               </div>
               <button 
                onClick={() => { auth.signOut(); navigate('/login'); }}
                className="w-full py-3 bg-danger text-white font-bold rounded-xl shadow-lg shadow-danger/20 transition-transform active:scale-95"
               >
                 Sair da Conta
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}

function SettingsLink({ icon: Icon, label, active, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between p-3 rounded-xl transition-all group",
        active 
          ? "bg-accent text-white shadow-lg shadow-accent/10" 
          : "text-slate-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("w-5 h-5", active ? "text-white" : "text-slate-400 group-hover:text-accent")} />
        <span className="font-bold text-sm tracking-tight">{label}</span>
      </div>
      <ChevronRight className={cn("w-4 h-4 opacity-50", !active && "group-hover:translate-x-1 transition-transform")} />
    </button>
  );
}

