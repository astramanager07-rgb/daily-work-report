import AdminTable from '@/components/AdminTable';
import RequireAdmin from '@/components/RequireAdmin';

export default function Page() {
  return (
    <RequireAdmin>
      <main className="p-6">
        <AdminTable />
      </main>
    </RequireAdmin>
  );
}