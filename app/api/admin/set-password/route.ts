// app/api/admin/set-password/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerUser } from '@/lib/getServerUser';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || '').trim();
    const newPassword = String(body?.newPassword || '').trim();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'userId and newPassword required' }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    // must be logged in
    const { supabase, user } = await getServerUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // must be admin
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!prof || prof.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    // force-set password using service role
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}