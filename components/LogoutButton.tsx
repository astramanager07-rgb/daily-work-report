// components/LogoutButton.tsx (CLIENT)
'use client';

import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabaseClient';

export default function LogoutButton() {
  const router = useRouter();
  const sb = getSupabase();

  async function handleLogout() {
    await sb.auth.signOut();
    router.push('/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="px-3 py-2 rounded-md text-sm border border-gray-300 text-gray-800 hover:bg-gray-50"
      title="Sign out"
    >
      Logout
    </button>
  );
}