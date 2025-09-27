'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import RequireAdmin from '@/components/RequireAdmin';
import PasswordInput from '@/components/PasswordInput';

type ProfileRow = {
  profile_id: string;            // from the view
  auth_user_id: string | null;   // Auth UID (from auth.users)
  name: string | null;
  email: string | null;
  department: string | null;
  role: 'admin' | 'staff' | null;
};

export default function ResetPasswordPage() {
  return (
    <RequireAdmin>
      <InnerResetPassword />
    </RequireAdmin>
  );
}

function InnerResetPassword() {
  const sb = getSupabase();

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [userId, setUserId] = useState('');     // selected AUTH UID
  const [newPass, setNewPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type:'error'|'success'; text:string }|null>(null);

  useEffect(() => {
    (async () => {
      setMsg(null);

      // ✅ Read from the non-recursive view
      const { data, error } = await sb
        .from('profiles_with_email')
        .select('profile_id, auth_user_id, name, email, department, role')
        .order('name', { ascending: true, nullsFirst: true });

      if (error) {
        setMsg({ type:'error', text: 'Failed to load users: ' + error.message });
        setProfiles([]);
      } else {
        setProfiles((data ?? []) as ProfileRow[]);
      }
    })();
  }, [sb]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!userId) {
      setMsg({ type:'error', text: 'Please select a user.' });
      return;
    }
    if (!newPass || newPass.length < 6) {
      setMsg({ type:'error', text: 'New password must be at least 6 characters.' });
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/admin/set-password', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ userId, newPassword: newPass }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type:'error', text: j?.error || 'Failed to set password' });
      } else {
        setMsg({ type:'success', text: 'Password updated successfully.' });
        setNewPass('');
      }
    } catch (err: any) {
      setMsg({ type:'error', text: err?.message || 'Unexpected error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[70vh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm border p-6 rounded-2xl space-y-4 bg-white shadow">
        <h1 className="text-xl font-semibold">Reset User Password</h1>

        {/* User select */}
        <div className="space-y-1">
          <label className="text-sm">Select User</label>
          <select
            className="w-full border p-2 rounded"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Select User</option>
            {profiles.map((p) => (
              <option
                key={p.profile_id}
                value={p.auth_user_id ?? ''}
                disabled={!p.auth_user_id}
                title={!p.auth_user_id ? 'No auth_user_id linked to this profile' : undefined}
              >
                {(p.name || p.email || '(no name)')}
                {p.role === 'admin' ? ' (admin)' : ''}
                {' — '}
                {p.department || 'N/A'}
                {!p.auth_user_id ? ' (no auth link)' : ''}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            This sends the user’s <code>auth_user_id</code> to a secure server API that uses the Service Role.
          </p>
        </div>

        {/* New password input with eye toggle */}
        <PasswordInput
          label="New Password"
          value={newPass}
          onChange={setNewPass}
          required
          minLength={6}
          name="admin-new-password"
        />

        {msg && (
          <p className={`text-sm ${msg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white p-2 rounded"
          disabled={loading}
        >
          {loading ? 'Updating…' : 'Set Password'}
        </button>
      </form>
    </main>
  );
}