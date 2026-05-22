import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Search,
  Loader2,
  Save,
  Package,
  User,
  History,
  ShoppingCart,
  Truck,
  CheckCircle2,
  FileText,
  X,
} from "lucide-react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  serverTimestamp,
  increment,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  formatCurrency,
  cn,
  getProductSku,
  sortSizes,
  getBrasiliaISO,
  getBrasiliaTime,
} from "@/src/lib/utils";
import { format, toZonedTime } from "date-fns-tz";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  sizeStock?: Record<string, number>;
  costPrice: number;
  minStock: number;
  images?: string[];
  size?: string;
  sizes?: string[];
}

interface NoteItem {
  productId: string;
  sku: string;
  size?: string;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Supplier {
  id: string;
  name: string;
}

export default function LancarNota() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Cart
  const [cart, setCart] = useState<NoteItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedSupplierName, setSelectedSupplierName] = useState("");
  const [noteNumber, setNoteNumber] = useState("");
  const [observation, setObservation] = useState("");
  const [entryDate, setEntryDate] = useState(
    getBrasiliaTime().toISOString().slice(0, 16),
  );

  // Search state
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [sizeModalProduct, setSizeModalProduct] = useState<Product | null>(
    null,
  );
  const [sizeEntries, setSizeEntries] = useState<
    Record<string, { qty: number; price: number }>
  >({});

  const [categories, setCategories] = useState<
    { id: string; name: string; type: string }[]
  >([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const supplierSnap = await getDocs(collection(db, "suppliers"));
        const categorySnap = await getDocs(collection(db, "categories"));

        setSuppliers(
          supplierSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Supplier[],
        );
        setCategories(
          categorySnap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[],
        );
      } catch (error) {
        console.error("Error loading suppliers/categories:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Use onSnapshot for products
    const q = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[],
      );
    });

    return () => unsubscribe();
  }, []);

  const addToCart = (product: Product, size?: string, quantity: number = 1, price?: number) => {
    const finalSize = size || product.size;
    const itemSku = getProductSku(product.sku, finalSize);
    const cartItemId = `${product.id}-${finalSize || "no-size"}`;
    const finalPrice = price !== undefined ? price : product.costPrice || 0;

    setCart((prevCart) => {
      const existing = prevCart.find(
        (item) =>
          `${item.productId}-${item.size || "no-size"}` === cartItemId,
      );
      if (existing) {
        return prevCart.map((item) =>
          `${item.productId}-${item.size || "no-size"}` === cartItemId
            ? {
                ...item,
                quantity: item.quantity + quantity,
                total: (item.quantity + quantity) * finalPrice,
                price: finalPrice,
              }
            : item,
        );
      } else {
        return [
          ...prevCart,
          {
            productId: product.id,
            sku: itemSku,
            size: finalSize,
            name: product.name + (finalSize ? ` (${finalSize})` : ""),
            quantity: quantity,
            price: finalPrice,
            total: finalPrice * quantity,
          },
        ];
      }
    });
  };

  const openSizeModal = (product: Product) => {
    setSizeModalProduct(product);
    const initialEntries: Record<string, { qty: number; price: number }> = {};
    const allSizes = categories.filter((c) => c.type === "tamanho").map((c) => c.name);
    allSizes.forEach((s) => {
      initialEntries[s] = { qty: 0, price: product.costPrice || 0 };
    });
    setSizeEntries(initialEntries);
  };

  const handleSizeModalSubmit = () => {
    if (!sizeModalProduct) return;
    (Object.entries(sizeEntries) as [string, { qty: number; price: number }][]).forEach(([size, data]) => {
      if (data.qty > 0) {
        addToCart(sizeModalProduct, size, data.qty, data.price);
      }
    });
    setSizeModalProduct(null);
    setSearchTerm("");
  };

  const removeFromCart = (productId: string, size?: string) => {
    const cartItemId = `${productId}-${size || "no-size"}`;
    setCart((prevCart) =>
      prevCart.filter(
        (item) => `${item.productId}-${item.size || "no-size"}` !== cartItemId,
      ),
    );
  };

  const updateQuantity = (productId: string, size: string | undefined, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(productId, size);
      return;
    }
    const cartItemId = `${productId}-${size || "no-size"}`;
    setCart((prevCart) =>
      prevCart.map((item) =>
        `${item.productId}-${item.size || "no-size"}` === cartItemId
          ? { ...item, quantity: newQty, total: newQty * item.price }
          : item,
      ),
    );
  };

  const updatePrice = (productId: string, size: string | undefined, price: number) => {
    const cartItemId = `${productId}-${size || "no-size"}`;
    setCart((prevCart) =>
      prevCart.map((item) =>
        `${item.productId}-${item.size || "no-size"}` === cartItemId
          ? { ...item, price, total: item.quantity * price }
          : item,
      ),
    );
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.total, 0);

  const handleSubmit = async () => {
    if (!profile || cart.length === 0 || submitting) return;
    if (!selectedSupplierId) {
      alert("Selecione um Fornecedor");
      return;
    }
    if (!noteNumber) {
      alert("Digite o Número da Nota");
      return;
    }

    try {
      setSubmitting(true);

      await runTransaction(db, async (transaction) => {
        // 1. Save record to "incoming_notes"
        const invoiceRef = doc(collection(db, "incoming_notes"));
        const invoiceData = {
          supplierId: selectedSupplierId,
          supplierName:
            selectedSupplierName ||
            suppliers.find((s) => s.id === selectedSupplierId)?.name ||
            "Fornecedor Avulso",
          invoiceNumber: noteNumber,
          observation: observation,
          subtotal: cartTotal,
          total: cartTotal,
          items: cart,
          userId: profile.uid,
          userName: profile.name,
          updatedAt: serverTimestamp(),
          timestamp: format(
            toZonedTime(new Date(entryDate), "America/Sao_Paulo"),
            "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
            { timeZone: "America/Sao_Paulo" },
          ),
        };
        transaction.set(invoiceRef, invoiceData);

        // 2. Update stock and register movements for each product
        for (const item of cart) {
          const productRef = doc(db, "products", item.productId);

          // Prepare stock increment
          const updateData: any = {
            stock: increment(item.quantity),
            baseCostPrice: item.price,
            costOverheadPercent: 0,
            costPrice: item.price,
            updatedAt: serverTimestamp(),
          };

          if (item.size) {
            updateData[`sizeStock.${item.size}`] = increment(item.quantity);
          }

          transaction.update(productRef, updateData);

          // Register movement document (which keeps stock audit trails)
          const movementRef = doc(collection(db, "movements"));
          transaction.set(movementRef, {
            productId: item.productId,
            productName:
              item.name + (item.size ? ` (Tamanho: ${item.size})` : ""),
            type: "in",
            quantity: item.quantity,
            reason: `Entrada via Nota nº ${noteNumber}`,
            invoiceId: invoiceRef.id,
            invoiceNumber: noteNumber,
            userId: profile.uid,
            userName: profile.name,
            timestamp: serverTimestamp(),
          });
        }
      });

      alert("Nota lançada e estoque alimentado com sucesso!");
      navigate("/produtos");
    } catch (error) {
      console.error(error);
      alert("Erro ao processar lançamento de nota fiscal.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6 pb-20 p-2 sm:p-0 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary shrink-0">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">
              Lançar Nota
            </h1>
            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">
              Registre a entrada de produtos
            </p>
          </div>
        </div>
      </header>

      {loading ? (
        <div className="h-[40vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Action Form (Left column) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Note & Supplier Details Card */}
            <div className="bg-white rounded-[32px] p-6 shadow-xl border border-gray-100/60 space-y-4">
              <div className="flex items-center gap-2 mb-2 border-b border-slate-50 pb-3">
                <div className="w-8 h-8 bg-primary/5 rounded-lg flex items-center justify-center text-primary">
                  <FileText className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Dados do Documento de Entrada
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase pl-1">
                    Fornecedor*
                  </label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      setSelectedSupplierId(e.target.value);
                      const selected = suppliers.find((s) => s.id === e.target.value);
                      setSelectedSupplierName(selected ? selected.name : "");
                    }}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all"
                  >
                    <option value="">Selecione o Fornecedor</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase pl-1">
                    Número da Nota (NF)*
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 004928"
                    value={noteNumber}
                    onChange={(e) => setNoteNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase pl-1">
                    Data/Hora da Entrada
                  </label>
                  <input
                    type="datetime-local"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all text-slate-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase pl-1">
                    Observação
                  </label>
                  <input
                    type="text"
                    placeholder="Obs. adicionais sobre a nota"
                    value={observation}
                    onChange={(e) => setObservation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Product Quick-Add Card */}
            <div className="bg-white rounded-[32px] p-6 shadow-xl border border-gray-100/60 relative">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-50 pb-3">
                <div className="w-8 h-8 bg-primary/5 rounded-lg flex items-center justify-center text-primary">
                  <Package className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                  Adicionar Produtos ao Estoque
                </h2>
              </div>

              {/* Product search bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Pesquise o produto para alimentar o estoque..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-12 pr-6 py-4.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-primary transition-all shadow-[inset_0_1px_3px_rgba(0,0,0,0.01)]"
                />

                <AnimatePresence>
                  {searchTerm.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute -left-6 -right-6 mt-2 bg-white rounded-[32px] shadow-2xl border border-slate-100/80 z-30 max-h-[60vh] overflow-hidden flex flex-col"
                    >
                      <div className="p-4 border-b border-slate-50 flex justify-between items-center">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Produtos Encontrados ({filteredProducts.length})
                        </span>
                        <button
                          onClick={() => setSearchTerm("")}
                          className="p-1 text-slate-300 hover:text-slate-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="overflow-y-auto flex-1 p-2 space-y-1">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between gap-4 p-3 rounded-2xl transition-all group hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-4 min-w-0 flex-1">
                                <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                                  {product.images?.[0] ? (
                                    <img
                                      src={product.images[0]}
                                      className="w-full h-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <Package className="w-5 h-5 text-slate-300" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-black text-slate-800 leading-tight uppercase truncate">
                                    {product.name}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openSizeModal(product)}
                                className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all shrink-0"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="py-12 text-center">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <ShoppingCart className="w-6 h-6 text-slate-300" />
                            </div>
                            <p className="text-xs font-bold text-slate-400 mb-2">
                              Nenhum produto cadastrado com esse termo
                            </p>
                            <button
                              type="button"
                              onClick={() => navigate("/produtos?new=true")}
                              className="px-4 py-2 text-[9px] uppercase tracking-wider font-black bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors"
                            >
                              Criar Novo Produto
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Cart items list (Right column) */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-3 px-2">
                  <h3 className="text-md font-bold text-primary flex items-center gap-2 uppercase tracking-tight">
                    <ShoppingCart className="w-5 h-5" /> Produtos da Nota
                  </h3>
                  <span className="bg-accent/10 text-accent text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                    {cart.length} itens
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:max-h-[500px]">
                <AnimatePresence mode="popLayout">
                  <div className="space-y-3">
                    {cart.map((item) => {
                      const product = products.find((p) => p.id === item.productId);
                      const productImage = product?.images?.[0];
                      return (
                        <motion.div
                          layout
                          key={`${item.productId}-${item.size || "no-size"}`}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className="bg-slate-50 border border-slate-100 rounded-[24px] p-3 flex items-center gap-4 group relative"
                        >
                          <div className="w-16 h-16 bg-white rounded-2xl overflow-hidden flex-shrink-0 relative">
                            {productImage ? (
                              <img
                                src={productImage}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center opacity-10">
                                <Package className="w-8 h-8" />
                              </div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-slate-800 uppercase leading-tight truncate">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold text-slate-400">
                                SKU: {item.sku}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                Valor Un.:
                              </span>
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.price || ""}
                                  onChange={(e) =>
                                    updatePrice(
                                      item.productId,
                                      item.size,
                                      Number(e.target.value),
                                    )
                                  }
                                  className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-black text-accent outline-none"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-slate-100">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    item.productId,
                                    item.size,
                                    item.quantity - 1,
                                  )
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-danger transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center text-xs font-black text-slate-800">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    item.productId,
                                    item.size,
                                    item.quantity + 1,
                                  )
                                }
                                className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg hover:text-accent transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => removeFromCart(item.productId, item.size)}
                              className="p-2 text-slate-300 hover:text-danger transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </AnimatePresence>
                {cart.length === 0 && (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 opacity-30">
                    <Package className="w-12 h-12 mb-3" />
                    <p className="text-xs font-bold uppercase tracking-widest">
                      Nenhum produto adicionado à nota
                    </p>
                  </div>
                )}
              </div>

              {/* Total and submit */}
              <div className="p-6 bg-slate-50 border-t border-gray-100/60 flex flex-col space-y-4">
                <div className="flex justify-between items-center bg-white p-3.5 rounded-2xl border border-slate-100">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                    Total dos Produtos
                  </span>
                  <span className="text-xl font-black text-primary">
                    {formatCurrency(cartTotal)}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={submitting || cart.length === 0 || !selectedSupplierId || !noteNumber}
                  onClick={handleSubmit}
                  className="w-full bg-accent hover:bg-accent/90 text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale text-[10px] uppercase tracking-widest"
                >
                  {submitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5" />
                  )}
                  Lançar Entrada no Estoque
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select size modal */}
      <AnimatePresence>
        {sizeModalProduct && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 pb-6 border-b border-slate-100/50 flex flex-col relative">
                <div className="pr-12">
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight uppercase leading-tight">
                    {sizeModalProduct.name}
                  </h3>
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-1.5 shadow-none">
                    DEFINIR QUANTIDADES POR TAMANHO
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSizeModalProduct(null)}
                  className="absolute right-6 top-8 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#FAFBFC]">
                <div className="space-y-4">
                  {/* List sizes */}
                  <div className="flex flex-col gap-4">
                    {sortSizes(
                      categories.filter((c) => c.type === "tamanho").map((c) => c.name),
                    ).map((size) => {
                      const entryValue = sizeEntries[size] || { qty: 0, price: sizeModalProduct.costPrice || 0 };
                      return (
                        <div
                          key={size}
                          className="bg-[#FAFBFC] border border-[#EBEFF4] p-5 rounded-[28px] grid grid-cols-[52px_1.25fr_1.1fr] gap-3.5 items-center shadow-[0_1px_3px_rgba(0,0,0,0.01)]"
                        >
                          {/* Col 1: TAM. */}
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] mb-1.5 pl-1.5">
                              Tam.
                            </span>
                            <div className="w-[42px] h-[42px] bg-white border border-[#E2E8F0] rounded-[15px] flex items-center justify-center font-black text-slate-800 text-sm shadow-[0_2px_4px_rgba(0,0,0,0.015)]">
                              {size}
                            </div>
                          </div>

                          {/* Col 2: QUANTIDADE */}
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] mb-1.5 pl-1.5">
                              Quantidade
                            </span>
                            <div className="h-[42px] bg-white border border-[#E2E8F0] rounded-[15px] flex items-center justify-between px-2 shadow-[0_2px_4px_rgba(0,0,0,0.015)]">
                              <button
                                type="button"
                                onClick={() => {
                                  setSizeEntries((prev) => ({
                                    ...prev,
                                    [size]: {
                                      ...prev[size],
                                      qty: Math.max(0, entryValue.qty - 1),
                                    },
                                  }));
                                }}
                                className="w-7 h-7 flex items-center justify-center bg-[#EDF2F7]/70 text-[#718096] rounded-lg hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
                              >
                                <Minus className="w-3 h-3 stroke-[2.5]" />
                              </button>
                              <span className={`text-sm font-black ${entryValue.qty > 0 ? "text-slate-800" : "text-slate-400"}`}>
                                {entryValue.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSizeEntries((prev) => ({
                                    ...prev,
                                    [size]: {
                                      ...prev[size],
                                      qty: entryValue.qty + 1,
                                    },
                                  }));
                                }}
                                className="w-7 h-7 flex items-center justify-center bg-[#EDF2F7]/70 text-[#718096] rounded-lg hover:bg-slate-200 active:scale-95 transition-all cursor-pointer"
                              >
                                <Plus className="w-3 h-3 stroke-[2.5]" />
                              </button>
                            </div>
                          </div>

                          {/* Col 3: CUSTO UN. */}
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] mb-1.5 pl-1.5">
                              Custo un.
                            </span>
                            <div className="h-[42px] bg-white border border-[#E2E8F0] rounded-[15px] flex items-center px-3 gap-1 shadow-[0_2px_4px_rgba(0,0,0,0.015)]">
                              <span className="text-xs font-black text-[#A0AEC0] select-none">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={entryValue.price || ""}
                                onChange={(e) => {
                                  setSizeEntries((prev) => ({
                                    ...prev,
                                    [size]: {
                                      ...prev[size],
                                      price: Number(e.target.value),
                                    },
                                  }));
                                }}
                                className="w-full text-xs font-black text-slate-800 outline-none bg-transparent"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sticky bottom panel */}
              <div className="px-8 py-6 border-t border-slate-100 bg-white flex items-center justify-between gap-4 rounded-b-[40px] shadow-[0_-8px_30px_rgba(0,0,0,0.02)]">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] leading-none">
                    Total
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#94A3B8] leading-none mt-1">
                    Selecionado
                  </span>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-black text-slate-800 leading-none">
                      {(Object.values(sizeEntries) as { qty: number; price: number }[]).reduce((acc, curr) => acc + (curr.qty || 0), 0)}
                    </span>
                    <span className="text-xs font-bold text-slate-600 lowercase leading-none">
                      unidades
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSizeModalSubmit}
                  className="w-[210px] h-14 bg-[#3B82F6] hover:bg-[#2563EB] hover:scale-[1.02] active:scale-95 text-white font-black rounded-[22px] transition-all text-[11px] uppercase tracking-widest shadow-lg shadow-[#3B82F6]/25 flex flex-col items-center justify-center leading-tight cursor-pointer"
                >
                  <span>Adicionar ao</span>
                  <span>Carrinho</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
