import * as XLSX from 'xlsx';

export function exportDay(rows: any[], date: string) {
  const data = rows.map((r: any, i: number) => ({
    'S/N': i + 1,
    'Staff Name': r.profiles.name,
    'Designation': r.profiles.designation,
    'Department': r.profiles.department,
    'Date': r.work_date,
    'Work Name': r.task_description,
    'Start Time': new Date(r.start_time).toLocaleTimeString(),
    'End Time': new Date(r.end_time).toLocaleTimeString(),
    'Status': r.status,
    'Work for Party': r.work_for_party || '',
    'Work Related Dep.': r.related_department || '',
    'Assigned By': r.assigned_by || '',
    'Remarks': r.remarks || '',
    'Duration (hrs)': r.duration_hours
  }));
  const ws = XLSX.utils.json_to_sheet(data, { header: Object.keys(data[0] || {}) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, date);
  XLSX.writeFile(wb, `DWReport_${date}.xlsx`);
}
