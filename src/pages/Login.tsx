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
import { Package, Lock, Mail, User, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [isReset, setIsReset] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isReset) {
        await sendPasswordResetEmail(auth, email);
        setMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setIsReset(false);
        setIsLogin(true);
      } else if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        navigate('/');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(userCredential.user, { displayName: name });
        }
        navigate('/');
      }
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      if (err.message.includes('auth/user-not-found')) setError('Usuário não encontrado');
      else if (err.message.includes('auth/wrong-password')) setError('Senha incorreta');
      else if (err.message.includes('auth/email-already-in-use')) setError('Este e-mail já está em uso');
      else if (err.message.includes('auth/weak-password')) setError('A senha deve ter pelo menos 6 caracteres');
      else if (err.message.includes('auth/invalid-email')) setError('E-mail inválido');
      else if (err.message.includes('auth/operation-not-allowed')) setError('O cadastro por e-mail/senha está desabilitado. Use o Google Login.');
      else setError('Ocorreu um erro inesperado. Tente o Google Login.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (err: any) {
      console.error('Erro Google login:', err);
      setError('Erro ao entrar com Google. Tente novamente.');
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
            {isReset ? 'Recuperar Senha' : (isLogin ? 'Bem-vindo de volta' : 'Criar nova conta')}
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
              <label className="text-sm font-medium text-slate-700">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all"
                  placeholder="exemplo@email.com"
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
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isReset ? 'Enviar Link' : (isLogin ? 'Entrar' : 'Cadastrar'))}
              {!loading && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          {!isReset && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-slate-500">Ou continue com</span>
                </div>
              </div>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white hover:bg-gray-50 text-slate-700 font-bold py-3 px-6 rounded-xl border border-gray-200 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-70"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.74 7.04 9.14 5 12 5z" />
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.76 2.91c2.2-2.02 3.46-5 3.46-8.73z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.76-2.91c-1.03.69-2.35 1.11-3.52 1.11-2.86 0-5.26-2.04-6.16-4.91l-3.66 2.84C3.99 20.53 7.7 23 12 23z" />
                </svg>
                Entrar com Google
              </button>
            </>
          )}

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
              {isLogin ? 'Ainda não tem conta?' : 'Já possui uma conta?'}
              <button 
                onClick={() => {
                  setIsLogin(!isLogin);
                  setIsReset(false);
                  setError('');
                  setMessage('');
                }}
                className="ml-1 text-accent font-bold hover:underline"
              >
                {isLogin ? 'Criar agora' : 'Entrar agora'}
              </button>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
