import React, { useEffect, useState } from 'react';
import { 
  UserPlus,
  UserCheck,
  UserCog,
  Users as UsersIcon, 
  Trash2, 
  Shield, 
  ShieldCheck, 
  ShieldAlert,
  Loader2,
  Mail,
  MoreVertical,
  X,
  Plus
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { UserProfile, UserRole } from '@/src/types';
import { formatDate, cn } from '@/src/lib/utils';
import { useAuth } from '@/src/contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';

export default function Users() {
  const { profile: loggedInUser, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    role: 'staff' as UserRole
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <ShieldAlert className="w-12 h-12 text-danger mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Acesso Negado</h2>
        <p className="text-slate-500">Apenas o Administrador principal pode gerenciar usuários.</p>
      </div>
    );
  }

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const cleanUsername = formData.username.toLowerCase().trim();
      if (!cleanUsername) throw new Error('Nome de usuário é obrigatório');
      if (formData.password.length < 4) throw new Error('A senha deve ter pelo menos 4 caracteres');

      const userRef = doc(db, 'users', cleanUsername);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        throw new Error('Este nome de usuário já está sendo usado.');
      }

      const newProfile = {
        uid: cleanUsername,
        username: cleanUsername,
        name: formData.name,
        email: `${cleanUsername}@estoquepro.local`,
        role: formData.role,
        status: 'active',
        password: formData.password,
        createdAt: new Date().toISOString(),
      };

      await setDoc(userRef, newProfile);
      setShowAddModal(false);
      setFormData({ name: '', username: '', password: '', role: 'staff' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRole = async (user: UserProfile) => {
    if (user.uid === loggedInUser?.uid) {
      alert('Você não pode alterar sua própria função.');
      return;
    }
    if (user.username === 'admin') {
      alert('O perfil do administrador principal não pode ser alterado.');
      return;
    }
    const newRole: UserRole = user.role === 'admin' ? 'staff' : 'admin';
    await updateDoc(doc(db, 'users', user.uid), { role: newRole });
  };

  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  const deleteUser = async (user: UserProfile) => {
    if (user.uid === loggedInUser?.uid) {
      alert('Você não pode excluir sua própria conta.');
      return;
    }
    if (user.username === 'admin') {
      alert('O administrador principal não pode ser excluído.');
      return;
    }
    setUserToDelete(user);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.uid));
      setUserToDelete(null);
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      alert('Erro ao excluir usuário: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <UserCog className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Usuários</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Acesso e Permissões</p>
          </div>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-accent text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-accent/20 hover:scale-[1.02] transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Novo Usuário</span>
        </button>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center text-accent">
                    <UserPlus className="w-6 h-6" />
                  </div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Novo Usuário</h2>
                </div>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-bold flex items-center gap-2 animate-shake">
                    <ShieldAlert className="w-4 h-4" />
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Nome Completo</label>
                  <input 
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: João Silva"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Usuário de Login</label>
                  <input 
                    type="text"
                    required
                    value={formData.username}
                    onChange={e => setFormData({...formData, username: e.target.value})}
                    placeholder="Ex: joaosilva"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Senha Inicial</label>
                  <input 
                    type="password"
                    required
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    placeholder="Mínimo 4 caracteres"
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-accent transition-all outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Tipo de Acesso</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'staff'})}
                      className={cn(
                        "py-3 rounded-2xl text-xs font-bold uppercase transition-all tracking-widest",
                        formData.role === 'staff' 
                          ? "bg-accent text-white shadow-lg shadow-accent/20" 
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({...formData, role: 'admin'})}
                      className={cn(
                        "py-3 rounded-2xl text-xs font-bold uppercase transition-all tracking-widest",
                        formData.role === 'admin' 
                          ? "bg-accent text-white shadow-lg shadow-accent/20" 
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Admin
                    </button>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-accent text-white font-bold py-4 rounded-2xl shadow-xl shadow-accent/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 mt-4"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  <span className="uppercase tracking-widest">Criar Usuário</span>
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {userToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 p-6 text-center"
            >
              <div className="w-16 h-16 bg-danger/10 text-danger rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Confirmar Exclusão</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                Deseja realmente excluir <strong>{userToDelete.name}</strong>? Esta ação não pode ser desfeita.
              </p>
              
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button 
                  onClick={() => setUserToDelete(null)}
                  className="py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all active:scale-95 text-xs uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  disabled={isSubmitting}
                  className="py-3 bg-danger text-white font-bold rounded-2xl shadow-lg shadow-danger/20 hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-50 text-xs uppercase tracking-widest"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Permissão</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Desde</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.uid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center font-bold text-accent">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{user.name}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {user.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       {user.role === 'admin' ? (
                         <ShieldCheck className="w-4 h-4 text-accent" />
                       ) : (
                         <Shield className="w-4 h-4 text-slate-400" />
                       )}
                       <span className={cn(
                         "text-xs font-bold uppercase",
                         user.role === 'admin' ? "text-accent" : "text-slate-600"
                       )}>
                         {user.role}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-success/10 text-success rounded-full text-[10px] font-bold uppercase">
                      Ativo
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                     {formatDate(user.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button 
                      onClick={() => toggleRole(user)}
                      className="p-2 text-slate-400 hover:text-accent hover:bg-accent/10 rounded-lg transition-all"
                      title="Alterar permissão"
                    >
                      <ShieldAlert className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteUser(user)}
                      disabled={user.uid === loggedInUser?.uid}
                      className="p-2 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
