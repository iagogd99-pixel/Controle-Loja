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
  MoreVertical
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { UserProfile, UserRole } from '@/src/types';
import { formatDate, cn } from '@/src/lib/utils';
import { useAuth } from '@/src/contexts/AuthContext';

export default function Users() {
  const { profile: loggedInUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const toggleRole = async (user: UserProfile) => {
    if (user.uid === loggedInUser?.uid) {
      alert('Você não pode alterar sua própria função.');
      return;
    }
    const newRole: UserRole = user.role === 'admin' ? 'staff' : 'admin';
    await updateDoc(doc(db, 'users', user.uid), { role: newRole });
  };

  const deleteUser = async (user: UserProfile) => {
    if (user.uid === loggedInUser?.uid) return;
    if (window.confirm(`Excluir usuário ${user.name}?`)) {
      await deleteDoc(doc(db, 'users', user.uid));
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
      </div>

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
