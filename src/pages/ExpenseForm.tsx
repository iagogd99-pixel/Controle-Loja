import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileText,
} from "lucide-react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import {
  formatCurrency,
  cn,
  getBrasiliaISO,
  getBrasiliaTime,
} from "@/src/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";

export default function ExpenseForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Core fields
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<"operacional" | "pessoal" | "manutenção" | "outros">("operacional");
  const [date, setDate] = useState(getBrasiliaTime().toISOString().slice(0, 16));

  // Payment Options duplicated from PurchaseForm
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentMethod2, setPaymentMethod2] = useState("pix");
  const [splitAmount1, setSplitAmount1] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "pending">("paid");
  const [paymentStatus2, setPaymentStatus2] = useState<"paid" | "pending">("paid");
  
  const [discount, setDiscount] = useState(0);
  const [discount2, setDiscount2] = useState(0);
  const [interest, setInterest] = useState(0);
  const [interest2, setInterest2] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [installments2, setInstallments2] = useState(1);

  useEffect(() => {
    if (id) {
      const fetchExpense = async () => {
        setLoading(true);
        try {
          const expenseSnap = await getDoc(doc(db, "expenses", id));
          if (expenseSnap.exists()) {
            const data = expenseSnap.data();
            setName(data.description || "");
            setAmount(data.baseAmount?.toString() || data.amount?.toString() || "");
            setNote(data.note || "");
            setCategory(data.category || "operacional");
            setPaymentMethod(data.paymentMethod || "dinheiro");
            setPaymentStatus(data.status || "paid");
            setDate(data.date ? data.date.slice(0, 16) : getBrasiliaTime().toISOString().slice(0, 16));

            // Extra split payment parameters
            setIsSplitPayment(data.isSplitPayment || false);
            setPaymentMethod2(data.paymentMethod2 || "pix");
            setSplitAmount1(data.splitAmount1 || 0);
            setPaymentStatus2(data.paymentStatus2 || "paid");
            setDiscount(data.discount || 0);
            setDiscount2(data.discount2 || 0);
            setInterest(data.interest || 0);
            setInterest2(data.interest2 || 0);
            setInstallments(data.installments || 1);
            setInstallments2(data.installments2 || 1);
          } else {
            alert("Despesa não encontrada.");
            navigate("/despesas");
          }
        } catch (error) {
          console.error("Erro ao carregar despesa:", error);
          alert("Erro ao carregar despesa.");
        } finally {
          setLoading(false);
        }
      };
      fetchExpense();
    }
  }, [id, navigate]);

  const subtotal = Number(amount) || 0;
  const finalTotal = isSplitPayment
    ? Math.max(0, (subtotal - discount + interest) - discount2 + interest2)
    : Math.max(0, subtotal - discount + interest);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || submitting) return;

    if (!name.trim()) {
      alert("Por favor, preencha o nome da despesa.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      alert("Por favor, insira um valor válido.");
      return;
    }

    try {
      setSubmitting(true);

      const isM1Installment = paymentMethod === "cartão" || paymentMethod === "transferência";
      const isM2Installment = isSplitPayment && (paymentMethod2 === "cartão" || paymentMethod2 === "transferência");

      const numInstallments1 = isM1Installment ? installments : 1;
      const numInstallments2 = isM2Installment ? installments2 : 1;

      const expenseData = {
        description: name.trim(),
        amount: finalTotal,
        baseAmount: subtotal,
        note: note.trim(),
        category,
        date,
        status: paymentStatus,
        paymentMethod,

        // Split settings matching purchase
        isSplitPayment,
        discount,
        discount2: isSplitPayment ? discount2 : 0,
        interest,
        interest2: isSplitPayment ? interest2 : 0,
        paymentMethod2: isSplitPayment ? paymentMethod2 : null,
        splitAmount1: isSplitPayment ? (splitAmount1 - discount + interest) : 0,
        splitAmount2: isSplitPayment ? Math.max(0, (subtotal - splitAmount1) - discount2 + interest2) : 0,
        paymentStatus2: isSplitPayment ? paymentStatus2 : null,
        installments: numInstallments1,
        installments2: isSplitPayment ? numInstallments2 : 1,

        userId: profile.uid,
        userName: profile.name,
        updatedAt: serverTimestamp(),
      };

      if (id) {
        await updateDoc(doc(db, "expenses", id), expenseData);
        alert("Despesa atualizada com sucesso!");
      } else {
        await addDoc(collection(db, "expenses"), {
          ...expenseData,
          timestamp: getBrasiliaISO(),
        });
        alert("Despesa lançada com sucesso!");
      }

      navigate("/despesas");
    } catch (error) {
      console.error("Erro ao salvar despesa:", error);
      alert("Erro ao salvar despesa.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] w-full flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Carregando dados da despesa...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto w-full space-y-6 pb-12">
      {/* Header element like Nova Compra */}
      <header className="flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/despesas")}
            className="w-10 h-10 bg-primary/5 rounded-xl flex items-center justify-center text-primary hover:bg-primary/10 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none">
              {id ? "Editar Despesa" : "Nova Despesa"}
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">
              {id
                ? `Despesa #${id.slice(-6).toUpperCase()}`
                : "Registrar Lançamento"}
            </p>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 w-fit h-fit font-mono">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          {profile?.name}
        </div>
      </header>

      {/* Main Container mirroring the structure of Purchase Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-[40px] shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-lg font-bold text-primary flex items-center gap-2">
              <FileText className="w-5 h-5" /> Detalhes do Gasto
            </h3>
            <span className="bg-danger/10 text-danger text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
              Lançamento Direto
            </span>
          </div>
        </div>

        {/* Input Fields Area */}
        <div className="p-6 space-y-5">
          {/* Nome da Despesa */}
          <div className="flex flex-col gap-1">
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">
              Nome da Despesa *
            </p>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aluguel da Loja, Sabão, Propaganda..."
              className="w-full px-3 py-3 bg-white border border-gray-200 focus:border-accent rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent transition-all"
            />
          </div>

          {/* Valor da Despesa & Data da Despesa */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">
                Valor da Despesa (R$) *
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3 py-3 bg-white border border-gray-200 focus:border-accent rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">
                Data do Lançamento *
              </p>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-3 bg-white border border-gray-200 focus:border-accent rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
          </div>

          {/* Categoria & Observações */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">
                Categoria da Despesa *
              </p>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-3 bg-white border border-gray-200 focus:border-accent rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent transition-all"
              >
                <option value="operacional">Operacional</option>
                <option value="pessoal">Pessoal</option>
                <option value="manutenção">Manutenção</option>
                <option value="outros">Outros</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">
                Observações / Descrição detalhada
              </p>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Referente à internet fibra"
                className="w-full px-3 py-3 bg-white border border-gray-200 focus:border-accent rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-1 focus:ring-accent transition-all"
              />
            </div>
          </div>
        </div>

        {/* Payment & Totals Area EXACTLY matching PurchaseForm */}
        <div className="p-4 bg-slate-50 rounded-b-[40px] space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] border-t border-gray-100">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase">
                  Pagamento
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIsSplitPayment(!isSplitPayment);
                    if (!isSplitPayment) setSplitAmount1(finalTotal / 2);
                  }}
                  className={cn(
                    "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                    isSplitPayment
                      ? "bg-accent border-accent text-white shadow-lg animate-bounce-subtle"
                      : "bg-white border-gray-200 text-slate-600 hover:border-accent",
                  )}
                >
                  {isSplitPayment ? "Meios Combinados" : "Combinar Meios"}
                </button>
              </div>

              <div className="space-y-3">
                {/* First Method */}
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setPaymentStatus("paid")}
                      className={cn(
                        "py-2.5 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                        paymentStatus === "paid"
                          ? "bg-accent border-accent text-white shadow-lg"
                          : "bg-white border-gray-200 text-slate-600",
                      )}
                    >
                      Pago Agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentStatus("pending")}
                      className={cn(
                        "py-2.5 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                        paymentStatus === "pending"
                          ? "bg-danger border-danger text-white shadow-lg"
                          : "bg-white border-gray-200 text-slate-600",
                      )}
                    >
                      A Pagar
                    </button>
                  </div>
                  {isSplitPayment && (
                    <div className="flex justify-between items-center px-1 mb-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase">
                        Meio 1 (Valor)
                      </span>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                        <span className="text-[8px] font-bold text-slate-400 mr-1">
                          R$
                        </span>
                        <input
                          type="number"
                          value={splitAmount1 || ""}
                          onChange={(e) =>
                            setSplitAmount1(Number(e.target.value))
                          }
                          placeholder="0.00"
                          className="w-16 text-[10px] font-black text-slate-700 outline-none bg-transparent"
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-1.5">
                    {["dinheiro", "pix", "cartão", "transf."].map((method) => {
                      const isActive =
                        paymentMethod ===
                        (method === "transf." ? "transferência" : method);
                      return (
                        <button
                          key={`m1-${method}`}
                          type="button"
                          onClick={() =>
                            setPaymentMethod(
                              method === "transf." ? "transferência" : method,
                            )
                          }
                          className={cn(
                            "py-2 px-2.5 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-wide text-center truncate",
                            isActive
                              ? "bg-accent border-accent text-white shadow-lg"
                              : "bg-white border-gray-200 text-slate-600 hover:border-accent",
                          )}
                        >
                          {method}
                        </button>
                      );
                    })}
                  </div>
                  {(paymentMethod === "cartão" ||
                    paymentMethod === "transferência") && (
                    <div className="space-y-2 px-1 pt-1">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                            Desc. (R$)
                          </p>
                          <input
                            type="number"
                            value={discount || ""}
                            onChange={(e) => setDiscount(Number(e.target.value))}
                            placeholder="0,00"
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none"
                          />
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                            Juros (R$)
                          </p>
                          <input
                            type="number"
                            value={interest || ""}
                            onChange={(e) => setInterest(Number(e.target.value))}
                            placeholder="0,00"
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none"
                          />
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                            Parcelas
                          </p>
                          <select
                            value={installments}
                            onChange={(e) =>
                              setInstallments(Number(e.target.value))
                            }
                            className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none text-accent"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
                              (n) => (
                                <option key={n} value={n}>
                                  {n}x
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Second Method */}
                {isSplitPayment && (
                  <motion.div
                    key="split-payment-2"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-1.5 pt-2 border-t border-slate-200/50"
                  >
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setPaymentStatus2("paid")}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                          paymentStatus2 === "paid"
                            ? "bg-accent border-accent text-white shadow-lg"
                            : "bg-white border-gray-200 text-slate-600",
                        )}
                      >
                        Pago Agora
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatus2("pending")}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-widest",
                          paymentStatus2 === "pending"
                            ? "bg-danger border-danger text-white shadow-lg"
                            : "bg-white border-gray-200 text-slate-600",
                        )}
                      >
                        A Pagar
                      </button>
                    </div>
                    <div className="flex justify-between items-center px-1 mb-1">
                      <span className="text-[8px] font-black text-slate-400 uppercase">
                        Meio 2
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-slate-400">
                          RESTANTE:
                        </span>
                        <span className="text-[10px] font-black text-accent font-mono">
                          {formatCurrency(
                            Math.max(0, (subtotal - splitAmount1) - discount2 + interest2),
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {["dinheiro", "pix", "cartão", "transf."].map(
                        (method) => {
                          const isActive =
                            paymentMethod2 ===
                            (method === "transf." ? "transferência" : method);
                          return (
                            <button
                              key={`m2-${method}`}
                              type="button"
                              onClick={() =>
                                setPaymentMethod2(
                                  method === "transf."
                                    ? "transferência"
                                    : method,
                                )
                              }
                              className={cn(
                                "py-2 px-2.5 rounded-xl border text-[10px] font-bold transition-all uppercase tracking-wide text-center truncate",
                                isActive
                                  ? "bg-accent border-accent text-white shadow-lg"
                                  : "bg-white border-gray-200 text-slate-600 hover:border-accent",
                              )}
                            >
                              {method}
                            </button>
                          );
                        },
                      )}
                    </div>
                    {(paymentMethod2 === "cartão" ||
                      paymentMethod2 === "transferência") && (
                      <div className="space-y-2 px-1 pt-1">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                              Desc. (R$)
                            </p>
                            <input
                              type="number"
                              value={discount2 || ""}
                              onChange={(e) =>
                                setDiscount2(Number(e.target.value))
                              }
                              placeholder="0,00"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none"
                            />
                          </div>
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                              Juros (R$)
                            </p>
                            <input
                              type="number"
                              value={interest2 || ""}
                              onChange={(e) =>
                                setInterest2(Number(e.target.value))
                              }
                              placeholder="0,00"
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none"
                            />
                          </div>
                          <div>
                            <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">
                              Parcelas
                            </p>
                            <select
                              value={installments2}
                              onChange={(e) =>
                                setInstallments2(Number(e.target.value))
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-accent outline-none text-accent"
                            >
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
                                (n) => (
                                  <option key={n} value={n}>
                                    {n}x
                                  </option>
                                ),
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Subtotal & Final total matching exactly the aesthetic values of purchase form */}
          <div className="pt-2 border-t border-gray-200/60 font-medium">
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold mb-1 px-1">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center mb-3 pt-2 border-t border-gray-200/40 px-1">
              <span className="text-xs font-black text-slate-700 uppercase tracking-tight">
                Total da Despesa
              </span>
              <span className="text-2xl font-black text-primary font-mono">
                {formatCurrency(finalTotal)}
              </span>
            </div>
            <button
              disabled={submitting || !name.trim() || !amount || Number(amount) <= 0}
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-white font-black py-4 rounded-2xl shadow-xl shadow-accent/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:grayscale text-[10px] uppercase tracking-widest cursor-pointer"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {id ? "SALVAR ALTERAÇÕES" : "FINALIZAR LANÇAMENTO"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
