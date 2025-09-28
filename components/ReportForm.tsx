'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// Date picker (for report date) — UI shows dd-MM-yyyy but we store yyyy-MM-dd
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as fmt, parseISO } from 'date-fns';

/* ===================== Types ===================== */

type Profile = {
  id: string;
  auth_user_id: string;
  employee_id: string | null;
  name: string | null;
  designation: string | null;
  department: string | null;
};

type Status = 'Complete' | 'Pending' | 'In-Progress' | ''; // '' = Select

type WorkRow = {
  id: string;
  task_description: string;
  start_time: string;              // HH:MM (24h, internal)
  end_time: string;                // HH:MM (24h, internal)
  status: Status;                  // default '' (Select)
  party_tags: string[];            // displayed as tag chips, saved joined
  related_department: string;
  assigned_by: string;
  remarks: string;
};

type RowErrors = Partial<{
  task_description: string;
  start_time: string;
  end_time: string;
  status: string;
  related_department: string;
  duration: string; // end after start check
}>;

const DEPARTMENTS = [
  'HR','Accounts','Engineering','Production','Sales','Marketing','Export','Purchase','Other…'
] as const;

/* ================== Helpers ================== */

function newRow(seed?: Partial<WorkRow>): WorkRow {
  return {
    id: crypto.randomUUID(),
    task_description: '',
    start_time: '',
    end_time: '',
    status: (seed?.status as Status) ?? '',
    party_tags: seed?.party_tags ?? [],
    related_department: seed?.related_department ?? '',
    assigned_by: seed?.assigned_by ?? '',
    remarks: '',
  };
}

function pad2(n: number) { return String(n).padStart(2, '0'); }
function rowDurationMinutes(dateISO: string, startHHMM24: string, endHHMM24: string) {
  if (!dateISO || !startHHMM24 || !endHHMM24) return 0;
  const s = new Date(`${dateISO}T${startHHMM24}`);
  const e = new Date(`${dateISO}T${endHHMM24}`);
  const ms = e.getTime() - s.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60000);
}
function fmtHHmm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/* ===== 12h <-> 24h conversion helpers for dropdowns ===== */

type Parts12 = { hour12: number; minute: number; ampm: 'AM' | 'PM' };

function hhmm24to12Parts(hhmm: string): Parts12 {
  let h = 0, m = 0;
  if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
    const [hs, ms] = hhmm.split(':');
    h = Math.max(0, Math.min(23, Number(hs)));
    m = Math.max(0, Math.min(59, Number(ms)));
  }
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, ampm };
}

function parts12toHHMM24({ hour12, minute, ampm }: Parts12): string {
  let h24 = hour12 % 12;
  if (ampm === 'PM') h24 += 12;
  if (ampm === 'AM' && h24 === 12) h24 = 0;
  return `${pad2(h24)}:${pad2(minute)}`;
}
function hhmm24ToLabel12(hhmm: string): string {
  const { hour12, minute, ampm } = hhmm24to12Parts(hhmm || '00:00');
  return `${hour12}:${pad2(minute)} ${ampm}`;
}

/* =============== TagInput (with onBlur commit) =============== */

function TagInput({
  value,
  onChange,
  placeholder,
  id,
  label,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  id?: string;
  label?: string;
}) {
  const [input, setInput] = useState('');

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  }

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-[12px] font-semibold text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="input h-auto py-1 flex flex-wrap gap-1">
        {value.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200"
          >
            {t}
            <button
              type="button"
              className="rounded-full px-1 hover:bg-indigo-100"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}

        <input
          id={id}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-[13px] py-1"
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(',')) {
              addTag(v.slice(0, -1));
              setInput('');
            } else {
              setInput(v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag(input);
              setInput('');
            } else if (e.key === 'Backspace' && input === '' && value.length) {
              e.preventDefault();
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (input.trim()) {
              addTag(input);
              setInput('');
            }
          }}
          placeholder={placeholder ?? 'Type and press , or Enter'}
        />
      </div>
    </div>
  );
}

/* =============== TimeSelect12h (compact) =============== */

