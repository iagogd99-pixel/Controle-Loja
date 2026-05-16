import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Loader2,
  Tag,
  Maximize2,
  Palette,
  Users
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
import { cn } from '@/src/lib/utils';
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

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
      {CATEGORY_TYPES.map((type) => (
        <CategorySection 
          key={type.id}
          type={type}
          categories={categories.filter(c => c.type === type.id)}
          loading={loading}
        />
      ))}
    </div>
  );
}

interface CategorySectionProps {
  type: CategoryType;
  categories: Category[];
  loading: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({ type, categories, loading }) => {
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

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (error) {
      console.error(error);
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
                onClick={() => handleDelete(cat.id)}
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
