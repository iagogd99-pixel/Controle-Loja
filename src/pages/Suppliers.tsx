import React, { useEffect, useState } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X,
  Phone,
  Mail,
  MapPin,
  Building
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Supplier } from '@/src/types';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '@/src/contexts/AuthContext';

export default function Suppliers() {
  const { isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    email: '',
    phone: '',
    cnpj: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.id), formData);
      } else {
        await addDoc(collection(db, 'suppliers'), {
          ...formData,
          createdAt: new Date().toISOString(),
        });
      }
      closeModal();
      setSelectedSupplier(null);
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar fornecedor');
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!isAdmin) {
      alert('Apenas administradores podem excluir fornecedores.');
      return;
    }
    if (window.confirm('Tem certeza que deseja excluir este fornecedor?')) {
      try {
        await deleteDoc(doc(db, 'suppliers', id));
        setSelectedSupplier(null);
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir fornecedor');
      }
    }
  };

  const openForm = (supplier?: Supplier, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name || '',
        address: supplier.address || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        cnpj: supplier.cnpj || '',
      });
    } else {
      setEditingSupplier(null);
      setFormData({
        name: '',
        address: '',
        email: '',
        phone: '',
        cnpj: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
  };

  const filteredSuppliers = suppliers.filter(s => 
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.cnpj && s.cnpj.includes(searchTerm))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">Fornecedores</h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Parceiros de Negócio</p>
          </div>
        </div>
        <button 
          onClick={() => openForm()}
          className="bg-accent hover:bg-accent/90 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase tracking-widest"
        >
          <Plus className="w-5 h-5" /> Novo Fornecedor
        </button>
      </div>

      <div className="relative px-2">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input 
          type="text" 
          placeholder="Buscar..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-accent/20 transition-all text-xs font-bold"
        />
      </div>

      <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 px-2">
        {filteredSuppliers.map((supplier) => (
          <motion.button 
            layoutId={`supplier-${supplier.id}`}
            key={supplier.id}
            onClick={() => setSelectedSupplier(supplier)}
            className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all text-left flex flex-col group relative overflow-hidden"
          >
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-accent/10 transition-colors">
              <Truck className="w-5 h-5 text-slate-400 group-hover:text-accent" />
            </div>
            <h3 className="font-black text-slate-800 text-[11px] uppercase tracking-tighter leading-tight line-clamp-2 h-8">
              {supplier.name || 'Sem Nome'}
            </h3>
            <div className="mt-2 text-[8px] font-bold text-slate-400 uppercase tracking-widest truncate">
              {supplier.cnpj || 'PESSOA FÍSICA'}
            </div>
          </motion.button>
        ))}
      </div>

      {filteredSuppliers.length === 0 && !loading && (
        <div className="py-20 text-center px-4">
          <div className="bg-white p-8 rounded-[40px] border border-dashed border-slate-200 inline-block w-full max-w-sm">
            <Truck className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-[10px] text-slate-300 font-black tracking-widest uppercase">Nenhum fornecedor cadastrado</p>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedSupplier && !isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSupplier(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              layoutId={`supplier-${selectedSupplier.id}`}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="absolute top-5 right-5 z-20">
                <button 
                  onClick={() => setSelectedSupplier(null)} 
                  className="p-2.5 bg-white/80 hover:bg-white rounded-full shadow-lg transition-colors text-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 pb-6 bg-accent text-white">
                <div className="p-4 bg-white/10 rounded-3xl w-fit mb-4">
                   <Truck className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black tracking-tighter uppercase leading-tight line-clamp-2">
                  {selectedSupplier.name}
                </h2>
                <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">Dados do Fornecedor</p>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-4">
                <InfoItem icon={Mail} label="E-mail Contato" value={selectedSupplier.email || 'Não informado'} />
                <InfoItem icon={Phone} label="WhatsApp / Telefone" value={selectedSupplier.phone || 'Não informado'} />
                <InfoItem icon={Building} label="CNPJ / Documento" value={selectedSupplier.cnpj || 'Não informado'} />
                <InfoItem icon={MapPin} label="Endereço Comercial" value={selectedSupplier.address || 'Não informado'} />
                
                <div className="pt-6 grid grid-cols-2 gap-2">
                  <button
                    onClick={(e) => openForm(selectedSupplier, e)}
                    className="py-4 bg-primary text-white font-black rounded-3xl flex items-center justify-center gap-2 text-xs shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform uppercase"
                  >
                    <Edit2 className="w-4 h-4" /> Editar
                  </button>
                  <button
                    onClick={(e) => handleDelete(selectedSupplier.id, e)}
                    className="py-4 bg-danger/10 text-danger font-black rounded-3xl flex items-center justify-center gap-2 text-xs hover:bg-danger hover:text-white transition-all uppercase"
                  >
                    <Trash2 className="w-4 h-4" /> Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Form Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={closeModal}
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
             />
             <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden relative z-10"
             >
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-black text-primary uppercase tracking-tighter">
                    {editingSupplier ? 'Editar' : 'Novo'} Fornecedor
                  </h2>
                  <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <FormInput label="Nome / Razão Social" value={formData.name} onChange={(v) => setFormData({...formData, name: v})} />
                  
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="E-mail" type="email" value={formData.email} onChange={(v) => setFormData({...formData, email: v})} />
                    <FormInput label="WhatsApp" value={formData.phone} onChange={(v) => setFormData({...formData, phone: v})} />
                  </div>

                  <FormInput label="CNPJ" value={formData.cnpj} onChange={(v) => setFormData({...formData, cnpj: v})} />

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Endereço Comercial</label>
                    <textarea 
                      rows={2}
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-accent transition-all text-xs font-bold resize-none"
                    />
                  </div>
                  
                  <div className="pt-4 flex gap-2">
                    <button 
                      type="submit"
                      className="w-full py-4 bg-accent text-white font-black rounded-3xl shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all text-xs uppercase"
                    >
                      {editingSupplier ? 'Salvar Alterações' : 'Finalizar Cadastro'}
                    </button>
                  </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: any) {
  return (
    <div className="p-4 bg-slate-50 rounded-3xl border border-slate-100">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3 h-3 text-slate-400" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-xs font-black text-slate-800 leading-tight">{value}</p>
    </div>
  );
}

function FormInput({ label, type = "text", value, onChange }: any) {
  return (
    <div>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</label>
      <input 
        type={type} 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 focus:ring-2 focus:ring-accent transition-all text-xs font-bold"
      />
    </div>
  );
}
