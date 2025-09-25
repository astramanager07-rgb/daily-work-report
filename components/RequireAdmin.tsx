'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

export default function RequireAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sb = getSupabase();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace('/login');

      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('auth_user_id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        // logged in but not admin → send to /report
        router.replace('/report');
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <div className="p-6">Checking permissions…</div>;
  return <>{children}</>;
}