import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  FileText,
  DollarSign,
  Calendar as CalendarIcon,
  HelpCircle,
} from "lucide-react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { useAuth } from "@/src/contexts/AuthContext";
import { cn } from "@/src/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";

const getBrasiliaTime = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * -3));
};

const getBrasiliaISO = () => {
  return getBrasiliaTime().toISOString();
};

export default function ExpenseForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Core fields requested by user
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Secondary/Helper fields with sensible defaults (can be edited under "Mais Opções" if desired)
  const [category, setCategory] = useState<"operacional" | "pessoal" | "manutenção" | "outros">("operacional");
  const [paymentMethod, setPaymentMethod] = useState("dinheiro");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [date, setDate] = useState(getBrasiliaTime().toISOString().slice(0, 16));
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (id) {
      const fetchExpense = async () => {
        setLoading(true);
        try {
          const expenseSnap = await getDoc(doc(db, "expenses", id));
          if (expenseSnap.exists()) {
            const data = expenseSnap.data();
            setName(data.description || "");
            setAmount(data.amount?.toString() || "");
            setNote(data.note || "");
            setCategory(data.category || "operacional");
            setPaymentMethod(data.paymentMethod || "dinheiro");
            setStatus(data.status || "paid");
            setDate(data.date ? data.date.slice(0, 16) : getBrasiliaTime().toISOString().slice(0, 16));
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
      const expenseData = {
        description: name.trim(), // Name maps to description so list screen displays it as title
        amount: Number(amount),
        note: note.trim(), // Note maps to detailed description
        paymentMethod,
        category,
        status,
        date,
        userId: profile.uid,
        userName: profile.name,
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
    <div className="max-w-2xl mx-auto w-full space-y-6 pb-12">
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
            <h1 className="text-2xl font-black text-primary tracking-tight leading-none uppercase">
              {id ? "Editar Despesa" : "Nova Despesa"}
            </h1>
            <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">
              {id
                ? `Despesa #${id.slice(-6).toUpperCase()}`
                : "Registrar Lançamento Simples"}
            </p>
          </div>
        </div>
        <div className="text-[10px] font-bold text-slate-400 flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 w-fit h-fit uppercase">
          <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          {profile?.name}
        </div>
      </header>

      {/* Form Container */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-2">
            <div className="p-2.5 bg-danger/10 text-danger rounded-2xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 uppercase leading-none">
                Dados da Despesa
              </h3>
              <p className="text-[9px] font-extrabold text-[#94A3B8] uppercase tracking-widest mt-1">
                Informe os detalhes do gasto
              </p>
            </div>
          </div>

          {/* Nome da Despesa Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
              Nome da Despesa *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Aluguel da Loja, Conta de Luz, Internet..."
              className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Valor Field */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
                Valor da Despesa (R$) *
              </label>
              <div className="relative">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[#94A3B8] font-black">
                  R$
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl pl-14 pr-6 font-black text-slate-800 transition-all outline-none"
                />
              </div>
            </div>

            {/* Data Field - nice to have pre-filled */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
                Data do Gasto
              </label>
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-16 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-6 font-black text-slate-800 transition-all outline-none"
              />
            </div>
          </div>

          {/* Descrição / Observação Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
              Descrição da Despesa / Detalhes
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descreva mais detalhes sobre esse gasto caso necessário..."
              rows={4}
              className="w-full bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl p-6 font-semibold text-slate-700 transition-all outline-none resize-none"
            />
          </div>

          {/* Toggle for and advanced options info */}
          <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-[10px] font-black uppercase tracking-wider text-accent pl-1 hover:underline cursor-pointer"
            >
              {showAdvanced ? "Ocultar Mais Opções" : "Mostrar Mais Opções (Categoria, Meio de Pagto...)"}
            </button>
          </div>

          {/* Advanced options section */}
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, h: 0 }}
              animate={{ opacity: 1, h: "auto" }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2"
            >
              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
                  Meio de Pagamento
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-5 font-black text-slate-800 transition-all outline-none appearance-none"
                >
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartão">Cartão</option>
                  <option value="transferência">Transf.</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
                  Status Pagamento
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-5 font-black text-slate-800 transition-all outline-none appearance-none"
                >
                  <option value="paid">Já Pago ✅</option>
                  <option value="pending">A Pagar (Futuro) ⏳</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-[#94A3B8] uppercase ml-2 tracking-widest block">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full h-14 bg-slate-50 border-2 border-transparent focus:border-accent/20 rounded-2xl px-5 font-black text-slate-800 transition-all outline-none appearance-none"
                >
                  <option value="operacional">Operacional</option>
                  <option value="pessoal">Pessoal</option>
                  <option value="manutenção">Manutenção</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
            </motion.div>
          )}

          {/* Action button matching style */}
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "w-full h-18 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 uppercase tracking-widest text-sm cursor-pointer",
              id ? "bg-accent shadow-accent/20 hover:bg-accent/90" : "bg-danger shadow-danger/20 hover:bg-danger/90"
            )}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-6 h-6" />
            )}
            {id ? "Salvar Alterações" : "Confirmar Lançamento"}
          </button>
        </div>
      </form>
    </div>
  );
}
