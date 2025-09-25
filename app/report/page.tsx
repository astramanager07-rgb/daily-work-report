import ReportForm from '@/components/ReportForm';
import RequireAuth from '@/components/RequireAuth';

export default function Page() {
  return (
    <RequireAuth>
      <main className="p-6">
        <ReportForm />
      </main>
    </RequireAuth>
  );
}