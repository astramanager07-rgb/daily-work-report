// app/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  name: string | null;
  role: 'admin' | 'staff' | null;
  designation: string | null;
  department: string | null;
};

type Action = {
  href: string;
  label: string;
  desc: string;
  primary?: boolean;
};

export default function HomePage() {
  const sb = getSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await sb
        .from('profiles')
        .select('id, name, role, designation, department')
        .eq('auth_user_id', user.id)
        .single();
      setProfile((data as Profile) ?? null);
      setLoading(false);
    })();
  }, [sb]);

  const isAdmin = profile?.role === 'admin';
  const firstName = (profile?.name || '').split(' ')[0] || 'Welcome';

  const actions: Action[] = useMemo(() => {
    const base: Action[] = [
      { href: '/report', label: 'Fill Today’s Report', desc: 'Add your work items', primary: true },
      { href: '/change-password', label: 'Change Password', desc: 'Keep your account secure' },
    ];
    const admin: Action[] = [
      { href: '/admin', label: 'Admin Dashboard', desc: 'View & export reports' },
      { href: '/admin/users', label: 'Manage Users', desc: 'Add or edit staff' },
      { href: '/admin/reset-password', label: 'Reset User Password', desc: 'Admin only' },
    ];
    return isAdmin ? [...base.slice(0, 1), ...admin, base[1]] : base;
  }, [isAdmin]);

  return (
    <main>
      {/* Hero / Header */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-50 via-white to-sky-50" />
        <div className="container mx-auto max-w-6xl px-4 pt-10 pb-6">
          <div className="rounded-2xl border bg-white/70 backdrop-blur p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
                  Daily Work Report
                </h1>
                <p className="mt-2 text-gray-600">
                  {loading ? (
                    'Loading your profile…'
                  ) : profile ? (
                    <>
                      Hi <span className="font-medium">{firstName}</span>
                      {profile.designation && (
                        <>
                          , <span className="text-gray-700">{profile.designation}</span>
                        </>
                      )}
                      {profile.department && (
                        <>
                          {' '}— <span className="text-gray-700">{profile.department}</span>
                        </>
                      )}
                    </>
                  ) : (
                    'Please log in to continue.'
                  )}
                </p>
              </div>

              {/* Premium Date Pill */}
              <div className="shrink-0">
                <div className="inline-flex items-center rounded-xl border bg-white px-5 py-2 text-sm font-semibold text-gray-800 shadow-sm">
                  {new Date().toLocaleDateString('en-US', {
                    month: 'short',  // Sept
                    day: 'numeric',  // 28
                    weekday: 'long', // Sunday
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="container mx-auto max-w-6xl px-4 pb-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {actions.map((a, i) => (
            <Link
              key={i}
              href={a.href}
              className={[
                'group rounded-xl border bg-white p-5 shadow-sm transition hover:shadow-md',
                a.primary ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-gray-200',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-900">{a.label}</h3>
                <span
                  className={[
                    'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm',
                    a.primary
                      ? 'bg-indigo-600 text-white group-hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200',
                  ].join(' ')}
                >
                  →
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">{a.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}