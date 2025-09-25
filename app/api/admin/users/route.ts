// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getServerUser } from '@/lib/getServerUser';

function assertAdmin(role: string | null | undefined) {
  if (role !== 'admin') throw new Error('Admin only');
}

export async function GET() {
  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: me, error: meErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  try { assertAdmin(me?.role); } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  // list profiles (active + inactive)
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, auth_user_id, email, name, department, designation, role, employee_id, is_active')
    .order('name', { ascending: true, nullsFirst: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { email, password, name, employee_id, department, designation, role = 'staff' } = body || {};
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const { supabase, user } = await getServerUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { data: me, error: meErr } = await supabase
    .from('profiles').select('role').eq('auth_user_id', user.id).single();
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 });
  try { assertAdmin(me?.role); } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  // 1) create auth user
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {},
  });
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message || 'Failed to create auth user' }, { status: 400 });
  }
  const authId = created.user.id;

  // 2) insert profile
  const { error: insErr } = await supabaseAdmin.from('profiles').insert({
    auth_user_id: authId,
    email,
    name: name ?? null,
    employee_id: employee_id ?? null,
    department: department ?? null,
    designation: designation ?? null,
    role,
    is_active: true,
  });
  if (insErr) {
    // rollback auth user if profile insert fails
    await supabaseAdmin.auth.admin.deleteUser(authId);
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}