function TimeSelect12h({
  label,
  value,
  onChange,
  className,
  showCopyPrev = false,
  prevEnd = null
}: {
  label: string;
  value: string;                 // HH:MM (24h)
  onChange: (v: string) => void; // returns HH:MM (24h)
  className?: string;
  showCopyPrev?: boolean;
  prevEnd?: string | null;
}) {
  const parts = hhmm24to12Parts(value || '');
  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);   // 0..59
  const ampmOptions: Array<'AM' | 'PM'> = ['AM', 'PM'];

  function update(partial: Partial<Parts12>) {
    const next: Parts12 = {
      hour12: partial.hour12 ?? (parts.hour12 || 12),
      minute: partial.minute ?? (Number.isFinite(parts.minute) ? parts.minute : 0),
      ampm: partial.ampm ?? (parts.ampm || 'AM'),
    };
    onChange(parts12toHHMM24(next));
  }

  return (
    <div className={className}>
      <label className="block text-[12px] font-semibold text-gray-700 mb-1">
        {label} <span className="text-red-500">*</span>
      </label>

      <div className="flex items-center gap-1">
        {/* Hour */}
        <select
          className="select h-8 w-[70px] text-[13px]"
          value={String(parts.hour12 || '')}
          onChange={(e) => update({ hour12: Number(e.target.value) })}
        >
          <option value="" />
          {hourOptions.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        {/* Minute */}
        <select
          className="select h-8 w-[70px] text-[13px]"
          value={String(Number.isFinite(parts.minute) ? parts.minute : '')}
          onChange={(e) => update({ minute: Number(e.target.value) })}
        >
          <option value="" />
          {minuteOptions.map((m) => (
            <option key={m} value={m}>{pad2(m)}</option>
          ))}
        </select>

        {/* AM/PM */}
        <select
          className="select h-8 w-[80px] text-[13px]"
          value={parts.ampm || ''}
          onChange={(e) => update({ ampm: e.target.value as 'AM' | 'PM' })}
        >
          <option value="" />
          {ampmOptions.map((ap) => (
            <option key={ap} value={ap}>{ap}</option>
          ))}
        </select>

        {showCopyPrev && prevEnd && (
          <button
            type="button"
            className="btn h-8 px-2 text-[12px]"
            onClick={() => onChange(prevEnd)}
            title={`Copy previous end (${hhmm24ToLabel12(prevEnd)})`}
          >
            Copy prev
          </button>
        )}
      </div>
    </div>
  );
}

/* ==================== Component =================== */

