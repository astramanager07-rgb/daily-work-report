'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';
import TagInput from './TagInput'; // 🔹 make sure the path matches where you saved it

type Profile = {
  id: string;
  auth_user_id: string;
  employee_id: string | null;
  name: string | null;
  designation: string | null;
  department: string | null;
};

type WorkRow = {
  id: string;
  work_date: string;             // YYYY-MM-DD
  task_description: string;
  start_time: string;            // HH:mm
  end_time: string;              // HH:mm
  status: 'Complete' | 'Pending' | 'In-Progress';
  work_for_party: string[];      // 🔹 TAGS: store as array in UI
  related_department: string;
  related_department_choice: string;
  related_department_other: string;
  assigned_by: string;
  remarks: string;
};

const DEPARTMENTS = [
  'HR','Accounts','Engineering','Production','Sales','Marketing','Export','Purchase','Other…'
] as const;

function newRow(seed?: Partial<WorkRow>): WorkRow {
  const today = new Date().toISOString().slice(0,10);
  return {
    id: crypto.randomUUID(),
    work_date: seed?.work_date ?? today,
    task_description: '',
    start_time: '',
    end_time: '',
    status: (seed?.status as WorkRow['status']) ?? 'Complete',
    work_for_party: Array.isArray(seed?.work_for_party) ? seed!.work_for_party! : [], // 🔹
    related_department: seed?.related_department ?? '',
    related_department_choice: seed?.related_department_choice ?? '',
    related_department_other: seed?.related_department_other ?? '',
    assigned_by: seed?.assigned_by ?? '',
    remarks: '',
  };
}

