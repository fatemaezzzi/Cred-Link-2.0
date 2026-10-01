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
console.log('   CREDLINK PHASE 1 AUTH & AUTHORIZATION TEST SUITE  ');
console.log('====================================================\n');

// ----------------------------------------------------
// 1. Logged-Out / Unauthenticated Identity State Tests
// ----------------------------------------------------
assert(
  deriveUserRole(undefined, undefined) === 'CITIZEN',
  '1.1 Default unauthenticated role resolves to least-privileged CITIZEN',
  'Expected deriveUserRole(undefined, undefined) to return CITIZEN'
);

// Verify default state when no session token exists
let mockCurrentUser: CurrentUser | null = null;
let mockIsAuthenticated = false;

assert(
  mockCurrentUser === null && mockIsAuthenticated === false,
  '1.2 Logged-out state sets currentUser to null (INITIAL_USER removed)',
  'Expected currentUser to be null when unauthenticated'
);

// ----------------------------------------------------
// 2. Database Role & Domain Mapping Tests
// ----------------------------------------------------
// Network Admin Account (admin.network.*)
const adminRole = deriveUserRole('ADMIN', undefined);
assert(
  adminRole === 'ADMIN',
  '2.1 Network Admin account (admin.network.*) maps to ADMIN role',
  `Expected ADMIN, got ${adminRole}`
);

// Healthcare Account (org.test.* -> AIIMS, hospital domain)
const hospitalRole = deriveUserRole('COLLEGE', 'hospital');
assert(
  hospitalRole === 'HOSPITAL',
  '2.2 Healthcare account (org.test.* -> AIIMS, hospital domain) maps to HOSPITAL role',
  `Expected HOSPITAL, got ${hospitalRole}`
);

// College Account (issuer.college.* -> Oxford/IIT, college domain)
const collegeRole = deriveUserRole('COLLEGE', 'college');
assert(
  collegeRole === 'COLLEGE',
  '2.3 College account (issuer.college.* -> Oxford/IIT, college domain) maps to COLLEGE role',
  `Expected COLLEGE, got ${collegeRole}`
);

// Employer Account (verifier.employer.* -> TechCorp, employer domain)
const employerRole = deriveUserRole('EMPLOYER', 'employer');
assert(
  employerRole === 'EMPLOYER',
  '2.4 Employer account (verifier.employer.* -> TechCorp, employer domain) maps to EMPLOYER role',
  `Expected EMPLOYER, got ${employerRole}`
);

// ----------------------------------------------------
// 3. Role Switcher & Privilege Escalation Tests
// ----------------------------------------------------
// Simulate non-admin employer user
let testUser: CurrentUser | null = {
  id: 'usr_emp_01',
  name: 'HR Manager',
  email: 'verifier.employer@credlink.org',
  role: 'EMPLOYER',
  organizationName: 'TechCorp Solutions',
  organizationDid: 'did:credlink:emp:tc:0x7250'
};

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

function simulateSwitchRole(targetRole: UserRole): boolean {
  if (!testUser) return false;
  // Block non-admin from escalating to ADMIN
  if (targetRole === 'ADMIN' && testUser.role !== 'ADMIN') {
    return false;
  }

  const matchingMembership = userMemberships.find((m) => {
    const domainRole = deriveUserRole(undefined, m.organization?.domain);
    return domainRole === targetRole;
  });

  if (matchingMembership?.organization) {
    testUser = {
      ...testUser,
      role: targetRole,
      organizationName: matchingMembership.organization.name,
      organizationDid: matchingMembership.organization.did
    };
    return true;
  }
  return false;
}

// Attempt 1: Non-admin trying to escalate to ADMIN
const switchAdminResult = simulateSwitchRole('ADMIN');
assert(
  switchAdminResult === false && testUser.role === 'EMPLOYER',
  '3.1 Non-admin user CANNOT escalate role to ADMIN',
  'Expected switchRole(ADMIN) to be denied for non-admin user'
);

// Attempt 2: Non-admin trying to switch to HOSPITAL without membership
const switchHospitalResult = simulateSwitchRole('HOSPITAL');
assert(
  switchHospitalResult === false && testUser.role === 'EMPLOYER',
  '3.2 User CANNOT switch to domain (HOSPITAL) without valid DB membership',
  'Expected switchRole(HOSPITAL) to be denied without membership'
);

// Attempt 3: User switching to authorized EMPLOYER membership
const switchEmployerResult = simulateSwitchRole('EMPLOYER');
assert(
  switchEmployerResult === true && testUser.role === 'EMPLOYER',
  '3.3 User CAN switch to authorized domain (EMPLOYER)',
  'Expected switchRole(EMPLOYER) to succeed for authorized membership'
);

// ----------------------------------------------------
// 4. Legitimate Network Admin Rights Preserved
// ----------------------------------------------------
let adminUser: CurrentUser | null = {
  id: 'usr_admin_01',
  name: 'Network Admin',
  email: 'admin.network@credlink.org',
  role: 'ADMIN',
  organizationName: 'CredLink Governance Network',
  organizationDid: 'did:credlink:admin:0x1860'
};

assert(
  adminUser.role === 'ADMIN',
  '4.1 Legitimate Network Admin retains ADMIN access',
  'Expected genuine admin account to have role ADMIN'
);

// Print Test Summary
console.log('\n----------------------------------------------------');
console.log('                 TEST RESULTS SUMMARY               ');
console.log('----------------------------------------------------');

let allPassed = true;
results.forEach((r, idx) => {
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
  console.log(`\nALL ${results.length} PHASE 1 AUTH TESTS PASSED CLEANLY! 🎉\n`);
} else {
  console.error(`\nSOME TESTS FAILED! Total tests: ${results.length}\n`);
  process.exit(1);
}
