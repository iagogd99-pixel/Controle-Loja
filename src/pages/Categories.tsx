import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Loader2,
  Tag,
  Maximize2,
  Palette,
  Users,
  Lock
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { useAuth } from '@/src/contexts/AuthContext';
import { cn, sortSizes } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface Category {
  id: string;
  name: string;
  type: 'categoria' | 'tamanho' | 'cor' | 'gênero';
}

interface CategoryType {
  id: 'categoria' | 'tamanho' | 'cor' | 'gênero';
  label: string;
  placeholder: string;
  icon: React.ElementType;
}

const CATEGORY_TYPES: CategoryType[] = [
  { id: 'categoria', label: 'Categorias', placeholder: 'Categorias...', icon: Tag },
  { id: 'tamanho', label: 'Tamanhos', placeholder: 'Tam...', icon: Maximize2 },
  { id: 'cor', label: 'Cores', placeholder: 'Cores...', icon: Palette },
  { id: 'gênero', label: 'Gêneros', placeholder: 'M/F...', icon: Users },
];

export default function Categories() {
  const { isAdmin, verifyPassword } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Password Verification State
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState<() => void>(() => {});

  const handleDeleteClick = (id: string) => {
    const action = async () => {
      try {
        await deleteDoc(doc(db, 'categories', id));
      } catch (error) {
        console.error(error);
        alert('Erro ao excluir item');
      }
    };

    if (isAdmin) {
      setPendingAction(() => action);
      setShowPasswordPrompt(true);
    } else {
      alert('Acesso restrito a administradores');
    }
  };

  const confirmPassword = async () => {
    setVerifyingPassword(true);
    const isValid = await verifyPassword(passwordInput);
    setVerifyingPassword(false);
    
    if (isValid) {
      setShowPasswordPrompt(false);
      setPasswordInput('');
      pendingAction();
    } else {
      alert('Senha incorreta');
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      setCategories(docs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div className="max-w-md mx-auto space-y-8 px-4 pb-32">
      <div className="flex items-center gap-3 mb-2 px-2">
        <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
          <Tag className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Categorias</h1>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Gestão de Atributos</p>
        </div>
      </div>
      {CATEGORY_TYPES.map((type) => {
        let filteredCategories = categories.filter(c => c.type === type.id);
        if (type.id === 'tamanho') {
          const sizeNames = filteredCategories.map(c => c.name);
          const sortedNames = sortSizes(sizeNames);
          filteredCategories = sortedNames.map(name => filteredCategories.find(c => c.name === name)!).filter(Boolean);
        }
        
        return (
          <CategorySection 
            key={type.id}
            type={type}
            categories={filteredCategories}
            loading={loading}
            onDelete={handleDeleteClick}
          />
        );
      })}

      {/* Password Verification Modal */}
      <AnimatePresence>
        {showPasswordPrompt && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter mb-2">Acesso Restrito</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-6">Confirme sua senha de Admin para continuar</p>
              
              <div className="space-y-4">
                <input 
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Sua senha..."
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-center font-bold outline-none focus:ring-2 focus:ring-accent/20 transition-all text-slate-900"
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

interface CategorySectionProps {
  type: CategoryType;
  categories: Category[];
  loading: boolean;
  onDelete: (id: string) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({ type, categories, loading, onDelete }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || submitting) return;

    try {
      setSubmitting(true);
      await addDoc(collection(db, 'categories'), {
        name: newCategoryName.trim(),
        type: type.id,
        createdAt: serverTimestamp()
      });
      setNewCategoryName('');
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="bg-white rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-slate-100 p-6"
    >
      <h2 className="text-base font-bold text-slate-800 mb-4">{type.label}</h2>
      
      <form onSubmit={handleAddCategory} className="flex gap-2 mb-6">
        <input 
          type="text"
          required
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder={type.placeholder}
          className="flex-1 h-10 border border-slate-200 rounded-lg px-3 text-sm text-slate-600 outline-none focus:border-sky-300 transition-all placeholder:text-slate-400 shadow-sm"
        />
        <button 
          type="submit"
          disabled={submitting || !newCategoryName.trim()}
          className="w-10 h-10 bg-sky-300 text-white flex items-center justify-center rounded-lg hover:bg-sky-400 transition-all disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
      </form>

      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {categories.map((cat) => (
            <motion.div
              layout
              key={cat.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-between py-3 px-1"
            >
              <span className="text-sm font-medium text-slate-900">{cat.name}</span>
              <button 
                onClick={() => onDelete(cat.id)}
                className="p-1 text-slate-400 hover:text-danger rounded-md transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {!loading && categories.length === 0 && (
          <div className="text-center py-6 opacity-30 italic text-xs text-slate-400">
            Nenhum item cadastrado
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-sky-400/30" />
          </div>
        )}
      </div>
    </motion.div>
  );
}
