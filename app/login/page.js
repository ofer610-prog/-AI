'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const supabase = createClient();

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) setError(error.message);
      else setError('נשלח אליך מייל אישור. בדוק את התיבה.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else router.push('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white border border-sky-100 rounded-xl p-8 w-full max-w-md">
        <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif" }} className="text-3xl font-bold text-slate-900 mb-1">
          ספרי משרד
        </h1>
        <p className="text-sm text-slate-500 mb-6">מערכת ניהול משרד עו״ד</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-sky-200 rounded-md focus:outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 border border-sky-200 rounded-md focus:outline-none focus:border-sky-500"
            />
          </div>

          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-slate-800 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'טוען...' : mode === 'signup' ? 'הרשמה' : 'כניסה'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
          className="w-full mt-4 text-sm text-slate-600 hover:text-slate-900"
        >
          {mode === 'login' ? 'אין לך חשבון? הרשם' : 'יש לך חשבון? היכנס'}
        </button>
      </div>
    </div>
  );
}