export default function ReportForm() {
  const sb = getSupabase();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<WorkRow[]>([newRow()]);
  const [rowErrors, setRowErrors] = useState<Record<string, RowErrors>>({});
  // Keep canonical date in ISO (yyyy-MM-dd) for DB; UI shows dd-MM-yyyy
  const [reportDate, setReportDate] = useState<string>(fmt(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb
        .from('profiles')
        .select('id,auth_user_id,employee_id,name,designation,department')
        .eq('auth_user_id', user.id)
        .single();
      if (data) setProfile(data as Profile);
    })();
  }, [sb]);

  // ---- RLS-friendly: disallow future dates in the picker
  const maxDate = new Date(); // today

  // ---------- validation ----------
  function validateRow(dateISO: string, r: WorkRow): RowErrors {
    const errs: RowErrors = {};

    if (!r.task_description.trim()) errs.task_description = 'Task description is required.';
    if (!r.related_department) errs.related_department = 'Internal department is required.';
    if (!r.status) errs.status = 'Status is required.';

    if (!r.start_time) errs.start_time = 'Start time is required.';
    if (!r.end_time) errs.end_time = 'End time is required.';

    // Only check duration if both present
    if (r.start_time && r.end_time) {
      const mins = rowDurationMinutes(dateISO, r.start_time, r.end_time);
      if (mins <= 0) errs.duration = 'End time must be after start time.';
    }

    return errs;
  }

  function validateAll(nextRows = rows): boolean {
    const nextErrors: Record<string, RowErrors> = {};
    let ok = true;
    for (const r of nextRows) {
      const e = validateRow(reportDate, r);
      nextErrors[r.id] = e;
      if (Object.keys(e).length) ok = false;
    }
    setRowErrors(nextErrors);
    return ok;
  }

  // update helpers
  const setRow = (rowId: string, patch: Partial<WorkRow>) =>
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
      // live-validate just this row
      const row = next.find((r) => r.id === rowId)!;
      setRowErrors((old) => ({ ...old, [rowId]: validateRow(reportDate, row) }));
      return next;
    });

  const addRow = () =>
    setRows((prev) => {
      const next = [...prev, newRow()];
      // ensure an entry in errors map (empty) for UX consistency
      setRowErrors((old) => ({ ...old, [next[next.length - 1].id]: {} }));
      return next;
    });

  const removeRow = (rowId: string) =>
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((r) => r.id !== rowId);
      setRowErrors((old) => {
        const { [rowId]: _, ...rest } = old;
        return rest;
      });
      return next;
    });

  const allValid = useMemo(() => {
    // quick derived flag (does not mutate state)
    return rows.every((r) => {
      const e = validateRow(reportDate, r);
      return Object.keys(e).length === 0;
    });
  }, [rows, reportDate]);

  const submitAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    // final validation pass
    if (!validateAll()) {
      setMsg({ kind: 'err', text: 'Please fix the highlighted errors.' });
      return;
    }
    if (!profile) return;

    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        user_id: profile.id,
        work_date: reportDate,  // ISO yyyy-MM-dd for DB
        task_description: r.task_description.trim(),
        start_time: new Date(`${reportDate}T${r.start_time}`).toISOString(),
        end_time: new Date(`${reportDate}T${r.end_time}`).toISOString(),
        status: r.status as Exclude<Status, ''>,
        work_for_party: r.party_tags.join(', ') || null,
        related_department: r.related_department || null,
        assigned_by: r.assigned_by.trim() || null,
        remarks: r.remarks.trim() || null,
      }));

      const { error } = await sb.from('reports').insert(payload);
      if (error) {
        setMsg({ kind: 'err', text: error.message });
      } else {
        setMsg({ kind: 'ok', text: `Saved ${rows.length} task(s).` });
        setRows([newRow()]);
        setRowErrors({});
      }
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  };

  /* ====================== UI (compact) ====================== */

  const red = 'text-[11px] text-red-600 mt-1';

  return (
    <form onSubmit={submitAll} className="card p-3 space-y-3 max-w-6xl mx-auto">
      {/* Header row: Date + staff info */}
      <div className="grid grid-cols-12 gap-2 text-[13px]">
        <div className="col-span-12 sm:col-span-3">
          <label className="block text-[12px] font-semibold text-gray-700 mb-1">Report Date</label>
          <DatePicker
            selected={parseISO(reportDate)}
            onChange={(d: Date) => setReportDate(fmt(d, 'yyyy-MM-dd'))}
            dateFormat="dd-MM-yyyy"
            placeholderText="dd-mm-yyyy"
            className="input h-8 w-full"
            maxDate={maxDate}           // ⛔ cannot pick future date
          />
          {/* optional helper text */}
          <p className="text-[11px] text-gray-500 mt-1">.</p>
        </div>
        <div className="col-span-6 sm:col-span-2">
          <label className="block text-[12px] font-semibold text-gray-700 mb-1">Employee ID</label>
          <input disabled value={profile?.employee_id || ''} className="input h-8 bg-gray-100" />
        </div>
        <div className="col-span-6 sm:col-span-3">
          <label className="block text-[12px] font-semibold text-gray-700 mb-1">Name</label>
          <input disabled value={profile?.name || ''} className="input h-8 bg-gray-100" />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <label className="block text-[12px] font-semibold text-gray-700 mb-1">Designation</label>
          <input disabled value={profile?.designation || ''} className="input h-8 bg-gray-100" />
        </div>
        <div className="col-span-6 sm:col-span-2">
          <label className="block text-[12px] font-semibold text-gray-700 mb-1">Department</label>
          <input disabled value={profile?.department || ''} className="input h-8 bg-gray-100" />
        </div>
      </div>

      {/* Work rows */}
      <div className="space-y-2">
        {rows.map((r, idx) => {
          const mins = rowDurationMinutes(reportDate, r.start_time, r.end_time);
          const dur = fmtHHmm(mins);
          const errs = rowErrors[r.id] || {};
          return (
            <div key={r.id} className="rounded-lg border border-gray-200 p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[12px] font-semibold text-gray-700">Task No. {idx + 1}</div>
                <button
                  type="button"
                  className="text-[12px] text-red-600 hover:underline"
                  onClick={() => removeRow(r.id)}
                  disabled={rows.length === 1}
                >
                  Delete
                </button>
              </div>

              {/* Task description */}
              <div className="mb-1">
                <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                  Task / Work Description
                </label>
                <input
                  className={`input h-8 w-full ${errs.task_description ? 'border-red-500' : ''}`}
                  value={r.task_description}
                  onChange={(e) => setRow(r.id, { task_description: e.target.value })}
                  placeholder="Describe the work"
                />
                {errs.task_description && <p className={red}>{errs.task_description}</p>}
              </div>

              {/* Times + Dept + Status */}
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-3">
                  <TimeSelect12h
                    label="Start Time"
                    value={r.start_time}
                    onChange={(v) => setRow(r.id, { start_time: v })}
                    showCopyPrev={idx > 0}
                    prevEnd={idx > 0 ? rows[idx - 1].end_time || null : null}
                  />
                  {errs.start_time && <p className={red}>{errs.start_time}</p>}
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <TimeSelect12h
                    label="End Time"
                    value={r.end_time}
                    onChange={(v) => setRow(r.id, { end_time: v })}
                  />
                  {errs.end_time && <p className={red}>{errs.end_time}</p>}
                  {errs.duration && <p className={red}>{errs.duration}</p>}
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Internal Dept. <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={`select h-8 text-[13px] w-full ${errs.related_department ? 'border-red-500' : ''}`}
                    value={r.related_department}
                    onChange={(e) => setRow(r.id, { related_department: e.target.value })}
                  >
                    <option value="">Select</option>
                    {DEPARTMENTS.map((dep) => (
                      <option key={dep} value={dep}>{dep}</option>
                    ))}
                  </select>
                  {errs.related_department && <p className={red}>{errs.related_department}</p>}
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={`select h-8 text-[13px] w-full ${errs.status ? 'border-red-500' : ''}`}
                    value={r.status}
                    onChange={(e) => setRow(r.id, { status: e.target.value as Status })}
                  >
                    <option value="">Select</option>
                    <option value="Complete">Complete</option>
                    <option value="Pending">Pending</option>
                    <option value="In-Progress">In-Progress</option>
                  </select>
                  {errs.status && <p className={red}>{errs.status}</p>}
                </div>
              </div>

              {/* Related party + Assigned + Remarks */}
              <div className="grid grid-cols-12 gap-2 mt-1">
                <div className="col-span-12 sm:col-span-6">
                  <TagInput
                    id={`party-${r.id}`}
                    label="Related Party"
                    value={r.party_tags}
                    onChange={(tags) => setRow(r.id, { party_tags: tags })}
                    placeholder="Type name and press , or Enter"
                  />
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">Assigned By</label>
                  <input
                    className="input h-8 w-full"
                    value={r.assigned_by}
                    onChange={(e) => setRow(r.id, { assigned_by: e.target.value })}
                  />
                </div>
                <div className="col-span-12 sm:col-span-3">
                  <label className="block text-[12px] font-semibold text-gray-700 mb-1">Remarks</label>
                  <input
                    className="input h-8 w-full"
                    value={r.remarks}
                    onChange={(e) => setRow(r.id, { remarks: e.target.value })}
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="mt-1 text-[12px] text-gray-600">
                Duration: <b className={mins <= 0 && r.start_time && r.end_time ? 'text-red-600' : ''}>{dur} hrs</b>
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <button type="button" className="btn h-8 text-[13px] px-3" onClick={addRow}>+ Add Task</button>
        <button
          type="submit"
          className={`btn h-8 text-[13px] px-4 ${allValid ? 'btn-primary' : ''}`}
          disabled={saving}
        >
          {saving ? 'Saving…' : `Submit (${rows.length})`}
        </button>
      </div>

      {msg && (
        <p className={`text-[12px] ${msg.kind === 'ok' ? 'text-green-700' : 'text-red-600'}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}