// app/api/admin/users/route.ts
import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, service, { auth: { persistSession: false } });

/** Find an auth user by email for older SDKs (no getUserByEmail) */
async function findUserByEmail(email: string): Promise<User | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) return null;
    page += 1;
  }
}

/* ----------------------------- GET: list users ----------------------------- */
export async function GET() {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select(
        [
          'id',
          'auth_user_id',
          'email',
          'name',
          'employee_id',
          'designation',
          'department',
          'role',
          'active',
          'created_at',
        ].join(', ')
      )
      .order('name', { ascending: true, nullsFirst: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ users: data ?? [] });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}

/* ----------------------------- POST: create user ----------------------------- */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      email: string;
      password: string;
      name?: string;
      employee_id?: string | null;
      designation?: string | null;
      department?: string | null;
      role?: 'admin' | 'staff';
      active?: boolean;
    };

    const {
      email,
      password,
      name,
      employee_id,
      designation,
      department,
      role = 'staff',
      active = true,
    } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Create auth user; if already exists, look it up
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, department },
        app_metadata: { role },
      });

    let user = created?.user ?? null;
    if (createErr) {
      const already =
        createErr.message?.toLowerCase().includes('already registered') ||
        createErr.status === 422;
      if (!already) {
        return NextResponse.json({ error: createErr.message }, { status: 400 });
      }
      user = await findUserByEmail(email);
      if (!user) {
        return NextResponse.json(
          { error: 'User exists but could not be fetched' },
          { status: 409 }
        );
      }
    }

    // Upsert profile by auth_user_id to avoid duplicate key error
    const { error: upsertErr } = await admin
      .from('profiles')
      .upsert(
        [
          {
            auth_user_id: user!.id,
            email,
            name: name ?? (user!.user_metadata?.name as string | null) ?? null,
            employee_id: employee_id ?? null,
            designation: designation ?? null,
            department: department ?? null,
            role: role === 'admin' ? 'admin' : 'staff',
            active: !!active,
          },
        ],
        { onConflict: 'auth_user_id' }
      );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: user!.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}