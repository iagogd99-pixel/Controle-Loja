import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  Image as ImageIcon, 
  Camera, 
  X, 
  Loader2,
  Package,
  ChevronDown
} from 'lucide-react';
import { 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  getDocs,
  collection,
  query,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/src/lib/firebase';
import { Product } from '@/src/types';
import { cn, sortSizes, getBrasiliaISO } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  sku: z.string().min(2, 'SKU obrigatório'),
  category: z.string().min(1, 'Categoria obrigatória'),
  brand: z.string().optional(),
  description: z.string().optional(),
  size: z.string().optional(),
  sizes: z.array(z.string()).optional(),
  color: z.string().optional(),
  gender: z.string().optional(),
  stock: z.number().min(0, 'Estoque não pode ser negativo'),
  minStock: z.number().min(0, 'Estoque mínimo não pode ser negativo'),
  baseCostPrice: z.number().min(0, 'Preço de custo base obrigatório'),
  costOverheadPercent: z.number().min(0, 'Porcentagem não pode ser negativa'),
  costPrice: z.number().min(0, 'Preço de custo obrigatório'),
  salePrice: z.number().min(0, 'Preço de venda obrigatório'),
  status: z.enum(['active', 'inactive']),
});

type FormData = z.infer<typeof schema>;

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<{id: string, name: string, type: string}[]>([]);
  
  const { register, handleSubmit, reset, formState: { errors }, watch, setValue } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'active',
      stock: 0,
      minStock: 0,
      baseCostPrice: 0,
      costOverheadPercent: 0,
      costPrice: 0,
      salePrice: 0,
      sizes: []
    }
  });

  const watchedBaseCost = watch('baseCostPrice');
  const watchedOverheadPercent = watch('costOverheadPercent');

  useEffect(() => {
    const base = watchedBaseCost !== undefined ? watchedBaseCost : 0;
    const pct = watchedOverheadPercent !== undefined ? watchedOverheadPercent : 0;
    const finalCost = base * (1 + pct / 100);
    setValue('costPrice', Number(finalCost.toFixed(2)));
  }, [watchedBaseCost, watchedOverheadPercent, setValue]);

  useEffect(() => {
    const fetchDropdowns = async () => {
      const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setCategories(docs);
    };
    fetchDropdowns();

    if (id) {
      const fetchProduct = async () => {
        setFetching(true);
        const docRef = doc(db, 'products', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const baseCost = data.baseCostPrice !== undefined ? data.baseCostPrice : (data.costPrice || 0);
          const overhead = data.costOverheadPercent !== undefined ? data.costOverheadPercent : 0;
          reset({
            ...(data as FormData),
            baseCostPrice: baseCost,
            costOverheadPercent: overhead,
            costPrice: data.costPrice || 0,
          });
          setImages(data.images || []);
          setSelectedSizes(data.sizes || (data.size ? [data.size] : []));
          setSizeStock(data.sizeStock || {});
        }
        setFetching(false);
      };
      fetchProduct();
    }
  }, [id, reset]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      // Calculate total stock from sizeStock if sizes exist
      let totalStock = data.stock;
      if (selectedSizes.length > 0) {
        totalStock = selectedSizes.reduce((acc, size) => acc + (sizeStock[size] || 0), 0);
      }

      const payload = {
        ...data,
        stock: totalStock,
        sizes: selectedSizes,
        sizeStock,
        images,
        updatedAt: getBrasiliaISO(),
      };

      let newId = id;
      if (id) {
        await updateDoc(doc(db, 'products', id), payload);
      } else {
        const docRef = await addDoc(collection(db, 'products'), {
          ...payload,
          createdAt: getBrasiliaISO(),
        });
        newId = docRef.id;
      }
      
      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        // Append product ID to return URL so it can be auto-added
        const separator = returnTo.includes('?') ? '&' : '?';
        navigate(`${returnTo}${separator}productId=${newId}`);
      } else {
        navigate('/produtos');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar produto');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-accent" />
        <p className="mt-4 text-slate-500">Carregando dados do produto...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-12">
      <div className="flex items-center gap-3 px-2">
        <button 
          onClick={() => navigate('/produtos')}
          className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-primary transition-all shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">
              {id ? 'Editar' : 'Novo'} Produto
            </h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">Estoque & Cadastro</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Main Info */}
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-4 bg-accent rounded-full" />
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informações Gerais</h3>
          </div>
          
          <div className="mb-6 pb-6 border-b border-slate-50 space-y-3">
            <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Fotos do Produto</label>
            <div className="flex gap-3">
              <label className="w-20 h-20 flex flex-col items-center justify-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors shrink-0">
                <Camera className="w-5 h-5 text-slate-400" />
                <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {images.map((img, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-slate-100 shrink-0 shadow-sm">
                    <img src={img} className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeImage(idx)} className="absolute top-1 right-1 p-1 bg-danger text-white rounded-lg shadow-lg">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Nome do Produto</label>
              <input 
                {...register('name')}
                placeholder="Ex: Tênis Runner Pro v2"
                className={cn("form-input placeholder:text-[9px] placeholder:text-slate-300 py-2.5 text-sm", errors.name && "border-danger")}
              />
              {errors.name && <p className="text-[10px] text-danger font-bold">{errors.name.message}</p>}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">SKU / Código</label>
                <input 
                  {...register('sku')}
                  placeholder="EX: TN-PRO-001"
                  className={cn("form-input placeholder:text-[9px] placeholder:text-slate-300 py-2.5 text-sm", errors.sku && "border-danger")}
                />
                {errors.sku && <p className="text-[10px] text-danger font-bold">{errors.sku.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Categoria</label>
                <select {...register('category')} className={cn("form-input py-2.5 text-sm bg-slate-50 border-none", errors.category && "border-danger")}>
                  <option value="">Selecione...</option>
                  {categories.filter(c => c.type === 'categoria').map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Tamanhos Disponíveis</label>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const sizeCats = categories.filter(c => c.type === 'tamanho');
                    const sortedSizeNames = sortSizes(sizeCats.map(c => c.name));
                    return sortedSizeNames.map(name => {
                      const c = sizeCats.find(cat => cat.name === name);
                      if (!c) return null;
                      const isSelected = selectedSizes.includes(c.name);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedSizes(prev => prev.filter(s => s !== c.name));
                            } else {
                              setSelectedSizes(prev => [...prev, c.name]);
                            }
                          }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-black transition-all border",
                            isSelected 
                              ? "bg-accent border-accent text-white shadow-lg shadow-accent/20" 
                              : "bg-slate-50 border-slate-100 text-slate-500 hover:border-accent/30"
                          )}
                        >
                          {c.name}
                        </button>
                      );
                    });
                  })()}
                  {categories.filter(c => c.type === 'tamanho').length === 0 && (
                    <p className="text-[10px] text-slate-400 italic">Nenhum tamanho cadastrado em Configurações</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Cor Principal</label>
                  <select {...register('color')} className="form-input py-2.5 text-sm bg-slate-50 border-none">
                     <option value="">Nenhuma</option>
                     {categories.filter(c => c.type === 'cor').map(c => (
                       <option key={c.id} value={c.name}>{c.name}</option>
                     ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Gênero</label>
                  <select {...register('gender')} className="form-input py-2.5 text-sm bg-slate-50 border-none">
                     <option value="">Nenhum</option>
                     <option value="Masculino">Masculino</option>
                     <option value="Feminino">Feminino</option>
                     <option value="Unissex">Unissex</option>
                     {categories.filter(c => c.type === 'gênero').map(c => (
                       <option key={c.id} value={c.name}>{c.name}</option>
                     ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Status</label>
                  <select {...register('status')} className="form-input py-2.5 text-sm bg-slate-50 border-none">
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Descrição</label>
            <textarea 
              {...register('description')}
              rows={2}
              className="form-input resize-none placeholder:text-[9px] placeholder:text-slate-300 py-2.5 text-sm"
              placeholder="Detalhes sobre o produto..."
            />
          </div>
        </div>

        {/* Stock by Size Section */}
        <AnimatePresence>
          {selectedSizes.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4 overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-4 bg-primary rounded-full" />
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estoque por Tamanho</h3>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {sortSizes(selectedSizes).map(size => (
                  <div key={size} className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Tam. {size}</label>
                    <input 
                      type="number"
                      min="0"
                      value={sizeStock[size] || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setSizeStock(prev => ({ ...prev, [size]: val }));
                      }}
                      className="form-input py-2 text-center text-xs font-black bg-slate-50 border-none"
                    />
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-50">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                  Total de unidades: <span className="text-primary">{selectedSizes.reduce((acc, s) => acc + (sizeStock[s] || 0), 0)}</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pricing & Stock */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-4 bg-success rounded-full" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financeiro</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Custo Base (R$)</label>
                  <input 
                    type="number" step="0.01" 
                    {...register('baseCostPrice', { valueAsNumber: true })} 
                    className="form-input py-2.5 text-sm bg-slate-50 border-none"
                    placeholder="0,00"
                  />
                  {errors.baseCostPrice && (
                    <p className="text-[10px] text-danger font-bold pl-1">{errors.baseCostPrice.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Custos Extras (%)</label>
                  <input 
                    type="number" step="0.0001" 
                    {...register('costOverheadPercent', { valueAsNumber: true })} 
                    className="form-input py-2.5 text-sm bg-slate-50 border-none"
                    placeholder="0,0000"
                  />
                  {errors.costOverheadPercent && (
                    <p className="text-[10px] text-danger font-bold pl-1">{errors.costOverheadPercent.message}</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Custo Final (R$)</label>
                  <input 
                    type="number" step="0.01" 
                    {...register('costPrice', { valueAsNumber: true })} 
                    className="form-input py-2.5 text-sm bg-slate-100 border-none opacity-80 pointer-events-none select-none font-bold"
                    placeholder="0,00"
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Venda (R$)</label>
                  <input 
                    type="number" step="0.01" 
                    {...register('salePrice', { valueAsNumber: true })} 
                    className={cn("form-input py-2.5 text-sm font-black text-accent", errors.salePrice ? "border-danger" : "bg-accent/5 border-none")}
                    placeholder="0,00"
                  />
                  {errors.salePrice && (
                    <p className="text-[10px] text-danger font-bold pl-1">{errors.salePrice.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-4 bg-orange-400 rounded-full" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Controle</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Estoque Total</label>
                <input 
                  type="number" 
                  {...register('stock', { valueAsNumber: true })} 
                  className={cn(
                    "form-input py-2.5 text-sm bg-slate-50 border-none",
                    selectedSizes.length > 0 && "opacity-50 pointer-events-none"
                  )}
                  placeholder="0"
                  readOnly={selectedSizes.length > 0}
                  value={selectedSizes.length > 0 ? selectedSizes.reduce((acc, s) => acc + (sizeStock[s] || 0), 0) : watch('stock')}
                />
                {selectedSizes.length > 0 && (
                  <p className="text-[8px] text-slate-400 italic">Calculado automaticamente pelos tamanhos</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-600 uppercase ml-1">Mínimo</label>
                <input 
                  type="number" 
                  {...register('minStock', { valueAsNumber: true })} 
                  className="form-input py-2.5 text-sm bg-danger/5 border-none text-danger"
                  placeholder="5"
                />
              </div>
            </div>
          </div>
        </div>


        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button 
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-2 text-xs uppercase"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {id ? 'Salvar Alterações' : 'Cadastrar Produto'}
          </button>
          <button 
            type="button"
            onClick={() => navigate('/produtos')}
            className="sm:w-1/3 bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-colors text-xs uppercase"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
