import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../src/config/supabase';

async function backupDatabase() {
  console.log('=== STARTING SAFE DATABASE BACKUP ===\n');

  const backupDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupData: Record<string, any> = {
    timestamp: new Date().toISOString(),
    tables: {},
  };

  // 1. Auth Users
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('Failed to backup auth users:', authError);
  } else {
    backupData.tables['auth.users'] = (authData.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      email_confirmed_at: u.email_confirmed_at,
      user_metadata: u.user_metadata,
    }));
    console.log(`Backed up ${authData.users.length} Auth Users`);
  }

  // List of public tables
  const tables = [
    'profiles',
    'organizations',
    'organization_members',
    'credentials',
    'consents',
    'trust_registry',
    'audit_logs',
  ];

  for (const table of tables) {
    const { data, error } = await supabaseAdmin.from(table).select('*');
    if (error) {
      console.error(`Failed to backup ${table}:`, error);
    } else {
      backupData.tables[table] = data || [];
      console.log(`Backed up ${(data || []).length} rows from public.${table}`);
    }
  }

  const backupFilePath = path.join(backupDir, 'db_backup.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\nBackup successfully written to: ${backupFilePath}`);
  process.exit(0);
}

backupDatabase().catch((err) => {
  console.error('Backup error:', err);
  process.exit(1);
});