export default function ReportForm() {
  const sb = getSupabase();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<WorkRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{kind:'ok'|'err', text:string} | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data, error } = await sb
        .from('profiles')
        .select('id,auth_user_id,employee_id,name,designation,department')
        .eq('auth_user_id', user.id)
        .single();
      if (!error && data) {
        const p = data as Profile;
        setProfile(p);
        setRows(prev => prev.map(r => ({
          ...r,
          related_department_choice: p.department || '',
          related_department: p.department || ''
        })));
      }
    })();
  }, [sb]);

  const setRow = (rowId: string, patch: Partial<WorkRow>) =>
    setRows(prev => prev.map(r => r.id === rowId ? {...r, ...patch} : r));

  const removeRow = (rowId: string) =>
    setRows(prev => prev.length <= 1 ? prev : prev.filter(r => r.id !== rowId));

  const duplicateRow = (rowId: string) =>
    setRows(prev => {
      const i = prev.findIndex(r => r.id === rowId);
      if (i < 0) return prev;
      const src = prev[i];
      const dup = newRow({
        ...src,
        remarks: '',
      });
      return [...prev.slice(0, i+1), dup, ...prev.slice(i+1)];
    });

  const addRow = () =>
    setRows(prev => {
      const last = prev[prev.length - 1];
      const nxt = newRow({
        work_date: last.work_date,
        status: last.status,
        work_for_party: last.work_for_party, // 🔹 carry tags forward if you want
        related_department_choice: last.related_department_choice,
        related_department_other: last.related_department_other,
        related_department: last.related_department,
        assigned_by: last.assigned_by,
      });
      nxt.start_time = last.end_time || '';
      nxt.end_time = '';
      return [...prev, nxt];
    });

  const rowDuration = (r: WorkRow) => {
    if (!r.start_time || !r.end_time) return 0;
    const s = new Date(`${r.work_date}T${r.start_time}`);
    const e = new Date(`${r.work_date}T${r.end_time}`);
    const ms = e.getTime() - s.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.round((ms / 3_600_000) * 100) / 100;
  };

  const allValid = useMemo(() => {
    if (!profile) return false;
    return rows.every(r => {
      const hasBasics =
        !!r.work_date &&
        !!r.task_description.trim() &&
        !!r.start_time &&
        !!r.end_time &&
        rowDuration(r) > 0 &&
        !!r.status;
      const deptChosen = !!r.related_department_choice;
      const otherOk = r.related_department_choice !== 'Other…' || !!r.related_department_other.trim();
      return hasBasics && deptChosen && otherOk;
    });
  }, [rows, profile]);

  const onDeptChange = (row: WorkRow, choice: string) => {
    const isOther = choice === 'Other…';
    setRow(row.id, {
      related_department_choice: choice,
      related_department: isOther ? (row.related_department_other || '') : choice
    });
  };

  const onDeptOtherChange = (row: WorkRow, text: string) => {
    setRow(row.id, {
      related_department_other: text,
      related_department: text
    });
  };

  async function submitAll(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!profile) return;
    if (!allValid) {
      setMsg({ kind: 'err', text: 'Please complete all required fields. End time must be after start time.' });
      return;
    }

    setSaving(true);
    try {
      const batchId = (crypto?.randomUUID?.() || undefined) as string | undefined;
      const payload = rows.map(r => {
        const start = new Date(`${r.work_date}T${r.start_time}`);
        const end = new Date(`${r.work_date}T${r.end_time}`);
        // 🔹 join tags into CSV for the current DB column
        const csvTags = r.work_for_party.map(t => t.trim()).filter(Boolean).join(', ');
        return {
          batch_id: batchId ?? null,
          user_id: profile.id,
          work_date: r.work_date,
          task_description: r.task_description.trim(),
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: r.status,
          work_for_party: csvTags || null,      // 🔹 saved as CSV
          related_department: r.related_department || null,
          assigned_by: r.assigned_by.trim() || null,
          remarks: r.remarks.trim() || null,
        };
      });

      const { error } = await sb.from('reports').insert(payload);
      if (error) {
        setMsg({ kind: 'err', text: error.message });
      } else {
        setMsg({ kind: 'ok', text: `Saved ${rows.length} work item(s).` });
        const last = rows[rows.length-1];
        setRows([newRow({
          work_date: last.work_date,
          status: last.status,
          work_for_party: last.work_for_party, // keep last used tags if you like
          related_department_choice: last.related_department_choice,
          related_department_other: last.related_department_other,
          related_department: last.related_department,
          assigned_by: last.assigned_by
        })]);
      }
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submitAll} className="card p-4 space-y-4 max-w-5xl mx-auto">
      {/* Staff info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="label">Employee ID</label>
          <input disabled value={profile?.employee_id || ''} className="input bg-gray-100" />
        </div>
        <div>
          <label className="label">Employee Name</label>
          <input disabled value={profile?.name || ''} className="input bg-gray-100" />
        </div>
        <div>
          <label className="label">Designation</label>
          <input disabled value={profile?.designation || ''} className="input bg-gray-100" />
        </div>
        <div>
          <label className="label">Department</label>
          <input disabled value={profile?.department || ''} className="input bg-gray-100" />
        </div>
      </div>

      {/* Work rows */}
      <div className="space-y-4">
        {rows.map((r, idx) => {
          const dur = rowDuration(r);
          const isOther = r.related_department_choice === 'Other…';
          return (
            <div key={r.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">Work #{idx+1}</div>
                <div className="flex gap-2">
                  <button type="button" className="btn" onClick={() => duplicateRow(r.id)}>Duplicate</button>
                  <button type="button" className="btn" onClick={() => removeRow(r.id)} disabled={rows.length===1}>Delete</button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Date <span className="text-red-500">*</span></label>
                  <input type="date" className="input" value={r.work_date} onChange={e=>setRow(r.id,{work_date:e.target.value})} required />
                </div>
                <div>
                  <label className="label">Task / Work Description <span className="text-red-500">*</span></label>
                  <input className="input" value={r.task_description} onChange={e=>setRow(r.id,{task_description:e.target.value})} placeholder="Describe the work" required />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Start Time <span className="text-red-500">*</span></label>
                    <input type="time" className="input" value={r.start_time} onChange={e=>setRow(r.id,{start_time:e.target.value})} required />
                  </div>
                  <div>
                    <label className="label">End Time <span className="text-red-500">*</span></label>
                    <input type="time" className="input" value={r.end_time} onChange={e=>setRow(r.id,{end_time:e.target.value})} required />
                  </div>
                </div>

                <div>
                  <label className="label">Status <span className="text-red-500">*</span></label>
                  <select className="select" value={r.status} onChange={e=>setRow(r.id,{status: e.target.value as WorkRow['status']})}>
                    <option>Complete</option>
                    <option>Pending</option>
                    <option>In-Progress</option>
                  </select>
                </div>

                {/* 🔹 TAG INPUT */}
                <div className="md:col-span-2">
                  <label className="label">Work for Party (tags)</label>
                  <TagInput
                    value={r.work_for_party}
                    onChange={(tags) => setRow(r.id, { work_for_party: tags })}
                    placeholder="Type and press comma — Client/Vendor/Internal"
                  />
                </div>

                <div>
                  <label className="label">Work Related Dept. <span className="text-red-500">*</span></label>
                  <select
                    className="select"
                    value={r.related_department_choice}
                    onChange={e=>onDeptChange(r, e.target.value)}
                  >
                    <option value="">Select Department</option>
                    {DEPARTMENTS.map(dep => <option key={dep} value={dep}>{dep}</option>)}
                  </select>
                  {isOther && (
                    <input
                      className="input mt-2"
                      placeholder="Type department"
                      value={r.related_department_other}
                      onChange={e=>onDeptOtherChange(r, e.target.value)}
                    />
                  )}
                </div>

                <div>
                  <label className="label">Assigned By</label>
                  <input className="input" value={r.assigned_by} onChange={e=>setRow(r.id,{assigned_by:e.target.value})} placeholder="Person who assigned" />
                </div>
                <div>
                  <label className="label">Remarks</label>
                  <input className="input" value={r.remarks} onChange={e=>setRow(r.id,{remarks:e.target.value})} placeholder="Any notes" />
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-600">
                Duration (hrs): <b className={dur<=0 && r.start_time && r.end_time ? 'text-red-600' : ''}>{dur}</b>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" className="btn" onClick={addRow}>+ Add Work</button>
        <button type="submit" className={`btn ${allValid ? 'btn-primary' : ''}`} disabled={!allValid || saving}>
          {saving ? 'Saving…' : `Submit All (${rows.length})`}
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.kind==='ok' ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
    </form>
  );
}