'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

type Staff = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  designation: string | null;
  department: string | null;
};

type ReportRow = {
  id: string;
  user_id: string | null;
  work_date: string | null;          // 'YYYY-MM-DD'
  task_description: string | null;
  start_time: string | null;         // ISO
  end_time: string | null;           // ISO
  status: string | null;
  work_for_party: string | null;
  related_department: string | null;
  assigned_by: string | null;
  remarks: string | null;
  created_at?: string | null;
};

type MergedRow = ReportRow & { staff?: Staff | null };

const DEPARTMENTS = [
  'All', 'HR', 'Accounts', 'Engineering', 'Production',
  'Sales', 'Marketing', 'Export', 'Purchase',
];

function toTime(t: string | null) {
  return t ? new Date(t).toLocaleTimeString() : '';
}

function durationHours(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return 0;
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminTable() {
  const sb = getSupabase();

  const [fromDate, setFromDate] = useState<string>(() => todayStr());
  const [toDate, setToDate] = useState<string>(() => todayStr());

  const [rows, setRows] = useState<MergedRow[]>([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [view, setView] = useState<'detailed' | 'grouped'>('detailed');

  async function loadRange(fromD: string, toD: string) {
    setMsg('');
    setLoading(true);

    // Primary: filter by work_date
    let { data: reports, error } = await sb
      .from('reports')
      .select(
        'id, user_id, work_date, task_description, start_time, end_time, status, work_for_party, related_department, assigned_by, remarks, created_at'
      )
      .gte('work_date', fromD)
      .lte('work_date', toD)
      .order('work_date', { ascending: true, nullsFirst: true })
      .order('start_time', { ascending: true, nullsFirst: true });

    // Fallback: filter by start_time when work_date is null/unused
    if (!error && (!reports || reports.length === 0)) {
      const dayStart = new Date(`${fromD}T00:00:00.000Z`).toISOString();
      const dayEnd = new Date(`${toD}T23:59:59.999Z`).toISOString();
      ({ data: reports, error } = await sb
        .from('reports')
        .select(
          'id, user_id, work_date, task_description, start_time, end_time, status, work_for_party, related_department, assigned_by, remarks, created_at'
        )
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time', { ascending: true, nullsFirst: true }));
    }

    if (error) {
      setMsg(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const reportRows = (reports as ReportRow[]) ?? [];

    // Load all staff in one query
    const userIds = Array.from(
      new Set(reportRows.map((r) => r.user_id).filter(Boolean))
    ) as string[];

    let profilesMap: Record<string, Staff> = {};
    if (userIds.length > 0) {
      const { data: profs, error: profErr } = await sb
        .from('profiles')
        .select('id, auth_user_id, email, name, designation, department')
        .in('id', userIds);

      if (profErr) {
        setMsg(`Loaded reports, but failed to load names: ${profErr.message}`);
      } else {
        for (const p of (profs as Staff[])) profilesMap[p.id] = p;
      }
    }

    const merged: MergedRow[] = reportRows.map((r) => ({
      ...r,
      staff: r.user_id ? profilesMap[r.user_id] : null,
    }));

    setRows(merged);
    setLoading(false);
  }

  useEffect(() => {
    loadRange(fromDate, toDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const filtered = useMemo(() => {
    let r = rows;
    if (deptFilter !== 'All') {
      r = r.filter(
        (x) =>
          (x.staff?.department || '').toLowerCase() ===
          deptFilter.toLowerCase()
      );
    }
    if (nameFilter.trim()) {
      const q = nameFilter.toLowerCase();
      r = r.filter((x) => (x.staff?.name || '').toLowerCase().includes(q));
    }
    return r;
  }, [rows, nameFilter, deptFilter]);

  // Grouped by staff
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { staff: Staff | null; reportsCount: number; totalHours: number; statuses: Record<string, number> }
    >();

    for (const r of filtered) {
      const key = r.user_id || `unknown-${r.id}`;
      const prev = map.get(key) || {
        staff: r.staff || null,
        reportsCount: 0,
        totalHours: 0,
        statuses: {},
      };
      prev.reportsCount += 1;
      prev.totalHours += durationHours(r.start_time, r.end_time);
      const st = (r.status || 'Unknown').trim();
      prev.statuses[st] = (prev.statuses[st] || 0) + 1;
      map.set(key, prev);
    }

    return Array.from(map.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (a.staff?.name || '').localeCompare(b.staff?.name || ''));
  }, [filtered]);

  // CSV export
  function exportCSV() {
    const rangeLabel = `${fromDate}_to_${toDate}`;

    if (view === 'grouped') {
      const header = ['S/N', 'Staff Name', 'Designation', 'Department', 'Reports', 'Total Hours', 'Statuses'];
      const lines = grouped.map((g, i) => [
        String(i + 1),
        g.staff?.name ?? '',
        g.staff?.designation ?? '',
        g.staff?.department ?? '',
        String(g.reportsCount),
        String(Math.round(g.totalHours * 100) / 100),
        Object.entries(g.statuses).map(([k, v]) => `${k}: ${v}`).join(' | '),
      ]);
      downloadCSV([header, ...lines], `Daily_Reports_Grouped_${rangeLabel}.csv`);
    } else {
      const header = [
        'S/N','Staff Name','Designation','Department','Date','Work Name','Start','End','Status','Work for Party','Related Dept.','Assigned By','Remarks'
      ];
      const lines = filtered.map((r, i) => [
        String(i + 1),
        r.staff?.name ?? '',
        r.staff?.designation ?? '',
        r.staff?.department ?? '',
        r.work_date || (r.start_time ? r.start_time.slice(0, 10) : ''),
        r.task_description ?? '',
        toTime(r.start_time),
        toTime(r.end_time),
        r.status ?? '',
        r.work_for_party ?? '',
        r.related_department ?? '',
        r.assigned_by ?? '',
        r.remarks ?? '',
      ]);
      downloadCSV([header, ...lines], `Daily_Reports_${rangeLabel}.csv`);
    }
  }

  function downloadCSV(rows: (string | number)[][], filename: string) {
    const csv =
      rows
        .map((row) =>
          row
            .map((v) => {
              const s = String(v ?? '');
              const needsQuotes = /[",\n]/.test(s);
              return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(',')
        )
        .join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const headersDetailed = [
    'S/N','Staff Name','Designation','Department','Date','Work Name','Start','End','Status','Work for Party','Related Dept.','Assigned By','Remarks'
  ];
  const headersGrouped = [
    'S/N','Staff Name','Designation','Department','Reports','Total Hours','Statuses'
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Admin — Daily Reports</h2>

      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label">From</label>
          <input
            type="date"
            className="input w-44"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <label className="label">To</label>
          <input
            type="date"
            className="input w-44"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          <button
            className="btn"
            onClick={() => {
              const t = todayStr();
              setFromDate(t);
              setToDate(t);
            }}
          >
            Today
          </button>

          <input
            placeholder="Filter by Staff Name"
            className="input min-w-[220px]"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />

          <select
            className="select w-44"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className={`btn ${view === 'detailed' ? 'bg-gray-100' : ''}`}
              onClick={() => setView('detailed')}
            >
              Detailed
            </button>
            <button
              type="button"
              className={`btn ${view === 'grouped' ? 'bg-gray-100' : ''}`}
              onClick={() => setView('grouped')}
            >
              Grouped (unique staff)
            </button>

            {/* Export stays here */}
            <button onClick={exportCSV} className="btn">Export (CSV)</button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-600">Loading…</p>}
        {msg && <p className="text-sm text-red-600">{msg}</p>}

        {view === 'grouped' ? (
          <div className="relative max-h-[70vh] overflow-auto border rounded-lg">
            <table className="min-w-[1100px] text-[13px] leading-5">
              <thead>
                <tr className="bg-white sticky top-0 z-20 shadow-sm">
                  {headersGrouped.map((h, i) => (
                    <th
                      key={h}
                      className={[
                        'px-3 py-2 text-left border-b whitespace-nowrap',
                        i === 0 ? 'w-14' : '',
                        h === 'Staff Name' ? 'w-56' : '',
                        h === 'Designation' ? 'w-48' : '',
                        h === 'Department' ? 'w-48' : '',
                        h === 'Reports' ? 'w-24' : '',
                        h === 'Total Hours' ? 'w-28' : '',
                      ].join(' ')}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {grouped.length === 0 && (
                  <tr><td className="px-3 py-6 text-center" colSpan={headersGrouped.length}>No data</td></tr>
                )}
                {grouped.map((g, i) => (
                  <tr key={g.id} className="odd:bg-white even:bg-gray-50 align-top">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{g.staff?.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{g.staff?.designation}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{g.staff?.department}</td>
                    <td className="px-3 py-2">{g.reportsCount}</td>
                    <td className="px-3 py-2">{Math.round(g.totalHours * 100) / 100}</td>
                    <td className="px-3 py-2 truncate max-w-[420px]">
                      {Object.entries(g.statuses).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative max-h-[70vh] overflow-auto border rounded-lg">
            <table className="min-w-[1750px] text-[13px] leading-5">
              <thead>
                <tr className="bg-white sticky top-0 z-20 shadow-sm">
                  {headersDetailed.map((label, i) => (
                    <th
                      key={label}
                      className={[
                        'px-3 py-2 text-left border-b whitespace-nowrap',
                        i === 0 ? 'w-14' : '',
                        label === 'Staff Name' ? 'w-56' : '',
                        label === 'Designation' ? 'w-48' : '',
                        label === 'Department' ? 'w-48' : '',
                        label === 'Date' ? 'w-32' : '',
                        label === 'Work Name' ? 'w-[280px]' : '',
                        label === 'Start' ? 'w-28' : '',
                        label === 'End' ? 'w-28' : '',
                        label === 'Status' ? 'w-32' : '',
                        label === 'Work for Party' ? 'w-44' : '',
                        label === 'Related Dept.' ? 'w-44' : '',
                        label === 'Assigned By' ? 'w-44' : '',
                        label === 'Remarks' ? 'w-[320px]' : '',
                      ].join(' ')}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 && (
                  <tr><td className="px-3 py-6 text-center" colSpan={headersDetailed.length}>No data</td></tr>
                )}
                {filtered.map((r, i) => (
                  <tr key={r.id} className="odd:bg-white even:bg-gray-50 align-top">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{r.staff?.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{r.staff?.designation}</td>
                    <td className="px-3 py-2 whitespace-nowrap truncate max-w-[220px]">{r.staff?.department}</td>
                    <td className="px-3 py-2">{r.work_date || (r.start_time ? r.start_time.slice(0, 10) : '')}</td>
                    <td className="px-3 py-2 truncate max-w-[260px]">{r.task_description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{toTime(r.start_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{toTime(r.end_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.status}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{r.work_for_party}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{r.related_department}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]">{r.assigned_by}</td>
                    <td className="px-3 py-2 truncate max-w-[300px]">{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}