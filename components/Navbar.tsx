'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  name: string | null;
  role: 'admin' | 'staff' | null;
};

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-3 py-2 rounded-md text-sm font-medium ${
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const sb = getSupabase();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await sb
      .from('profiles')
      .select('id, name, role')
      .eq('auth_user_id', user.id)
      .single();
    setProfile((data as Profile) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
    const { data: sub } = sb.auth.onAuthStateChange((_event, _session) => {
      loadProfile();
      router.refresh();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router, sb]);

  async function logout() {
    await sb.auth.signOut();
    setProfile(null);
    router.replace('/login');
    router.refresh();
  }

  if (loading) return null;

  return (
    <header className="border-b bg-white/70 backdrop-blur sticky top-0 z-40">
      <div className="container mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">

        {/* Premium DWR Logo (3D style text) */}
        <Link href="/" className="flex items-center">
          <span
            className="text-2xl font-extrabold text-black tracking-wide 
                       drop-shadow-[2px_2px_4px_rgba(0,0,0,0.25)] 
                       hover:drop-shadow-[3px_3px_6px_rgba(0,0,0,0.35)] 
                       transition-all select-none"
          >
            DWR
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/" label="Home" active={pathname === '/'} />

          {profile ? (
            <>
              <NavLink href="/report" label="Report" active={pathname === '/report'} />
              <NavLink href="/my-reports" label="My Reports" active={pathname === '/my-reports'} />

              {profile.role === 'admin' && (
                <>
                  <NavLink href="/admin" label="Admin" active={pathname === '/admin'} />
                  <NavLink href="/admin/users" label="Users" active={pathname === '/admin/users'} />
                  <NavLink
                    href="/admin/reset-password"
                    label="Reset Password"
                    active={pathname === '/admin/reset-password'}
                  />
                </>
              )}

              <NavLink
                href="/change-password"
                label="Change Password"
                active={pathname === '/change-password'}
              />

              {profile.name && (
                <span className="ml-3 text-sm text-gray-600">Hi, {profile.name}</span>
              )}
              <button
                onClick={logout}
                className="ml-2 px-3 py-2 rounded-md text-sm border hover:bg-gray-50"
              >
                Logout
              </button>
            </>
          ) : (
            <NavLink href="/login" label="Login" active={pathname === '/login'} />
          )}
        </nav>
      </div>
    </header>
  );
}