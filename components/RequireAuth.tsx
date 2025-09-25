'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sb = getSupabase();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        router.replace('/login'); // not logged in
        return;
      }
      setReady(true);
    })();
  }, []);

  if (!ready) return <div className="p-6">Checking session…</div>;
  return <>{children}</>;
}