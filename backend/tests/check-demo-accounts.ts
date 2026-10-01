import { supabaseAdmin } from '../src/config/supabase';

async function checkDatabaseState() {
  console.log('=== CREDLINK READ-ONLY ACCOUNT & ORGANIZATION AUDIT ===\n');

  try {
    // 1. Check Supabase Auth Users
    console.log('--- 1. Supabase Auth Users (auth.users) ---');
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      console.error('Failed to list auth users:', authError.message);
    } else {
      console.log(`Total Auth Users: ${authData.users.length}`);
      authData.users.forEach((u) => {
        console.log(`- ID: ${u.id} | Email: ${u.email} | Confirmed: ${u.email_confirmed_at ? 'YES' : 'NO'} | Metadata:`, u.user_metadata);
      });
    }

    // 2. Check Profiles table (public.profiles)
    console.log('\n--- 2. Public Profiles (public.profiles) ---');
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*');
    if (profileError) {
      console.error('Failed to list profiles:', profileError.message);
    } else {
      console.log(`Total Profiles: ${profiles?.length || 0}`);
      (profiles || []).forEach((p) => {
        console.log(`- ID: ${p.id} | Name: ${p.full_name} | Email: ${p.email} | Role: ${p.role} | Status: ${p.account_status}`);
      });
    }

    // 3. Check Organizations table (public.organizations)
    console.log('\n--- 3. Public Organizations (public.organizations) ---');
    const { data: orgs, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('*');
    if (orgError) {
      console.error('Failed to list organizations:', orgError.message);
    } else {
      console.log(`Total Organizations: ${orgs?.length || 0}`);
      (orgs || []).forEach((o) => {
        console.log(`- ID: ${o.id} | Code: ${o.code} | Domain: ${o.domain} | Name: ${o.name} | Status: ${o.verification_status} | Issuer: ${o.is_issuer}`);
      });
    }

    // 4. Check Organization Members table (public.organization_members)
    console.log('\n--- 4. Organization Memberships (public.organization_members) ---');
    const { data: members, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id, user_id, member_role, status, organization:organizations(code, name, domain), profile:profiles(email, full_name, role)');
    if (memberError) {
      console.error('Failed to list memberships:', memberError.message);
    } else {
      console.log(`Total Memberships: ${members?.length || 0}`);
      (members || []).forEach((m: any) => {
        const orgName = m.organization ? `${m.organization.name} (${m.organization.code})` : m.organization_id;
        const userEmail = m.profile ? m.profile.email : m.user_id;
        console.log(`- ID: ${m.id} | User: ${userEmail} | Org: ${orgName} | Member Role: ${m.member_role} | Status: ${m.status}`);
      });
    }

  } catch (err: any) {
    console.error('Audit script failed:', err.message);
  } finally {
    process.exit(0);
  }
}

checkDatabaseState();
