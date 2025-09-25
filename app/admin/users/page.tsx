// app/admin/users/page.tsx
import RequireAdmin from '@/components/RequireAdmin';
import AdminUserTable from '@/components/AdminUserTable';

export default function Page() {
  return (
    <RequireAdmin>
      <main className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Admin — Users</h1>
        <AdminUserTable />
      </main>
    </RequireAdmin>
  );
}