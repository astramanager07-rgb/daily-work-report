'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const sb = getSupabase();

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');

    // Try login
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }

    // Fetch role from profiles
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('role')
      .eq('auth_user_id', data.user.id)
      .single();

    if (profileError) {
      setError('Profile not found for this user.');
      return;
    }

    // Redirect based on role
    if (profile?.role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/report');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border p-6 rounded-2xl space-y-3 bg-white shadow">
        <h1 className="text-xl font-semibold">Sign in</h1>

        <input
          type="email"
          className="w-full border p-2 rounded"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          className="w-full border p-2 rounded"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded">
          Login
        </button>
      </form>
    </main>
  );
}