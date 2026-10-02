export type UserRole = 'COLLEGE' | 'BANK' | 'HOSPITAL' | 'EMPLOYER' | 'ADMIN' | 'CITIZEN';

export type CredentialStatus = 'VALID' | 'REVOKED' | 'EXPIRED';
export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'DENIED';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED' | 'EXPIRED';

export interface Organization {
  id: string;
  name: string;
  code: string;
  domain: UserRole;
  did: string;
  status: OrgStatus;
  authorizedCredentialTypes: string[];
  issuedCount: number;
  verifiedCount: number;
  createdAt: string;
}

export interface CredentialClaim {
  key: string;
  label: string;
  value: string;
  sensitive?: boolean;
}

export interface CredentialItem {
  id: string;
  credentialType: string;
  domain: UserRole;
  subjectId: string;
  subjectName: string;
  issuerName: string;
  issuerDid: string;
  issuanceDate: string;
  expirationDate?: string;
  status: CredentialStatus;
  claims: CredentialClaim[];
  qrPayload: string;
  consentGranted?: boolean;
}

export interface VerificationRequest {
  id: string;
  requesterName: string;
  requesterDomain: UserRole;
  targetSubjectName: string;
  targetSubjectId: string;
  purpose: string;
  requestedClaims: string[];
  approvedClaims: string[];
  status: VerificationStatus;
  createdAt: string;
  expiresAt: string;
  credentialId?: string;
  credentialTitle?: string;
  credentialStatus?: string;
  verificationResult?: {
    verified: boolean;
    timestamp: string;
    proofType: string;
  };
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  eventType: string;
  organization: string;
  domain: UserRole;
  action: string;
  actor: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'PENDING' | string;
  details: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationName: string;
  organizationDid: string;
  organizationId?: string;
  organizationCode?: string;
  organizationDomain?: string;
  organizationStatus?: OrgStatus;
  isIssuer?: boolean;
  authorizedCredentialTypes?: string[];
}
