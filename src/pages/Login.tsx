import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/src/contexts/AuthContext';
import { Package, Lock, Mail, User, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isReset) {
        // Mocking the specific reset request to the admin email
        console.log(`Solicitação de reset para ${username} enviada para iagogd99@gmail.com`);
        setMessage('Solicitação de recuperação enviada! O administrador recebeu um código em iagogd99@gmail.com');
        setIsReset(false);
        setIsLogin(true);
      } else if (isLogin) {
        await login(username, password);
        navigate('/');
      } else {
        await register(username, password, name);
        navigate('/');
      }
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      setError(err.message || 'Erro de autenticação. Verifique seu usuário e senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-accent/20">
            <Package className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">
            ESTOQUE<span className="text-accent">PRO</span>
          </h1>
          <p className="text-slate-500 mt-2">Gestão inteligente para o seu negócio</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 border border-gray-100">
          <h2 className="text-xl font-bold text-slate-800 mb-6">
            {isReset ? 'Recuperar Acesso' : (isLogin ? 'Painel de Acesso' : 'Criar novo usuário')}
          </h2>

          <form onSubmit={handleAuth} className="space-y-4">
            <AnimatePresence mode="popLayout">
              {!isLogin && !isReset && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1"
                >
                  <label className="text-sm font-medium text-slate-700">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                      placeholder="Seu nome"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Usuário</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  placeholder="Ex: joao.silva"
                />
              </div>
            </div>

            {!isReset && (
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-danger text-sm bg-danger/5 p-3 rounded-lg border border-danger/20">
                {error}
              </p>
            )}

            {message && (
              <p className="text-success text-sm bg-success/5 p-3 rounded-lg border border-success/20">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/20 disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isReset ? 'Solicitar Código' : (isLogin ? 'Entrar no Sistema' : 'Cadastrar'))}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-3">
            <button 
              onClick={() => {
                setIsReset(!isReset);
                setError('');
                setMessage('');
              }}
              className="text-sm text-accent hover:underline font-medium"
            >
              {isReset ? 'Voltar para o login' : 'Esqueceu a senha?'}
            </button>
            
            <p className="text-sm text-slate-500">
              {isLogin ? 'Registrar novo acesso?' : 'Já possui um usuário?'}
              <button 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setIsReset(false);
                  setError('');
                  setMessage('');
                }}
                className="ml-1 text-accent font-bold hover:underline"
              >
                {isLogin ? 'Criar Usuário' : 'Fazer Login'}
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
