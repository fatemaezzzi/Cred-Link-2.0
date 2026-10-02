import { Organization, CredentialItem, VerificationRequest, AuditLogItem, CurrentUser } from '../types';

export const INITIAL_USER: CurrentUser = {
  id: 'usr_01',
  name: 'Bhumi Patel',
  email: 'admin@credlink.network',
  role: 'ADMIN',
  organizationName: 'CredLink Governance Network',
  organizationDid: 'did:credlink:gov:root:0x9f81a7'
};

export const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: 'org_edu_01',
    name: 'National Institute of Technology',
    code: 'NIT-EDU',
    domain: 'COLLEGE',
    did: 'did:credlink:edu:nit:0x87a1c4',
    status: 'ACTIVE',
    authorizedCredentialTypes: ['Bachelor Degree', 'Academic Transcript', 'Student ID Enrollment'],
    issuedCount: 1420,
    verifiedCount: 3890,
    createdAt: '2025-01-15'
  },
  {
    id: 'org_bank_01',
    name: 'Apex Imperial Bank',
    code: 'AIB-FIN',
    domain: 'BANK',
    did: 'did:credlink:bank:apex:0x992b11',
    status: 'ACTIVE',
    authorizedCredentialTypes: ['Income Verification', 'Credit Standing Attestation', 'KYC Compliance'],
    issuedCount: 890,
    verifiedCount: 5120,
    createdAt: '2025-02-01'
  },
  {
    id: 'org_hosp_01',
    name: 'St. Jude General Hospital & Research Center',
    code: 'SJH-HEALTH',
    domain: 'HOSPITAL',
    did: 'did:credlink:health:stjude:0x44ab09',
    status: 'ACTIVE',
    authorizedCredentialTypes: ['Immunization Record', 'Health Insurance Eligibility', 'Medical Attestation'],
    issuedCount: 2310,
    verifiedCount: 1940,
    createdAt: '2025-01-20'
  },
  {
    id: 'org_emp_01',
    name: 'Global Tech Innovations Corp',
    code: 'GTI-EMP',
    domain: 'EMPLOYER',
    did: 'did:credlink:emp:gti:0x11ce88',
    status: 'ACTIVE',
    authorizedCredentialTypes: ['Employment Verification', 'Role & Seniority Certificate', 'Clearance Certificate'],
    issuedCount: 640,
    verifiedCount: 1280,
    createdAt: '2025-02-10'
  },
  {
    id: 'org_admin_01',
    name: 'CredLink Root Authority',
    code: 'CRD-ROOT',
    domain: 'ADMIN',
    did: 'did:credlink:gov:root:0x9f81a7',
    status: 'ACTIVE',
    authorizedCredentialTypes: ['Network Membership', 'Issuer Authorization', 'Trust Policy'],
    issuedCount: 45,
    verifiedCount: 12450,
    createdAt: '2025-01-01'
  }
];

