'use client';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import RequireAuth from '@/components/RequireAuth';
import PasswordInput from '@/components/PasswordInput';

export default function ChangePasswordPage() {
  return (
    <RequireAuth>
      <InnerChangePassword />
    </RequireAuth>
  );
}

function InnerChangePassword() {
  const sb = getSupabase();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error'|'success'; text: string }|null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    try {
      setLoading(true);
      const { data: { user } } = await sb.auth.getUser();
      if (!user?.email) {
        setMsg({ type: 'error', text: 'Not signed in.' });
        return;
      }

      const { error: signErr } = await sb.auth.signInWithPassword({
        email: user.email,
        password: current,
      });
      if (signErr) {
        setMsg({ type: 'error', text: 'Current password is incorrect.' });
        return;
      }

      if (newPass.length < 6) {
        setMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
        return;
      }

      const { error: updErr } = await sb.auth.updateUser({ password: newPass });
      if (updErr) {
        setMsg({ type: 'error', text: updErr.message });
        return;
      }

      setMsg({ type: 'success', text: 'Password updated successfully.' });
      setCurrent('');
      setNewPass('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border p-6 rounded-2xl space-y-4 bg-white shadow">
        <h1 className="text-xl font-semibold">Change Password</h1>

        <PasswordInput
          label="Current Password"
          value={current}
          onChange={setCurrent}
          required
          name="current-password"
        />

        <PasswordInput
          label="New Password"
          value={newPass}
          onChange={setNewPass}
          required
          minLength={6}
          name="new-password"
        />

        {msg && (
          <p className={`text-sm ${msg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msg.text}
          </p>
        )}

        <button
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white p-2 rounded"
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </main>
  );
}