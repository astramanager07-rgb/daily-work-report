// app/my-reports/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as fmt, parseISO } from 'date-fns';

type VRow = {
  id: string;
  user_id: string;               
  work_date: string;             
  task_description: string;
  start_time: string;            
  end_time: string;              
  status: string;
  work_for_party: string;
  related_department: string;
  assigned_by: string;
  remarks: string;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toTimeHM(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return fmt(d, 'HH:mm');
}
function ddmmyyyyFromWorkDate(workDateISO?: string | null) {
  if (!workDateISO) return '';
  try { return fmt(parseISO(workDateISO), 'dd-MM-yyyy'); } catch { return ''; }
}

export default function MyReportsPage() {
  const sb = getSupabase();
  const router = useRouter();

  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());

  // Fetch current profile.id, then reports for that profile
  useEffect(() => {
    (async () => {
      setMsg('');
      setLoading(true);

      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.replace('/login');
        setLoading(false);
        return;
      }

      const { data: prof, error: profErr } = await sb
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();

      if (profErr || !prof?.id) {
        setMsg('Could not load your profile.');
        setRows([]);
        setLoading(false);
        return;
      }

      let { data, error } = await sb
        .from('reports_with_profiles')
        .select('*')
        .eq('user_id', prof.id)          
        .gte('work_date', fromDate)
        .lte('work_date', toDate)
        .order('work_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        setMsg(error.message);
        setRows([]);
      } else {
        setRows((data as VRow[]) || []);
      }
      setLoading(false);
    })();
  }, [sb, router, fromDate, toDate]);

  // Add T/N per user per date
  const withTN = useMemo(() => {
    const snMap = new Map<string, number>();
    return rows.map(r => {
      const key = `${r.user_id}|${r.work_date}`;
      const next = (snMap.get(key) || 0) + 1;
      snMap.set(key, next);
      return { ...r, _tn: next };
    });
  }, [rows]);

  function exportCSV() {
    if (!withTN.length) return;
    const header = [
      'Report Date','T/N','Task Description','Start','End',
      'Status','Related Party','Internal Dept.','Assigned By','Remarks'
    ];
    const body = withTN.map(r => [
      ddmmyyyyFromWorkDate(r.work_date),
      r._tn,
      r.task_description ?? '',
      toTimeHM(r.start_time),
      toTimeHM(r.end_time),
      r.status ?? '',
      r.work_for_party ?? '',
      r.related_department ?? '',
      r.assigned_by ?? '',
      r.remarks ?? ''
    ]);

    const csv = [header, ...body]
      .map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MyReports_${fromDate}_to_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">My Reports</h2>

      <div className="card p-4 space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="label">From</label>
          <DatePicker
            selected={parseISO(fromDate)}
            onChange={(d: Date) => setFromDate(fmt(d, 'yyyy-MM-dd'))}
            dateFormat="dd-MM-yyyy"
            className="input w-40"
          />
          <label className="label">To</label>
          <DatePicker
            selected={parseISO(toDate)}
            onChange={(d: Date) => setToDate(fmt(d, 'yyyy-MM-dd'))}
            dateFormat="dd-MM-yyyy"
            className="input w-40"
          />
          <button
            type="button"
            className="btn"
            onClick={() => { const t = todayISO(); setFromDate(t); setToDate(t); }}
          >
            Today
          </button>
          <div className="ml-auto">
            <button className="btn" onClick={exportCSV}>Export (CSV)</button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-600">Loading…</p>}
        {msg && <p className="text-sm text-red-600">{msg}</p>}

        {/* Table (no Duration, no Submitted At) */}
        <div className="relative max-h-[70vh] overflow-auto border rounded-lg">
          <table className="min-w-[1200px] text-[13px] leading-5">
            <thead>
              <tr className="bg-white sticky top-0 z-20 shadow-sm">
                <th className="px-3 py-2 text-left border-b">Report Date</th>
                <th className="px-3 py-2 text-left border-b">T/N</th>
                <th className="px-3 py-2 text-left border-b">Task Description</th>
                <th className="px-3 py-2 text-left border-b">Start</th>
                <th className="px-3 py-2 text-left border-b">End</th>
                <th className="px-3 py-2 text-left border-b">Status</th>
                <th className="px-3 py-2 text-left border-b">Related Party</th>
                <th className="px-3 py-2 text-left border-b">Internal Dept.</th>
                <th className="px-3 py-2 text-left border-b">Assigned By</th>
                <th className="px-3 py-2 text-left border-b">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {withTN.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center" colSpan={10}>No data</td>
                </tr>
              )}
              {withTN.map(r => (
                <tr key={r.id} className="odd:bg-white even:bg-gray-50 align-top">
                  <td className="px-3 py-2">{ddmmyyyyFromWorkDate(r.work_date)}</td>
                  <td className="px-3 py-2">{r._tn}</td>
                  <td className="px-3 py-2">{r.task_description}</td>
                  <td className="px-3 py-2">{toTimeHM(r.start_time)}</td>
                  <td className="px-3 py-2">{toTimeHM(r.end_time)}</td>
                  <td className="px-3 py-2">{r.status}</td>
                  <td className="px-3 py-2">{r.work_for_party}</td>
                  <td className="px-3 py-2">{r.related_department}</td>
                  <td className="px-3 py-2">{r.assigned_by}</td>
                  <td className="px-3 py-2">{r.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}