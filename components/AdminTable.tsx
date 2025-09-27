'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

// ⬇️ Datepicker + date-fns
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as fmt, parseISO } from 'date-fns';

// Row coming from the VIEW
type VRow = {
  id: string;
  user_id: string | null;
  work_date: string | null;     // 'YYYY-MM-DD'
  task_description: string | null;
  start_time: string | null;    // ISO
  end_time: string | null;      // ISO
  status: string | null;
  work_for_party: string | null;
  related_department: string | null;
  assigned_by: string | null;
  remarks: string | null;
  created_at: string | null;    // submitted at (ISO)
  employee_id: string | null;
  staff_name: string | null;
  staff_designation: string | null;
  staff_department: string | null;
};

const DEPARTMENTS = [
  'All','HR','Accounts','Engineering','Production','Sales','Marketing','Export','Purchase',
] as const;

// ---------- helpers ----------
function todayISO() {
  return new Date().toISOString().slice(0, 10); // yyyy-MM-dd
}
function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
function fmtHHmm(mins: number) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${pad2(h)}:${pad2(m)}`;
}
function durationMinutes(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return 0;
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
}
function toTimeHM(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return fmt(d, 'HH:mm'); // 24h HH:mm
}
// Show dd-MM-yyyy
function ddmmyyyyFromWorkDate(workDateISO?: string | null) {
  if (!workDateISO) return '';
  try { return fmt(parseISO(workDateISO), 'dd-MM-yyyy'); } catch { return ''; }
}
function ddmmyyyyFromDateTime(iso?: string | null) {
  if (!iso) return '';
  try { return fmt(new Date(iso), 'dd-MM-yyyy'); } catch { return ''; }
}
// Excel-safe wrapper (prevents auto-conversion & apostrophe display)
function excelSafeText(s: string) {
  return `="${String(s ?? '').replace(/"/g, '""')}"`;
}

