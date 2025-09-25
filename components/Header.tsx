'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

export default function Header() {
  const [email, setEmail] = useState<string>('');
  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);
  return (
    <header className="w-full border-b p-4 flex items-center justify-between">
      <Link href="/" className="font-semibold">Daily Work Report</Link>
      <nav className="flex gap-4 text-sm">
        <Link href="/report">Report</Link>
        <Link href="/admin">Admin</Link>
        {email ? <span className="opacity-70">{email}</span> : null}
      </nav>
    </header>
  );
}
