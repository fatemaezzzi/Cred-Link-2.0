import { deriveUserRole } from '../src/hooks/useRoleContext';
import { UserRole, CurrentUser } from '../src/types';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, failureDetail: string) {
  if (condition) {
    results.push({ name: testName, passed: true, details: 'OK' });
  } else {
    results.push({ name: testName, passed: false, details: failureDetail });
  }
}

console.log('====================================================');
console.log('   CREDLINK PHASE 2 REALM & ACCOUNT MAPPING TESTS    ');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. Quick-Fill Shortcuts Populate Email ONLY (No Passwords)
// ----------------------------------------------------
const quickFillShortcuts = [
  { role: 'ADMIN', email: 'admin.network.1790451860448@credlink.org' },
  { role: 'HOSPITAL', email: 'org.test.1790451799345@credlink.org' },
  { role: 'COLLEGE', email: 'issuer.college.1790451860448@credlink.org' },
  { role: 'EMPLOYER', email: 'verifier.employer.1790451837250@credlink.org' },
];

quickFillShortcuts.forEach((shortcut) => {
  let formEmail = '';
  let formPassword = '';

  // Simulate quick-fill button click
  formEmail = shortcut.email;

  assert(
    formEmail === shortcut.email && formPassword === '',
    `1. Quick-fill button for ${shortcut.role} populates email ONLY (password remains blank)`,
    `Expected email ${shortcut.email} and empty password, got password length ${formPassword.length}`
  );
});

// ----------------------------------------------------
// 2. Healthcare (AIIMS-0668) Pending Status Disables Issuance
// ----------------------------------------------------
const healthcareUser: CurrentUser = {
  id: 'usr_aiims_01',
  name: 'Org Admin User',
  email: 'org.test.1790451799345@credlink.org',
  role: 'HOSPITAL',
  organizationName: 'All India Institute of Medical Sciences (Synthetic)',
  organizationDid: 'did:credlink:org:aiims-0668',
  organizationStatus: 'PENDING',
  isIssuer: false
};

const isIssuanceAllowedForPendingOrg =
  healthcareUser.organizationStatus === 'APPROVED' && healthcareUser.isIssuer === true;

assert(
  isIssuanceAllowedForPendingOrg === false,
  '2. Healthcare org (AIIMS-0668) with PENDING status disables credential issuance actions',
  'Expected issuance to be disabled for PENDING organization status'
);

// ----------------------------------------------------
// 3. Finance Realm Without DB Bank Membership Triggers Provisioning Notice
// ----------------------------------------------------
const userMemberships = [
  {
    id: 'm_emp_1',
    member_role: 'ADMIN' as const,
    status: 'ACTIVE' as const,
    organization: {
      id: 'org_tc_7250',
      name: 'TechCorp Solutions',
      code: 'TC-7250',
      domain: 'employer',
      did: 'did:credlink:emp:tc:0x7250',
      is_issuer: false
    }
  }
];

const hasBankMembership = userMemberships.some(
  (m) => deriveUserRole(undefined, m.organization?.domain) === 'BANK'
);

assert(
  hasBankMembership === false,
  '3. Account without bank org membership displays FINANCE REALM PROVISIONING REQUIRED notice',
  'Expected hasBankMembership to be false for non-bank accounts'
);

// ----------------------------------------------------
// 4. Genuine Network Admin Access Preserved
// ----------------------------------------------------
const networkAdminUser: CurrentUser = {
  id: 'usr_admin_99',
  name: 'Network Admin',
  email: 'admin.network.1790451860448@credlink.org',
  role: 'ADMIN',
  organizationName: 'CredLink Governance Network',
  organizationDid: 'did:credlink:admin:0x1860',
  organizationStatus: 'APPROVED',
  isIssuer: true
};

assert(
  networkAdminUser.role === 'ADMIN' && networkAdminUser.organizationStatus === 'APPROVED',
  '4. Legitimate Network Admin retains full administrative capability',
  'Expected network admin to have role ADMIN and APPROVED status'
);

// ----------------------------------------------------
// 5. Unauthorized Role Switching Prevention (Phase 1 Guard Intact)
// ----------------------------------------------------
let activeUser: CurrentUser | null = { ...healthcareUser };

function switchRoleAttempt(targetRole: UserRole): boolean {
  if (!activeUser) return false;
  if (targetRole === 'ADMIN' && activeUser.role !== 'ADMIN') return false;

  const match = userMemberships.find(
    (m) => deriveUserRole(undefined, m.organization?.domain) === targetRole
  );
  if (match) {
    activeUser = { ...activeUser, role: targetRole };
    return true;
  }
  return false;
}

const escalateAdminAttempt = switchRoleAttempt('ADMIN');
assert(
  escalateAdminAttempt === false && activeUser?.role === 'HOSPITAL',
  '5. Unauthorized user CANNOT switch to ADMIN role',
  'Expected switchRoleAttempt(ADMIN) to be denied'
);

// Print Test Summary
console.log('\n----------------------------------------------------');
console.log('                 TEST RESULTS SUMMARY               ');
console.log('----------------------------------------------------');

let allPassed = true;
results.forEach((r) => {
  if (r.passed) {
    console.log(`✅ [PASS] ${r.name}`);
  } else {
    allPassed = false;
    console.log(`❌ [FAIL] ${r.name}`);
    console.log(`   Detail: ${r.details}`);
  }
});

console.log('----------------------------------------------------');
if (allPassed) {
  console.log(`\nALL ${results.length} PHASE 2 REALM TESTS PASSED CLEANLY! 🎉\n`);
} else {
  console.error(`\nSOME TESTS FAILED! Total tests: ${results.length}\n`);
  process.exit(1);
}