// ---------- component ----------
export default function AdminTable() {
  const sb = getSupabase();

  // Keep canonical state as ISO yyyy-MM-dd
  const [fromDateISO, setFromDateISO] = useState<string>(() => todayISO());
  const [toDateISO, setToDateISO]     = useState<string>(() => todayISO());

  // rows + ui
  const [rows, setRows] = useState<VRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState<(typeof DEPARTMENTS)[number]>('All');
  const [view, setView] = useState<'detailed' | 'grouped'>('detailed');

  async function loadRange(fromD: string, toD: string) {
    setMsg('');
    setLoading(true);

    let { data, error } = await sb
      .from('reports_with_profiles')
      .select('*')
      .gte('work_date', fromD)
      .lte('work_date', toD)
      .order('work_date', { ascending: true, nullsFirst: true })
      .order('start_time', { ascending: true, nullsFirst: true });

    if (!error && (!data || data.length === 0)) {
      const fromISO = new Date(`${fromD}T00:00:00.000Z`).toISOString();
      const toISO   = new Date(`${toD}T23:59:59.999Z`).toISOString();
      ({ data, error } = await sb
        .from('reports_with_profiles')
        .select('*')
        .gte('start_time', fromISO)
        .lte('start_time', toISO)
        .order('start_time', { ascending: true, nullsFirst: true }));
    }

    if (error) {
      setMsg(error.message || 'Failed to load');
      setRows([]);
    } else {
      setRows((data as VRow[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadRange(fromDateISO, toDateISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDateISO, toDateISO]);

  // filtering
  const filtered = useMemo(() => {
    let r = rows;
    if (deptFilter !== 'All') {
      r = r.filter(
        x => (x.staff_department || '').toLowerCase() === deptFilter.toLowerCase()
      );
    }
    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      r = r.filter(x =>
        (x.staff_name || '').toLowerCase().includes(q) ||
        (x.employee_id || '').toLowerCase().includes(q)
      );
    }
    // Stable sort for T/N calculation:
    return [...r].sort((a, b) => {
      const ad = a.work_date || '';
      const bd = b.work_date || '';
      if (ad !== bd) return ad.localeCompare(bd);
      if ((a.user_id || '') !== (b.user_id || '')) return (a.user_id || '').localeCompare(b.user_id || '');
      const as = a.start_time || '';
      const bs = b.start_time || '';
      return as.localeCompare(bs);
    });
  }, [rows, nameFilter, deptFilter]);

  // compute Task Number per user per date
  const withSerial = useMemo(() => {
    const snMap = new Map<string, number>(); 
    return filtered.map(r => {
      const key = `${r.user_id || 'x'}|${r.work_date || ''}`;
      const next = (snMap.get(key) || 0) + 1;
      snMap.set(key, next);
      return { ...r, _tn: next }; // T/N
    });
  }, [filtered]);// grouped summary (unique staff)
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { name: string | null; designation: string | null; department: string | null; reports: number; minutes: number; statuses: Record<string, number>; }
    >();
    for (const r of filtered) {
      const id = r.user_id || `unknown-${r.id}`;
      const prev = map.get(id) || {
        name: r.staff_name || null,
        designation: r.staff_designation || null,
        department: r.staff_department || null,
        reports: 0,
        minutes: 0,
        statuses: {},
      };
      prev.reports += 1;
      prev.minutes += durationMinutes(r.start_time, r.end_time);
      const st = (r.status || 'Unknown').trim();
      prev.statuses[st] = (prev.statuses[st] || 0) + 1;
      map.set(id, prev);
    }
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [filtered]);

  // headers
  const headersDetailed = [
    'Report Date','Emp. ID','Staff Name','Designation','Department',
    'T/N','Work Description','Start Time','End Time','Duration',
    'Status','Related Party','Internal Dept.','Assigned By','Remarks','Submitted At'
  ];
  const headersGrouped = [
    'T/N','Staff Name','Designation','Department','Reports','Total Duration','Statuses'
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Admin — Daily Reports</h2>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label">From</label>
          <DatePicker
            selected={parseISO(fromDateISO)}
            onChange={(d: Date) => setFromDateISO(fmt(d, 'yyyy-MM-dd'))}
            dateFormat="dd-MM-yyyy"
            className="input w-44"
          />
          <label className="label">To</label>
          <DatePicker
            selected={parseISO(toDateISO)}
            onChange={(d: Date) => setToDateISO(fmt(d, 'yyyy-MM-dd'))}
            dateFormat="dd-MM-yyyy"
            className="input w-44"
          />
          <button className="btn" onClick={() => { const t = todayISO(); setFromDateISO(t); setToDateISO(t); }}>
            Today
          </button>

          <input
            placeholder="Filter by Staff Name / Emp ID"
            className="input min-w-[240px]"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />

          <select className="select w-44" value={deptFilter} onChange={e=>setDeptFilter(e.target.value as any)}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button type="button" className={`btn ${view==='detailed' ? 'bg-gray-100' : ''}`} onClick={()=>setView('detailed')}>Detailed</button>
            <button type="button" className={`btn ${view==='grouped' ? 'bg-gray-100' : ''}`} onClick={()=>setView('grouped')}>Grouped</button>
            <button className="btn" onClick={exportCSV}>Export (CSV)</button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-600">Loading…</p>}
        {msg && <p className="text-sm text-red-600">{msg}</p>}

        {view === 'grouped' ? (
          <div className="relative max-h-[70vh] overflow-auto border rounded-lg">
            <table className="min-w-[900px] text-[13px] leading-5">
              <thead>
                <tr className="bg-white sticky top-0 z-20 shadow-sm">
                  {headersGrouped.map((h)=>(
                    <th key={h} className="px-3 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {grouped.length===0 && (
                  <tr><td className="px-3 py-6 text-center" colSpan={headersGrouped.length}>No data</td></tr>
                )}
                {grouped.map((g,i)=>(
                  <tr key={g.id} className="odd:bg-white even:bg-gray-50">
                    <td className="px-3 py-2">{i+1}</td>
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="px-3 py-2">{g.designation}</td>
                    <td className="px-3 py-2">{g.department}</td>
                    <td className="px-3 py-2">{g.reports}</td>
                    <td className="px-3 py-2">{fmtHHmm(g.minutes)}</td>
                    <td className="px-3 py-2">{Object.entries(g.statuses).map(([k,v]) => `${k}: ${v}`).join(' | ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative max-h-[70vh] overflow-auto border rounded-lg">
            <table className="min-w-[1900px] text-[13px] leading-5">
              <thead>
                <tr className="bg-white sticky top-0 z-20 shadow-sm">
                  {headersDetailed.map(h=>(
                    <th key={h} className="px-3 py-2 text-left border-b whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {withSerial.length===0 && (
                  <tr><td className="px-3 py-6 text-center" colSpan={headersDetailed.length}>No data</td></tr>
                )}
                {withSerial.map(r=>(
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50 align-top">
                    <td className="px-3 py-2">
                      {r.work_date
                        ? ddmmyyyyFromWorkDate(r.work_date)
                        : ddmmyyyyFromDateTime(r.start_time)}
                    </td>
                    <td className="px-3 py-2">{r.employee_id}</td>
                    <td className="px-3 py-2">{r.staff_name}</td>
                    <td className="px-3 py-2">{r.staff_designation}</td>
                    <td className="px-3 py-2">{r.staff_department}</td>
                    <td className="px-3 py-2">{r._tn}</td>
                    <td className="px-3 py-2">{r.task_description}</td>
                    <td className="px-3 py-2">{toTimeHM(r.start_time)}</td>
                    <td className="px-3 py-2">{toTimeHM(r.end_time)}</td>
                    <td className="px-3 py-2">{fmtHHmm(durationMinutes(r.start_time, r.end_time))}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.work_for_party}</td>
                    <td className="px-3 py-2">{r.related_department}</td>
                    <td className="px-3 py-2">{r.assigned_by}</td>
                    <td className="px-3 py-2">{r.remarks}</td>
                    <td className="px-3 py-2">
                      {r.created_at ? fmt(new Date(r.created_at), 'dd-MM-yyyy HH:mm') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ================== CSV Export ==================
  function exportCSV() {
    const rangeLabel = `${fmt(parseISO(fromDateISO), 'dd-MM-yyyy')}_to_${fmt(parseISO(toDateISO), 'dd-MM-yyyy')}`;

    function downloadCSV(rows: (string | number)[][], filename: string) {
      const csv =
        rows
          .map(row =>
            row
              .map(v => {
                const s = String(v ?? '');
                const needs = /[",\n]/.test(s);
                return needs ? `"${s.replace(/"/g, '""')}"` : s;
              })
              .join(',')
          )
          .join('\n') + '\n';
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    }

    if (view === 'grouped') {
      const header = ['T/N','Staff Name','Designation','Department','Reports','Total Duration','Statuses'];
      const lines = grouped.map((g, i) => [
        i + 1,
        g.name ?? '',
        g.designation ?? '',
        g.department ?? '',
        g.reports,
        fmtHHmm(g.minutes),
        Object.entries(g.statuses).map(([k, v]) => `${k}: ${v}`).join(' | ')
      ]);
      downloadCSV([header, ...lines], `Daily_Reports_Grouped_${rangeLabel}.csv`);
    } else {
      const header = [
        'Report Date','Emp. ID','Staff Name','Designation','Department',
        'T/N','Work Description','Start Time','End Time','Duration',
        'Status','Related Party','Internal Dept.','Assigned By','Remarks','Submitted At'
      ];
      const lines = withSerial.map(r => {
        const reportDate = r.work_date
          ? ddmmyyyyFromWorkDate(r.work_date)
          : ddmmyyyyFromDateTime(r.start_time);
        const submittedAt = r.created_at
          ? fmt(new Date(r.created_at), 'dd-MM-yyyy HH:mm')
          : '';

        return [
          excelSafeText(reportDate),
          r.employee_id || '',
          r.staff_name || '',
          r.staff_designation || '',
          r.staff_department || '',
          r._tn,
          r.task_description || '',
          toTimeHM(r.start_time),
          toTimeHM(r.end_time),
          fmtHHmm(durationMinutes(r.start_time, r.end_time)),
          r.status || '',
          r.work_for_party || '',
          r.related_department || '',
          r.assigned_by || '',
          r.remarks || '',
          excelSafeText(submittedAt)
        ];
      });
      downloadCSV([header, ...lines], `Daily_Reports_${rangeLabel}.csv`);
    }
  }
}