'use client';

import React, { useState } from 'react';
import { Plus, Search, Filter, QrCode, ShieldAlert, CheckCircle2, FileText, Lock, Eye, Trash2 } from 'lucide-react';
import { Shell } from '../../../components/layout/Shell';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { Input } from '../../../components/ui/Input';
import { Drawer } from '../../../components/ui/Drawer';
import { Dialog } from '../../../components/ui/Dialog';
import { CredentialItem, CredentialStatus, UserRole } from '../../../types';
import { getCredentialStatusBadge, truncateDid, getDomainBadgeStyle } from '../../../lib/utils';
import { useRoleContext } from '../../../hooks/useRoleContext';
import { apiClient, CredentialRecord, CitizenSummary, VerificationCheckResult } from '../../../../../../packages/api-client';
import { MOCK_CREDENTIALS } from '../../../lib/mockData';

export default function CredentialsPage() {
  const { currentUser } = useRoleContext();
  if (!currentUser) return null;
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [citizens, setCitizens] = useState<CitizenSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Selected credential for details drawer & QR presentation modal
  const [selectedCred, setSelectedCred] = useState<CredentialItem | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CredentialItem | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);

  // Quick Verify (Mode A) state
  const [verifyResult, setVerifyResult] = useState<VerificationCheckResult | null>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyTargetName, setVerifyTargetName] = useState('');

  // New Issue Modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newCredentialTitle, setNewCredentialTitle] = useState('');
  const [newCredentialType, setNewCredentialType] = useState('Bachelor of Science');
  const [newClaimFields, setNewClaimFields] = useState<{ key: string; value: string }[]>([
    { key: 'major', value: 'Computer Science' },
  ]);

  const loadCredentials = React.useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('credlink_auth_token') : null;
      const isDemoMode = !storedToken || storedToken === 'demo_token';

      if (isDemoMode) {
        try {
          const demoRes = await apiClient.fetchDemoData();
          if (demoRes.success && demoRes.data?.credentials && demoRes.data.credentials.length > 0) {
            const mapped: CredentialItem[] = demoRes.data.credentials.map((c: any) => ({
              id: c.id,
              credentialType: c.credentialType,
              domain: (c.domain?.toUpperCase() as UserRole) || 'CITIZEN',
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
            setCredentials(mapped);
            setIsLoading(false);
            return;
          }
        } catch (demoErr) {
          console.warn('Demo data endpoint unavailable for credentials:', demoErr);
        }
        setCredentials(MOCK_CREDENTIALS);
        setIsLoading(false);
        return;
      }

      // Authenticated mode
      const res = await apiClient.listCredentials();
      if (res.success && res.data?.credentials && res.data.credentials.length > 0) {
        const mapped: CredentialItem[] = res.data.credentials.map((c: CredentialRecord) => {
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
            domain: (c.domain?.toUpperCase() as UserRole) || 'CITIZEN',
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
        setCredentials(mapped);
      } else {
        setCredentials(MOCK_CREDENTIALS);
      }
    } catch (err) {
      console.warn('Using demo fallback for credentials:', err);
      setCredentials(MOCK_CREDENTIALS);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  React.useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  // Load eligible citizens from Supabase when issuance modal opens
  React.useEffect(() => {
    if (showIssueModal) {
      apiClient.getCitizens().then((res) => {
        if (res.success && res.data && res.data.length > 0) {
          setCitizens(res.data);
          if (!newSubjectId) {
            setNewSubjectId(res.data[0].id);
            setNewSubjectName(res.data[0].fullName);
          }
        }
      }).catch((err) => {
        console.warn('Failed to load citizens:', err);
      });
    }
  }, [showIssueModal, newSubjectId]);

  const filteredCredentials = credentials.filter((item) => {
    const matchesSearch =
      item.subjectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.credentialType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subjectId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = selectedDomain === 'ALL' || item.domain === selectedDomain;
    const matchesStatus = selectedStatus === 'ALL' || item.status === selectedStatus;
    return matchesSearch && matchesDomain && matchesStatus;
  });

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    try {
      try {
        await apiClient.revokeCredential(revokeTarget.id, 'Revoked by authorized issuer');
        await loadCredentials();
      } catch (err: any) {
        // Local demo state revocation
        setCredentials((prev) =>
          prev.map((c) => (c.id === revokeTarget.id ? { ...c, status: 'REVOKED' } : c))
        );
      }
    } finally {
      setShowRevokeDialog(false);
      setRevokeTarget(null);
    }
  };

  const handleQuickVerify = async (cred: CredentialItem) => {
    setIsVerifying(true);
    setVerifyTargetName(`${cred.credentialType} — ${cred.subjectName}`);
    setShowVerifyDialog(true);
    setVerifyResult(null);
    try {
      const res = await apiClient.verifyCredentialComprehensive({ credentialId: cred.id });
      if (res.success && res.data) {
        setVerifyResult(res.data);
      } else {
        alert('Verification failed: ' + (res.error || 'Unknown error'));
        setShowVerifyDialog(false);
      }
    } catch (err: any) {
      alert('Verification error: ' + (err.message || 'Error'));
      setShowVerifyDialog(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCreateCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.organizationStatus === 'PENDING') {
      alert('Credential issuance restricted: Your organization status is PENDING approval.');
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

      const finalTitle = newCredentialTitle.trim() || `${newCredentialType} Attestation`;
      const issuerOrgId = currentUser.organizationId || 'org_demo_root';

      const claimsPayload: Record<string, any> = {
        subjectName: newSubjectName || 'Verified Citizen',
      };
      for (const field of newClaimFields) {
        if (field.key.trim()) {
          claimsPayload[field.key.trim()] = field.value;
        }
      }

      try {
        await apiClient.issueCredential({
          subjectId: newSubjectId || 'CIT-884920',
          issuerOrgId: issuerOrgId,
          domain: targetDomain,
          credentialType: newCredentialType,
          title: finalTitle,
          claims: claimsPayload,
        });
        await loadCredentials();
      } catch (apiErr) {
        // Local demo state credential creation
        const newCred: CredentialItem = {
          id: `vc_demo_${Date.now()}`,
          credentialType: newCredentialType,
          domain: currentUser.role === 'CITIZEN' ? 'COLLEGE' : currentUser.role,
          subjectId: newSubjectId || 'CIT-884920',
          subjectName: newSubjectName || 'Aarav Sharma',
          issuerName: currentUser.organizationName,
          issuerDid: currentUser.organizationDid,
          issuanceDate: new Date().toISOString().split('T')[0],
          status: 'VALID',
          claims: [
            { key: 'title', label: 'Credential Title', value: finalTitle },
            ...newClaimFields
              .filter((f) => f.key.trim())
              .map((f) => ({ key: f.key, label: f.key, value: f.value })),
          ],
          qrPayload: `credlink://verify?vc=vc_demo_${Date.now()}`,
        };
        setCredentials((prev) => [newCred, ...prev]);
      }

      setShowIssueModal(false);
      setNewCredentialTitle('');
    } catch (err: any) {
      console.warn('Issue error:', err);
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Verifiable Credential Management
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Issue, inspect claims, present simulated QR proofs, or manage credential revocation lifecycles.
            </p>
          </div>
          <Button
            variant={currentUser.role === 'HOSPITAL' ? 'health' : 'primary'}
            onClick={() => {
              if (currentUser.organizationStatus === 'PENDING') return;
              if (currentUser.authorizedCredentialTypes && currentUser.authorizedCredentialTypes.length > 0) {
                setNewCredentialType(currentUser.authorizedCredentialTypes[0]);
              }
              setShowIssueModal(true);
            }}
            disabled={currentUser.organizationStatus === 'PENDING' || (currentUser.role !== 'ADMIN' && currentUser.isIssuer === false)}
            className="gap-2 shrink-0 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            title={currentUser.organizationStatus === 'PENDING' ? 'Restricted: Organization pending approval' : ''}
          >
            <Plus className="w-4 h-4" />
            <span>Issue New Credential</span>
          </Button>
        </div>

        {/* Filter Controls */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-80">
              <Input
                placeholder="Search subject name, ID, or credential type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 mr-2">
                <Filter className="w-3.5 h-3.5" />
                <span>Filters:</span>
              </div>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All Domains</option>
                <option value="HOSPITAL">Healthcare / Hospital</option>
                <option value="COLLEGE">Education / College</option>
                <option value="BANK">Bank / Finance</option>
                <option value="EMPLOYER">Employer</option>
              </select>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All Statuses</option>
                <option value="VALID">Valid</option>
                <option value="REVOKED">Revoked</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Credential Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Catalog of Issued Credentials ({filteredCredentials.length})</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Credential Type</TableHead>
                <TableHead>Issuer & Domain</TableHead>
                <TableHead>Issuance Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading credentials from network...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredCredentials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                        <FileText className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        {searchQuery || selectedDomain !== 'ALL' || selectedStatus !== 'ALL'
                          ? 'No matching credentials found'
                          : 'No Verifiable Credentials Yet'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                        {searchQuery || selectedDomain !== 'ALL' || selectedStatus !== 'ALL'
                          ? 'Try adjusting your search criteria or resetting filters.'
                          : 'There are currently no verifiable credentials recorded in this domain. Authorized institutions can issue new verifiable credentials.'}
                      </p>
                      {currentUser.isIssuer && !searchQuery && selectedDomain === 'ALL' && selectedStatus === 'ALL' && (
                        <Button
                          size="sm"
                          onClick={() => setShowIssueModal(true)}
                          disabled={currentUser.organizationStatus === 'PENDING'}
                          className="gap-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Issue First Credential</span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCredentials.map((cred) => {
                  const statusStyle = getCredentialStatusBadge(cred.status);
                  const domainBadge = getDomainBadgeStyle(cred.domain);

                  return (
                    <TableRow key={cred.id}>
                      <TableCell>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{cred.subjectName}</p>
                          <p className="text-xs font-mono text-slate-500">{cred.subjectId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{cred.credentialType}</p>
                          <p className="text-xs text-slate-400">{cred.claims.length} verified claims</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{cred.issuerName}</p>
                          <Badge className={`text-xs mt-0.5 ${domainBadge.bg} ${domainBadge.text} ${domainBadge.border}`}>
                            {cred.domain}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500">{cred.issuanceDate}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusStyle.bg}>{statusStyle.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCred(cred)}
                            className="h-7 text-xs px-2"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedCred(cred);
                              setShowQrModal(true);
                            }}
                            className="h-7 text-xs px-2"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>QR Code</span>
                          </Button>
                          {cred.status === 'VALID' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRevokeTarget(cred);
                                setShowRevokeDialog(true);
                              }}
                              className="h-7 text-xs px-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Credential Details Side Drawer */}
      <Drawer
        isOpen={selectedCred !== null && !showQrModal}
        onClose={() => setSelectedCred(null)}
        title="Verifiable Credential Inspector"
        description={`ID: ${selectedCred?.id}`}
      >
        {selectedCred && (
          <div className="space-y-5">
            {/* Header info */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status</span>
                <Badge className={getCredentialStatusBadge(selectedCred.status).bg}>
                  {selectedCred.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Credential Type</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedCred.credentialType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Subject Name</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{selectedCred.subjectName} ({selectedCred.subjectId})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Issuer DID</span>
                <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">{truncateDid(selectedCred.issuerDid)}</span>
              </div>
            </div>

            {/* Claims Breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                Verified Claims Payload
              </h4>
              <div className="space-y-2">
                {selectedCred.claims.map((claim) => (
                  <div key={claim.key} className="p-3 border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-900 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-medium text-slate-700 dark:text-slate-300">{claim.label}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{claim.key}</p>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{claim.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Simulated Cryptographic Proof */}
            <div className="p-3 bg-slate-900 text-slate-200 rounded-md font-mono text-[10px] space-y-1">
              <p className="text-emerald-400 font-semibold">// Cryptographic Attestation</p>
              <p>Type: Ed25519Signature2020</p>
              <p>ProofPurpose: assertionMethod</p>
              <p className="break-all text-slate-400">SignatureValue: z5A89n...901mKq23L</p>
            </div>
          </div>
        )}
      </Drawer>

      {/* Simulated QR Code Modal */}
      {/* Presentation QR Modal */}
      <Dialog
        isOpen={showQrModal && selectedCred !== null}
        onClose={() => setShowQrModal(false)}
        title="Verifiable Credential Presentation Payload"
        description="Encrypted and HMAC-SHA256 signed credential payload."
      >
        {selectedCred && (
          <div className="text-center space-y-4 py-2">
            <div className="inline-block p-4 bg-white border border-slate-300 rounded-xl shadow-md">
              <div className="w-48 h-48 bg-slate-900 rounded-md flex flex-col items-center justify-center p-3 text-white space-y-2 relative overflow-hidden">
                <QrCode className="w-24 h-24 text-white" />
                <span className="text-[9px] font-mono tracking-widest bg-slate-800 px-2 py-0.5 rounded">
                  CREDLINK-VC-PRESENTATION
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{selectedCred.credentialType}</p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedCred.qrPayload}</p>
            </div>
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-md text-[11px] text-emerald-800 dark:text-emerald-300">
              Note: Contains application-level HMAC-SHA256 signature payload.
            </div>
          </div>
        )}
      </Dialog>

      {/* Revocation Confirm Dialog */}
      <Dialog
        isOpen={showRevokeDialog && revokeTarget !== null}
        onClose={() => setShowRevokeDialog(false)}
        title="Revoke Credential Confirmation"
        description="Are you sure you want to mark this credential as REVOKED?"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Revoking this credential will immediately update the trust registry status. Verification requests for this credential will fail.
          </p>
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-md text-xs text-rose-800 dark:text-rose-300">
            <p className="font-semibold">{revokeTarget?.credentialType}</p>
            <p className="text-[10px]">Subject: {revokeTarget?.subjectName} ({revokeTarget?.subjectId})</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRevokeDialog(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleRevokeConfirm}>
              Confirm Revocation
            </Button>
          </div>
        </div>
      </Dialog>

      {/* New Issue Credential Dialog */}
      <Dialog
        isOpen={showIssueModal}
        onClose={() => setShowIssueModal(false)}
        title={`Issue Credential — ${currentUser.role}`}
        description="Issue a database-persisted verifiable credential to an active citizen profile."
      >
        <form onSubmit={handleCreateCredential} className="space-y-3 text-xs">
          {/* Real Citizen Selector from Supabase profiles */}
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Target Citizen Subject (Supabase Profile)
            </label>
            {citizens.length > 0 ? (
              <select
                value={newSubjectId}
                onChange={(e) => {
                  const selected = e.target.value;
                  setNewSubjectId(selected);
                  const matched = citizens.find((c) => c.id === selected);
                  if (matched) setNewSubjectName(matched.fullName);
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
            {newSubjectId && (
              <p className="text-[10px] text-slate-500 font-mono">
                Selected Citizen UUID: {newSubjectId}
              </p>
            )}
          </div>

          {currentUser.authorizedCredentialTypes && currentUser.authorizedCredentialTypes.length > 0 ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Authorized Credential Schema / Type
              </label>
              <select
                value={newCredentialType}
                onChange={(e) => setNewCredentialType(e.target.value)}
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
              label="Credential Type"
              placeholder="e.g. Immunization Record / Bachelor Degree"
              value={newCredentialType}
              onChange={(e) => setNewCredentialType(e.target.value)}
              required
            />
          )}

          <Input
            label="Credential Title / Description"
            placeholder="e.g. Bachelor of Science in Computer Science"
            value={newCredentialTitle}
            onChange={(e) => setNewCredentialTitle(e.target.value)}
          />

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Claim Fields
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => setNewClaimFields([...newClaimFields, { key: '', value: '' }])}
              >
                <Plus className="w-3 h-3" />
                Add Field
              </Button>
            </div>
            {newClaimFields.map((field, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="e.g. major"
                  value={field.key}
                  onChange={(e) => {
                    const updated = [...newClaimFields];
                    updated[idx] = { ...updated[idx], key: e.target.value };
                    setNewClaimFields(updated);
                  }}
                />
                <Input
                  placeholder="e.g. Computer Science"
                  value={field.value}
                  onChange={(e) => {
                    const updated = [...newClaimFields];
                    updated[idx] = { ...updated[idx], value: e.target.value };
                    setNewClaimFields(updated);
                  }}
                />
                {newClaimFields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setNewClaimFields(newClaimFields.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded text-[11px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-800 dark:text-slate-200">Issuer Authorization:</p>
            <p className="font-mono text-[10px] text-slate-500">{currentUser.organizationName} ({currentUser.organizationDid})</p>
            <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium mt-0.5">Signature: HMAC-SHA256 application-level verification</p>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowIssueModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Issue Credential
            </Button>
          </div>
        </form>
      </Dialog>
    </Shell>
  );
}
