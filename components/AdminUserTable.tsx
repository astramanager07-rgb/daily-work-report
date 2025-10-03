'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  department: string | null;
  designation: string | null;
  role: 'admin' | 'staff' | null;
  employee_id: string | null;
  is_active: boolean | null;
};

const DEPARTMENTS = [
  'HR','Accounts','Engineering','Production','Sales','Marketing','Export','Purchase'
];

function Avatar({ name }: { name?: string | null }) {
  const initials = (name || '')
    .split(' ')
    .map(s => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
  return (
    <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-xs font-semibold">
      {initials}
    </div>
  );
}

function Badge({ children, tone='gray' }: { children: any; tone?: 'gray'|'green'|'red'|'blue' }) {
  const tones: Record<string,string> = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

/* ========== Helper: Safe JSON parser ========== */
async function safeJson(res: Response) {
  try {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function AdminUserTable() {
  const sb = getSupabase();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [dept, setDept] = useState<'All' | (typeof DEPARTMENTS)[number]>('All');

  // modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    employee_id: '',
    department: '',
    designation: '',
    role: 'staff',
    is_active: true,
  });

  function resetForm() {
    setForm({
      email: '',
      password: '',
      name: '',
      employee_id: '',
      department: '',
      designation: '',
      role: 'staff',
      is_active: true,
    });
  }

  /* ========== Load Users ========== */
  async function load() {
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' });
      const j = await safeJson(res);
      if (!res.ok) {
        setMsg((j && j.error) || `Failed to load users (HTTP ${res.status})`);
        setRows([]);
      } else {
        setRows((j?.users || []) as Profile[]);
      }
    } catch (e: any) {
      setMsg(e?.message || 'Failed to load users');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (dept === 'All') return rows;
    return rows.filter(r => (r.department || '') === dept);
  }, [rows, dept]);

  function openCreate() {
    setEditing(null);
    resetForm();
    setOpen(true);
  }

  function openEdit(p: Profile) {
    setEditing(p);
    setForm({
      email: p.email || '',
      password: '',
      name: p.name || '',
      employee_id: p.employee_id || '',
      department: p.department || '',
      designation: p.designation || '',
      role: (p.role || 'staff') as 'staff' | 'admin',
      is_active: Boolean(p.is_active),
    });
    setOpen(true);
  }

  /* ========== Save User (Create / Update) ========== */
  async function save() {
    setMsg('');
    if (editing) {
      // UPDATE
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          employee_id: form.employee_id,
          department: form.department || null,
          designation: form.designation || null,
          role: form.role,
          is_active: form.is_active,
          newPassword: form.password ? form.password : undefined,
        }),
      });
      const j = await safeJson(res);
      if (!res.ok) return setMsg((j && j.error) || 'Update failed');
    } else {
      // CREATE
      if (!form.email || !form.password) {
        return setMsg('Email and password are required');
      }
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name || null,
          employee_id: form.employee_id || null,
          department: form.department || null,
          designation: form.designation || null,
          role: form.role || 'staff',
        }),
      });
      const j = await safeJson(res);
      if (!res.ok) return setMsg((j && j.error) || 'Create failed');
    }
    setOpen(false);
    await load();
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <label className="label">Department</label>
          <select
            className="select"
            value={dept}
            onChange={(e) => setDept(e.target.value as any)}
          >
            <option>All</option>
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn" onClick={openCreate}>Add User</button>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {/* Table */}
      <div className="relative max-h-[70vh] overflow-auto border rounded-lg shadow-sm">
        <table className="min-w-[1000px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 sticky top-0 z-10">
              {['#','User','Designation','Department','Role','Active','Actions'].map(h => (
                <th key={h} className="px-4 py-2 text-left border-b whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-gray-500">No users</td>
              </tr>
            )}

            {filtered.map((u, i) => (
              <tr key={u.id} className="odd:bg-white even:bg-gray-50 hover:bg-indigo-50/40 transition-colors">
                <td className="px-4 py-2">{i + 1}</td>

                <td className="px-4 py-2">
                  <div className="flex items-start gap-3">
                    <Avatar name={u.name} />
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {u.name || '—'}
                      </div>
                      <div className="text-gray-600 truncate">
                        {u.email}
                      </div>
                      <div className="text-xs text-gray-500">
                        Emp ID: {u.employee_id || '—'}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-2">{u.designation || '—'}</td>
                <td className="px-4 py-2">{u.department || '—'}</td>

                <td className="px-4 py-2">
                  <Badge tone={u.role === 'admin' ? 'blue' : 'gray'}>{u.role}</Badge>
                </td>

                <td className="px-4 py-2">
                  <Badge tone={u.is_active ? 'green' : 'red'}>
                    {u.is_active ? 'Yes' : 'No'}
                  </Badge>
                </td>

                <td className="px-4 py-2">
                  <button
                    className="border px-3 py-1.5 rounded hover:bg-gray-50"
                    onClick={() => openEdit(u)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editing ? 'Edit User' : 'Add User'}</h3>
              <button className="text-gray-500 hover:text-gray-700" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="label">Email</label>
                <input className="input w-full" value={form.email}
                       onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>

              <div>
                <label className="label">{editing ? 'New Password (optional)' : 'Password'}</label>
                <input type="password" className="input w-full" value={form.password}
                       onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>

              <div>
                <label className="label">Name</label>
                <input className="input w-full" value={form.name}
                       onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              <div>
                <label className="label">Employee ID</label>
                <input className="input w-full" value={form.employee_id}
                       onChange={e => setForm({ ...form, employee_id: e.target.value })} />
              </div>

              <div>
                <label className="label">Designation</label>
                <input className="input w-full" value={form.designation}
                       onChange={e => setForm({ ...form, designation: e.target.value })} />
              </div>

              <div>
                <label className="label">Department</label>
                <select className="select w-full" value={form.department}
                        onChange={e => setForm({ ...form, department: e.target.value })}>
                  <option value="">Select…</option>
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>

              <div>
                <label className="label">Role</label>
                <select className="select w-full" value={form.role}
                        onChange={e => setForm({ ...form, role: e.target.value as any })}>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input id="active" type="checkbox" className="h-4 w-4"
                       checked={form.is_active}
                       onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label htmlFor="active" className="label">Active</label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className="btn" onClick={save}>{editing ? 'Save' : 'Create'}</button>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            </div>

            {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}