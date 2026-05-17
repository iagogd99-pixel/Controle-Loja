import React, { createContext, useContext, useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { UserProfile } from '@/src/types';

interface AuthContextType {
  user: { uid: string; email?: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('estoquepro_user');
    if (savedUser) {
      try {
        setProfile(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('estoquepro_user');
      }
    }

    // Ensure super admin exists
    const ensureAdmin = async () => {
      try {
        const adminRef = doc(db, 'users', 'admin');
        const adminDoc = await getDoc(adminRef);
        if (!adminDoc.exists()) {
          await setDoc(adminRef, {
            uid: 'admin',
            username: 'admin',
            name: 'Administrador',
            email: 'admin@estoquepro.local',
            role: 'admin',
            status: 'active',
            password: 'admin', // Default password
            mustChangePassword: true,
            createdAt: new Date().toISOString(),
          });
          console.log('Usuário admin criado com sucesso.');
        }
      } catch (error) {
        console.error('Erro ao garantir admin:', error);
      }
    };
    ensureAdmin();

    // Test connection
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'users', 'test-connection'));
        console.log('Firestore connection sequence completed.');
      } catch (error: any) {
        if (error.message.includes('permission')) {
          console.error("Permission error during connection test. Check rules.");
        } else {
          console.error("Firestore connection error:", error);
        }
      }
    };
    testConnection();

    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const q = query(
        collection(db, 'users'), 
        where('username', '==', username.toLowerCase().trim()),
        where('password', '==', password)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        throw new Error('Usuário ou senha incorretos');
      }

      const userData = querySnapshot.docs[0].data() as UserProfile & { password?: string };
      // Remove password from memory/localStorage for slight security
      delete userData.password;
      
      setProfile(userData);
      localStorage.setItem('estoquepro_user', JSON.stringify(userData));
    } catch (error: any) {
      if (error.message.includes('permission')) {
        handleFirestoreError(error, OperationType.GET, 'users');
      }
      throw error;
    }
  };

  const register = async (username: string, password: string, name: string) => {
    const cleanUsername = username.toLowerCase().trim();
    
    try {
      // Check if user already exists
      const userRef = doc(db, 'users', cleanUsername);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        throw new Error('Este nome de usuário já está sendo usado.');
      }

      const newProfile = {
        uid: cleanUsername,
        username: cleanUsername,
        name,
        email: `${cleanUsername}@estoquepro.local`,
        role: 'admin', // First users are admins
        status: 'active',
        password, // Storing in firestore since standard auth is blocked
        createdAt: new Date().toISOString(),
      };

      await setDoc(userRef, newProfile);
      
      const { password: _, ...profileToStore } = newProfile;
      setProfile(profileToStore as any);
      localStorage.setItem('estoquepro_user', JSON.stringify(profileToStore));
    } catch (error: any) {
      if (error.message.includes('permission')) {
        handleFirestoreError(error, OperationType.WRITE, `users/${cleanUsername}`);
      }
      throw error;
    }
  };

  const logout = () => {
    setProfile(null);
    localStorage.removeItem('estoquepro_user');
  };

  const value = {
    user: profile ? { uid: profile.uid, email: profile.email } : null,
    profile,
    loading,
    isAdmin: profile?.username === 'admin',
    mustChangePassword: !!profile?.mustChangePassword,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
