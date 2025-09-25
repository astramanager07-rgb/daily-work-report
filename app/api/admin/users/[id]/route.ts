// app/api/admin/users/[id]/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerUser } from '@/lib/getServerUser';

function assertAdmin(role: string | null | undefined) {
  if (role !== 'admin') throw new Error('Admin only');
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const profileId = params.id;
  const body = await req.json();
  const {
    email,
    name,
    employee_id,
    department,
    designation,
    role,           // optional; leave as-is if not sent
    is_active,      // boolean
    newPassword,    // optional
  } = body || {};

  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  try { assertAdmin(me?.role); } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  // find target profile (to get auth_user_id)
  const { data: target, error: tErr } = await supabaseAdmin
    .from('profiles')
    .select('auth_user_id')
    .eq('id', profileId)
    .single();
  if (tErr || !target) return NextResponse.json({ error: tErr?.message || 'User not found' }, { status: 404 });

  const updates: any = {
    email: email ?? undefined,
    name: name ?? undefined,
    employee_id: employee_id ?? undefined,
    department: department ?? undefined,
    designation: designation ?? undefined,
    is_active: typeof is_active === 'boolean' ? is_active : undefined,
  };
  if (role) updates.role = role;

  // 1) update profile
  const { error: upErr } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', profileId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 2) optional: update auth email / password
  if (email || newPassword) {
    const payload: any = {};
    if (email) payload.email = email;
    if (newPassword) payload.password = newPassword;

    const { error: authErr } =
      await supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, payload);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}