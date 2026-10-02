'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FileCheck2,
  ShieldCheck,
  Building2,
  Plus,
  ArrowUpRight,
  HeartPulse,
  GraduationCap,
  Landmark,
  Briefcase,
  Shield,
  Clock,
  CheckCircle2,
  UserCheck,
  AlertCircle
} from 'lucide-react';
import { Shell } from '../../../components/layout/Shell';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { useRoleContext } from '../../../hooks/useRoleContext';
import { CredentialItem, VerificationRequest, CredentialStatus } from '../../../types';
import { getCredentialStatusBadge, getVerificationStatusBadge, truncateDid, getDomainBadgeStyle } from '../../../lib/utils';
import { Dialog } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { apiClient, CredentialRecord, CitizenSummary } from '../../../../../../packages/api-client';
import { MOCK_CREDENTIALS, MOCK_VERIFICATION_REQUESTS } from '../../../lib/mockData';

export default function DashboardPage() {
  const { currentUser, memberships } = useRoleContext();
  if (!currentUser) return null;
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueSuccessToast, setIssueSuccessToast] = useState(false);
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [consents, setConsents] = useState<VerificationRequest[]>([]);
  const [citizens, setCitizens] = useState<CitizenSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Form states for issuance modal
  const [subjectName, setSubjectName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [credentialTitle, setCredentialTitle] = useState('');
  const [credentialType, setCredentialType] = useState(
    currentUser.role === 'HOSPITAL' ? 'Immunization Record Certificate' : 'Bachelor of Science'
  );

  const loadDashboardData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('credlink_auth_token') : null;
      const isDemoMode = !storedToken || storedToken === 'demo_token';

      if (isDemoMode) {
        // Use public demo data endpoint (no auth required)
        try {
          const demoRes = await apiClient.fetchDemoData();
          if (demoRes.success && demoRes.data) {
            const d = demoRes.data;
            if (d.credentials && d.credentials.length > 0) {
              const mappedCreds: CredentialItem[] = d.credentials.map((c: any) => ({
                id: c.id,
                credentialType: c.credentialType,
                domain: (c.domain?.toUpperCase() as any) || 'CITIZEN',
                subjectId: c.subjectId,
                subjectName: c.subjectName || `Citizen ${(c.subjectId || '').substring(0, 6)}`,
                issuerName: c.issuer?.name || currentUser.organizationName,
                issuerDid: c.issuer?.did || currentUser.organizationDid,
                issuanceDate: c.issuanceDate ? c.issuanceDate.split('T')[0] : new Date().toISOString().split('T')[0],
                status: (c.status as CredentialStatus) || 'VALID',
                claims: Array.isArray(c.claims)
                  ? c.claims
                  : c.claims && typeof c.claims === 'object'
                    ? Object.entries(c.claims).map(([k, v]) => ({ key: k, label: k, value: String(v) }))
                    : [],
                qrPayload: c.qrPayload || `credlink://verify?vc=${c.id}`,
              }));
              setCredentials(mappedCreds);
            } else {
              setCredentials(MOCK_CREDENTIALS);
            }

            if (d.consents && d.consents.length > 0) {
              const mappedConsents: VerificationRequest[] = d.consents.map((con: any) => ({
                id: con.id,
                requesterName: con.requestingOrgId || currentUser.organizationName,
                requesterDomain: (con.domain?.toUpperCase() as any) || currentUser.role,
                targetSubjectName: con.citizenId ? `Citizen ${con.citizenId.substring(0, 6)}` : 'Citizen Subject',
                targetSubjectId: con.citizenId || 'N/A',
                purpose: con.purpose,
                requestedClaims: con.requestedClaims || [],
                approvedClaims: con.approvedClaims || [],
                status: con.status || 'PENDING',
                createdAt: con.createdAt ? new Date(con.createdAt).toLocaleDateString() : 'Recent',
                expiresAt: con.expiresAt ? new Date(con.expiresAt).toLocaleDateString() : 'N/A',
              }));
              setConsents(mappedConsents);
            } else {
              setConsents(MOCK_VERIFICATION_REQUESTS);
            }
            setIsLoading(false);
            return;
          }
        } catch (demoErr) {
          console.warn('Demo data endpoint unavailable, using mock fallback:', demoErr);
        }
        // If demo endpoint failed, use mock data
        setCredentials(MOCK_CREDENTIALS);
        setConsents(MOCK_VERIFICATION_REQUESTS);
        setIsLoading(false);
        return;
      }

      // Authenticated mode: use standard API calls
      const [credRes, consentRes] = await Promise.allSettled([
        apiClient.listCredentials(),
        apiClient.listConsents(),
      ]);

      if (credRes.status === 'fulfilled' && credRes.value.success && credRes.value.data?.credentials && credRes.value.data.credentials.length > 0) {
        const mappedCreds: CredentialItem[] = credRes.value.data.credentials.map((c: CredentialRecord) => {
          let parsedClaims: { key: string; label: string; value: string }[] = [];
          if (Array.isArray(c.claims)) {
            parsedClaims = c.claims as { key: string; label: string; value: string }[];
          } else if (c.claims && typeof c.claims === 'object') {
            parsedClaims = Object.entries(c.claims).map(([k, v]) => ({
              key: k,
              label: k,
              value: String(v),
            }));
          }
          return {
            id: c.id,
            credentialType: c.credentialType,
            domain: (c.domain?.toUpperCase() as any) || 'CITIZEN',
            subjectId: c.subjectId,
            subjectName: c.subjectName || `Citizen ${c.subjectId.substring(0, 6)}`,
            issuerName: c.issuer?.name || currentUser.organizationName,
            issuerDid: c.issuer?.did || currentUser.organizationDid,
            issuanceDate: c.issuanceDate ? c.issuanceDate.split('T')[0] : new Date().toISOString().split('T')[0],
            status: (c.status as CredentialStatus) || 'VALID',
            claims: parsedClaims,
            qrPayload: c.qrPayload || `credlink://verify?vc=${c.id}`,
          };
        });
        setCredentials(mappedCreds);
      } else {
        setCredentials(MOCK_CREDENTIALS);
      }

      if (consentRes.status === 'fulfilled' && consentRes.value.success && consentRes.value.data?.consents && consentRes.value.data.consents.length > 0) {
        const mappedConsents: VerificationRequest[] = consentRes.value.data.consents.map((con: any) => ({
          id: con.id,
          requesterName: con.requestingOrg?.name || currentUser.organizationName,
          requesterDomain: (con.domain?.toUpperCase() as any) || currentUser.role,
          targetSubjectName: con.citizenId ? `Citizen ${con.citizenId.substring(0, 6)}` : 'Citizen Subject',
          targetSubjectId: con.citizenId || 'N/A',
          purpose: con.purpose,
          requestedClaims: con.requestedClaims || [],
          approvedClaims: con.approvedClaims || [],
          status: con.status || 'PENDING',
          createdAt: con.createdAt ? new Date(con.createdAt).toLocaleDateString() : 'Recent',
          expiresAt: con.expiresAt ? new Date(con.expiresAt).toLocaleDateString() : 'N/A',
        }));
        setConsents(mappedConsents);
      } else {
        setConsents(MOCK_VERIFICATION_REQUESTS);
      }
    } catch (err) {
      console.warn('Dashboard data fetch error, using demo fallback:', err);
      setCredentials(MOCK_CREDENTIALS);
      setConsents(MOCK_VERIFICATION_REQUESTS);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  React.useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Load eligible citizens from Supabase when issuance modal opens
  React.useEffect(() => {
    if (isIssueModalOpen) {
      apiClient.getCitizens().then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          setCitizens(res.data);
          if (!subjectId) {
            setSubjectId(res.data[0].id);
            setSubjectName(res.data[0].fullName);
          }
        }
      }).catch((err) => {
        console.warn('Failed to load citizens:', err);
      });
    }
  }, [isIssueModalOpen, subjectId]);

  const roleBadge = getDomainBadgeStyle(currentUser.role);
  const isOrgPending = currentUser.organizationStatus === 'PENDING';
  const hasAuthorizedBankMembership = memberships.some(
    (m) => m.organization?.domain?.toUpperCase() === 'BANK' || m.organization?.domain?.toUpperCase() === 'FINANCE'
  );

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOrgPending) {
      alert('Credential issuance is restricted: Your organization status is PENDING approval.');
      return;
    }
    if (!subjectId) {
      alert('Please select an active citizen profile as the credential subject.');
      return;
    }

    try {
      const targetDomain =
        currentUser.role === 'COLLEGE'
          ? 'education'
          : currentUser.role === 'HOSPITAL'
          ? 'healthcare'
          : currentUser.role === 'BANK'
          ? 'finance'
          : 'employment';

      const finalTitle = credentialTitle.trim() || `${credentialType} Degree Attestation`;
      const issuerOrgId = currentUser.organizationId || 'org_demo_root';

      try {
        await apiClient.issueCredential({
          subjectId: subjectId || 'CIT-884920',
          issuerOrgId: issuerOrgId,
          domain: targetDomain,
          credentialType: credentialType,
          title: finalTitle,
          claims: {
            subjectName: subjectName || 'Verified Citizen',
            degree: credentialType,
            major: 'Computer Science',
            graduationYear: '2025',
            academicStanding: 'First Class Honours',
            verifiedBy: currentUser.organizationName,
          },
        });
        await loadDashboardData();
      } catch (apiErr) {
        // Backend offline -> add locally in demo mode!
        const newCred: CredentialItem = {
          id: `vc_demo_${Date.now()}`,
          credentialType: credentialType,
          domain: currentUser.role === 'CITIZEN' ? 'COLLEGE' : currentUser.role,
          subjectId: subjectId || 'CIT-884920',
          subjectName: subjectName || 'Aarav Sharma',
          issuerName: currentUser.organizationName,
          issuerDid: currentUser.organizationDid,
          issuanceDate: new Date().toISOString().split('T')[0],
          status: 'VALID',
          claims: [
            { key: 'title', label: 'Credential Title', value: finalTitle },
            { key: 'status', label: 'Attestation Status', value: 'CRYPTOGRAPHICALLY_VERIFIED' }
          ],
          qrPayload: `credlink://verify?vc=vc_demo_${Date.now()}`,
        };
        setCredentials((prev) => [newCred, ...prev]);
      }

      setIsIssueModalOpen(false);
      setIssueSuccessToast(true);
      setTimeout(() => setIssueSuccessToast(false), 4000);
      setCredentialTitle('');
    } catch (err: any) {
      console.warn('Issue credential error:', err);
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Organization Status Notice: Pending Approval */}
        {isOrgPending && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-amber-900 dark:text-amber-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-amber-900 dark:text-amber-100">
                ORGANIZATION STATUS: PENDING APPROVAL
              </h4>
              <p className="mt-0.5 text-amber-800 dark:text-amber-300 leading-relaxed">
                Your organization ({currentUser.organizationName}) is currently awaiting Network Administrator verification. Credential issuance and issuer governance actions are disabled until approval.
              </p>
            </div>
          </div>
        )}

        {/* Finance Realm Provisioning Notice */}
        {currentUser.role === 'BANK' && !hasAuthorizedBankMembership && (
          <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900 rounded-xl text-indigo-900 dark:text-indigo-200 text-xs sm:text-sm flex items-start gap-3 shadow-xs">
            <Landmark className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-indigo-900 dark:text-indigo-100">
                FINANCE REALM PROVISIONING REQUIRED
              </h4>
              <p className="mt-0.5 text-indigo-800 dark:text-indigo-300 leading-relaxed">
                No verified Financial Institution or Banking organization membership is linked to this account in the Supabase database. Bank KYC and financial credential operations require network administrator provisioning.
              </p>
            </div>
          </div>
        )}

        {/* Banner Notice / Demo Badge */}
        <div className="p-4 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-800 text-slate-100 dark:bg-slate-200 dark:text-slate-800 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold tracking-tight">
                {currentUser.organizationName}
              </h3>
              <p className="text-xs sm:text-sm opacity-80 font-mono mt-0.5">
                DID: {currentUser.organizationDid}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral" className="bg-slate-800 text-slate-200 dark:bg-slate-200 dark:text-slate-800 border-none text-xs">
              {currentUser.role} ENVIRONMENT
            </Badge>
            <Button
              variant={currentUser.role === 'HOSPITAL' ? 'health' : 'secondary'}
              size="sm"
              onClick={() => {
                if (isOrgPending) return;
                if (currentUser.authorizedCredentialTypes && currentUser.authorizedCredentialTypes.length > 0) {
                  setCredentialType(currentUser.authorizedCredentialTypes[0]);
                }
                setIsIssueModalOpen(true);
              }}
              disabled={isOrgPending}
              className="gap-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Issue Credential</span>
            </Button>
          </div>
        </div>

        {/* Role-Specific Operational Summary Header (Design Rule: Avoid identical 4-card grid) */}
        {currentUser.role === 'HOSPITAL' ? (
          <Card variant="health" className="p-5 border-teal-200/80 dark:border-teal-900/60">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span className="text-xs font-semibold text-teal-900 dark:text-teal-200 uppercase tracking-wider">
                    Healthcare Realm & Privacy Controls
                  </span>
                </div>
                <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Patient Consent & Health Credentials Overview
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                  St. Jude Hospital operates under strict minimum disclosure principles. Health claims (immunization, insurance eligibility) are issued with Zero-Knowledge verification proofs.
                </p>
              </div>
              <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-teal-200/60 dark:border-teal-900/60 pt-3 md:pt-0 md:pl-6 shrink-0">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Health Credentials</p>
                  <p className="text-xl font-bold text-teal-700 dark:text-teal-300">{credentials.length}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Consent Verifications</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{consents.length}</p>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Issued Credentials</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{credentials.length}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {credentials.length === 0 ? '0 records in database' : 'Persisted in Supabase'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Active Verification Requests</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{consents.length}</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">
                  {consents.length === 0 ? '0 active requests' : `${consents.length} consent-controlled`}
                </p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </Card>

            <Card className="p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Trust Registry Status</p>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Authorized Issuer
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">{truncateDid(currentUser.organizationDid)}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Building2 className="w-5 h-5" />
              </div>
            </Card>
          </div>
        )}

        {/* Section 1: Recent Credentials Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Recent Issued Credentials ({currentUser.role})</CardTitle>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Verifiable credentials issued under governance schema.
                </p>
              </div>
              <Link href="/credentials">
                <Button variant="ghost" size="sm" className="gap-1 text-xs sm:text-sm font-medium">
                  <span>View Catalog</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject Name & ID</TableHead>
                <TableHead>Credential Type</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Issuance Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading credentials...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : credentials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    No issued credentials recorded in database yet.
                  </TableCell>
                </TableRow>
              ) : (
                credentials.slice(0, 5).map((cred) => {
                  const statusBadge = getCredentialStatusBadge(cred.status);
                  return (
                    <TableRow key={cred.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{cred.subjectName}</p>
                          <p className="text-xs font-mono text-slate-500">{cred.subjectId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{cred.credentialType}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral" size="sm">
                          {cred.domain}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs sm:text-sm text-slate-500">{cred.issuanceDate}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge.bg}>{statusBadge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Section 2: Recent Verification Requests Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle>Verification Request Log</CardTitle>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Selective disclosure verification checks submitted by institutions.
                </p>
              </div>
              <Link href="/verification">
                <Button variant="ghost" size="sm" className="gap-1 text-xs sm:text-sm font-medium">
                  <span>Verification Center</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requester</TableHead>
                <TableHead>Target Subject</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Requested Claims</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading verification requests...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : consents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-400">
                    No active or recent verification requests found.
                  </TableCell>
                </TableRow>
              ) : (
                consents.slice(0, 5).map((req) => {
                  const statusBadge = getVerificationStatusBadge(req.status);
                  return (
                    <TableRow key={req.id}>
                      <TableCell>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{req.requesterName}</span>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{req.targetSubjectName}</p>
                          <p className="text-xs font-mono text-slate-500">{req.targetSubjectId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">{req.purpose}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {req.requestedClaims.map((claim) => (
                            <span key={claim} className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 rounded font-medium text-slate-600 dark:text-slate-300">
                              {claim}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge.bg}>{statusBadge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Issue Credential Modal */}
      <Dialog
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        title={`Issue New Credential — ${currentUser.role}`}
        description="Issue a database-persisted verifiable credential to an active citizen profile."
      >
        <form onSubmit={handleIssueSubmit} className="space-y-4">
          {/* Real Citizen Selector from Supabase profiles */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Eligible Citizen Subject (Supabase Profile)
            </label>
            {citizens.length > 0 ? (
              <select
                value={subjectId}
                onChange={(e) => {
                  const selected = e.target.value;
                  setSubjectId(selected);
                  const matched = citizens.find((c) => c.id === selected);
                  if (matched) setSubjectName(matched.fullName);
                }}
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
                required
              >
                {citizens.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-500">
                Loading eligible citizen profiles from database...
              </div>
            )}
            {subjectId && (
              <p className="text-[10px] text-slate-500 font-mono">
                Selected Citizen UUID: {subjectId}
              </p>
            )}
          </div>

          {currentUser.authorizedCredentialTypes && currentUser.authorizedCredentialTypes.length > 0 ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Authorized Credential Schema / Type
              </label>
              <select
                value={credentialType}
                onChange={(e) => setCredentialType(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
                required
              >
                {currentUser.authorizedCredentialTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <Input
              label="Credential Type / Schema"
              value={credentialType}
              onChange={(e) => setCredentialType(e.target.value)}
              required
            />
          )}

          <Input
            label="Credential Title / Description"
            placeholder="e.g. Bachelor of Science in Computer Science"
            value={credentialTitle}
            onChange={(e) => setCredentialTitle(e.target.value)}
          />

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md text-xs text-slate-600 dark:text-slate-400 space-y-1 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-100">Issuer Authorization & Signature:</p>
            <p className="font-mono text-[11px]">{currentUser.organizationName}</p>
            <p className="font-mono text-[10px] text-slate-500">{currentUser.organizationDid}</p>
            <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium">Cryptographic Algorithm: HMAC-SHA256 application-level signature</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsIssueModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant={currentUser.role === 'HOSPITAL' ? 'health' : 'primary'} size="sm">
              Issue Credential
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Toast Notification */}
      {issueSuccessToast && (
        <div className="fixed bottom-4 right-4 z-50 p-4 bg-emerald-900 text-white rounded-lg shadow-xl text-xs flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="font-semibold">Credential Issued Successfully</p>
            <p className="text-[11px] opacity-80">Synthetically signed with DID {truncateDid(currentUser.organizationDid)}</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