export const MOCK_CREDENTIALS: CredentialItem[] = [
  // Healthcare Credentials (Core Domain)
  {
    id: 'vc_hosp_101',
    credentialType: 'Immunization Certificate',
    domain: 'HOSPITAL',
    subjectId: 'CIT-884920',
    subjectName: 'Aarav Sharma',
    issuerName: 'St. Jude General Hospital',
    issuerDid: 'did:credlink:health:stjude:0x44ab09',
    issuanceDate: '2026-01-10',
    expirationDate: '2028-01-10',
    status: 'VALID',
    consentGranted: true,
    claims: [
      { key: 'vaccineType', label: 'Vaccine Type', value: 'Hepatitis B Booster & MMR' },
      { key: 'doseBatch', label: 'Batch ID', value: 'HBV-2026-09A' },
      { key: 'issuingClinician', label: 'Authorized Clinician', value: 'Dr. Sarah Jenkins, MD' },
      { key: 'immunityStatus', label: 'Immunity Attestation', value: 'VERIFIED_ACTIVE', sensitive: true }
    ],
    qrPayload: 'credlink://verify?vc=vc_hosp_101&issuer=did:credlink:health:stjude:0x44ab09&sig=demo_sig_991'
  },
  {
    id: 'vc_hosp_102',
    credentialType: 'Health Insurance Eligibility',
    domain: 'HOSPITAL',
    subjectId: 'CIT-771239',
    subjectName: 'Elena Rostova',
    issuerName: 'St. Jude General Hospital',
    issuerDid: 'did:credlink:health:stjude:0x44ab09',
    issuanceDate: '2025-11-04',
    expirationDate: '2026-11-04',
    status: 'VALID',
    consentGranted: true,
    claims: [
      { key: 'policyTier', label: 'Coverage Tier', value: 'Comprehensive Premium Care' },
      { key: 'coverageStatus', label: 'Active Coverage', value: 'ACTIVE_CONFIRMED' },
      { key: 'emergencyContactCode', label: 'Emergency Provider Code', value: 'EMG-9021-X' }
    ],
    qrPayload: 'credlink://verify?vc=vc_hosp_102&issuer=did:credlink:health:stjude:0x44ab09&sig=demo_sig_992'
  },
  // Education Credentials
  {
    id: 'vc_edu_201',
    credentialType: 'Bachelor of Science (Computer Engineering)',
    domain: 'COLLEGE',
    subjectId: 'STU-2022-881',
    subjectName: 'Aarav Sharma',
    issuerName: 'National Institute of Technology',
    issuerDid: 'did:credlink:edu:nit:0x87a1c4',
    issuanceDate: '2025-06-20',
    status: 'VALID',
    claims: [
      { key: 'degree', label: 'Degree Name', value: 'Bachelor of Science in Computer Engineering' },
      { key: 'gpa', label: 'Cumulative GPA', value: '3.92 / 4.00' },
      { key: 'graduationYear', label: 'Graduation Year', value: '2025' },
      { key: 'honors', label: 'Academic Honors', value: 'Magna Cum Laude' }
    ],
    qrPayload: 'credlink://verify?vc=vc_edu_201&issuer=did:credlink:edu:nit:0x87a1c4&sig=demo_sig_201'
  },
  {
    id: 'vc_edu_202',
    credentialType: 'Academic Transcript Attestation',
    domain: 'COLLEGE',
    subjectId: 'STU-2023-104',
    subjectName: 'Michael Chen',
    issuerName: 'National Institute of Technology',
    issuerDid: 'did:credlink:edu:nit:0x87a1c4',
    issuanceDate: '2025-09-15',
    status: 'VALID',
    claims: [
      { key: 'creditsCompleted', label: 'Credits Completed', value: '128 ECTS' },
      { key: 'major', label: 'Major', value: 'Data Science & Systems' },
      { key: 'transcriptHash', label: 'Transcript Digest', value: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
    ],
    qrPayload: 'credlink://verify?vc=vc_edu_202&issuer=did:credlink:edu:nit:0x87a1c4&sig=demo_sig_202'
  },
  // Banking Credentials
  {
    id: 'vc_bank_301',
    credentialType: 'KYC & Identity Attestation',
    domain: 'BANK',
    subjectId: 'CIT-884920',
    subjectName: 'Aarav Sharma',
    issuerName: 'Apex Imperial Bank',
    issuerDid: 'did:credlink:bank:apex:0x992b11',
    issuanceDate: '2025-10-01',
    expirationDate: '2027-10-01',
    status: 'VALID',
    claims: [
      { key: 'kycLevel', label: 'KYC Verification Tier', value: 'Level 3 Enhanced Identity' },
      { key: 'residenceVerified', label: 'Address Verified', value: 'TRUE' },
      { key: 'riskCategory', label: 'AML Risk Score', value: 'LOW_RISK_TIER_1' }
    ],
    qrPayload: 'credlink://verify?vc=vc_bank_301&issuer=did:credlink:bank:apex:0x992b11&sig=demo_sig_301'
  },
  // Employer Credentials
  {
    id: 'vc_emp_401',
    credentialType: 'Employment Verification',
    domain: 'EMPLOYER',
    subjectId: 'EMP-9022',
    subjectName: 'Aarav Sharma',
    issuerName: 'Global Tech Innovations Corp',
    issuerDid: 'did:credlink:emp:gti:0x11ce88',
    issuanceDate: '2025-12-01',
    status: 'VALID',
    claims: [
      { key: 'jobTitle', label: 'Current Role', value: 'Senior Software Architect' },
      { key: 'department', label: 'Department', value: 'Cloud Infrastructure' },
      { key: 'employmentType', label: 'Status', value: 'FULL_TIME_PERMANENT' },
      { key: 'startDate', label: 'Start Date', value: '2023-07-01' }
    ],
    qrPayload: 'credlink://verify?vc=vc_emp_401&issuer=did:credlink:emp:gti:0x11ce88&sig=demo_sig_401'
  }
];

export const MOCK_VERIFICATION_REQUESTS: VerificationRequest[] = [
  {
    id: 'vr_req_801',
    requesterName: 'Apex Imperial Bank',
    requesterDomain: 'BANK',
    targetSubjectName: 'Aarav Sharma',
    targetSubjectId: 'CIT-884920',
    purpose: 'Mortgage Loan Application Verification',
    requestedClaims: ['Degree Name', 'Graduation Year', 'Current Role', 'Employment Status'],
    approvedClaims: ['Degree Name', 'Graduation Year', 'Current Role', 'Employment Status'],
    status: 'APPROVED',
    createdAt: '2026-02-10 10:30',
    expiresAt: '2026-03-10',
    verificationResult: {
      verified: true,
      timestamp: '2026-02-10 10:32:14',
      proofType: 'Ed25519Signature2020 (Zero-Knowledge Selective Disclosure)'
    }
  },
  {
    id: 'vr_req_802',
    requesterName: 'St. Jude General Hospital',
    requesterDomain: 'HOSPITAL',
    targetSubjectName: 'Elena Rostova',
    targetSubjectId: 'CIT-771239',
    purpose: 'Inpatient Health Insurance Coverage Verification',
    requestedClaims: ['Coverage Tier', 'Active Coverage'],
    approvedClaims: ['Coverage Tier', 'Active Coverage'],
    status: 'APPROVED',
    createdAt: '2026-02-12 14:15',
    expiresAt: '2026-03-12',
    verificationResult: {
      verified: true,
      timestamp: '2026-02-12 14:16:02',
      proofType: 'JsonWebSignature2020'
    }
  },
  {
    id: 'vr_req_803',
    requesterName: 'Global Tech Innovations Corp',
    requesterDomain: 'EMPLOYER',
    targetSubjectName: 'Michael Chen',
    targetSubjectId: 'STU-2023-104',
    purpose: 'Background Check for Staff Engineer Position',
    requestedClaims: ['Degree Name', 'GPA', 'Transcript Digest'],
    approvedClaims: ['Degree Name'],
    status: 'APPROVED',
    createdAt: '2026-02-14 09:00',
    expiresAt: '2026-03-14',
    verificationResult: {
      verified: true,
      timestamp: '2026-02-14 09:05:44',
      proofType: 'Ed25519Signature2020'
    }
  },
  {
    id: 'vr_req_804',
    requesterName: 'Apex Imperial Bank',
    requesterDomain: 'BANK',
    targetSubjectName: 'Sarah Connor',
    targetSubjectId: 'CIT-990112',
    purpose: 'Personal Line of Credit Assessment',
    requestedClaims: ['Cumulative Income Attestation', 'Tax Clearance'],
    approvedClaims: [],
    status: 'PENDING',
    createdAt: '2026-02-15 16:45',
    expiresAt: '2026-03-15'
  }
];

export const MOCK_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'aud_1001',
    timestamp: '2026-02-15 16:45:10',
    eventType: 'VERIFICATION_REQUESTED',
    organization: 'Apex Imperial Bank',
    domain: 'BANK',
    action: 'Initiated verification request for CIT-990112',
    actor: 'Officer J. Vance (ID: VNC-92)',
    outcome: 'PENDING',
    details: 'Requested income attestation and tax clearance claims.'
  },
  {
    id: 'aud_1002',
    timestamp: '2026-02-14 09:05:44',
    eventType: 'VERIFICATION_APPROVED',
    organization: 'Global Tech Innovations Corp',
    domain: 'EMPLOYER',
    action: 'Verified degree credential for Michael Chen',
    actor: 'Citizen Consent Gateway (Citizen Controlled)',
    outcome: 'SUCCESS',
    details: 'Citizen consented to disclose degree name claim only. GPA was selectively withheld.'
  },
  {
    id: 'aud_1003',
    timestamp: '2026-02-12 14:16:02',
    eventType: 'CONSENT_GRANTED',
    organization: 'St. Jude General Hospital',
    domain: 'HOSPITAL',
    action: 'Verified insurance eligibility for Elena Rostova',
    actor: 'Patient Consent Token #PCT-991',
    outcome: 'SUCCESS',
    details: 'Hospital verified active coverage without accessing full private health diagnosis.'
  },
  {
    id: 'aud_1004',
    timestamp: '2026-01-10 11:20:00',
    eventType: 'CREDENTIAL_ISSUED',
    organization: 'St. Jude General Hospital',
    domain: 'HOSPITAL',
    action: 'Issued Immunization Certificate to Aarav Sharma',
    actor: 'Dr. Sarah Jenkins, MD',
    outcome: 'SUCCESS',
    details: 'Cryptographic proof issued to citizen wallet with DID did:credlink:health:stjude:0x44ab09.'
  },
  {
    id: 'aud_1005',
    timestamp: '2025-06-20 10:00:00',
    eventType: 'ORGANIZATION_STATUS_CHANGED',
    organization: 'CredLink Governance Network',
    domain: 'ADMIN',
    action: 'Approved Trust Registry status for St. Jude General Hospital',
    actor: 'Root Administrator (Bhumi Patel)',
    outcome: 'SUCCESS',
    details: 'Authorized hospital domain for Immunization and Healthcare Eligibility credential schemas.'
  }
];

export const MOCK_MEMBERSHIPS: any[] = MOCK_ORGANIZATIONS.map((org) => ({
  id: `mem_${org.id}`,
  organization_id: org.id,
  user_id: 'usr_01',
  member_role: org.domain === 'ADMIN' ? 'ADMIN' : 'ISSUER',
  status: 'ACTIVE',
  created_at: org.createdAt,
  organization: {
    id: org.id,
    name: org.name,
    code: org.code,
    domain: org.domain,
    did: org.did,
    verification_status: 'APPROVED',
    is_issuer: true,
    authorized_credential_types: org.authorizedCredentialTypes,
  },
}));