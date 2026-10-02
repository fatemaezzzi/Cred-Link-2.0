'use client';

import React, { useState } from 'react';
import { Lock, Search, Building2, CheckCircle2, ShieldAlert, Filter, Eye, AlertTriangle } from 'lucide-react';
import { Shell } from '../../../components/layout/Shell';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { Input } from '../../../components/ui/Input';
import { Drawer } from '../../../components/ui/Drawer';
import { Dialog } from '../../../components/ui/Dialog';
import { Organization, OrgStatus } from '../../../types';
import { getOrgStatusBadge, truncateDid, getDomainBadgeStyle } from '../../../lib/utils';
import { useRoleContext } from '../../../hooks/useRoleContext';

import { apiClient, OrganizationSummary } from '../../../../../../packages/api-client';
import { MOCK_ORGANIZATIONS } from '../../../lib/mockData';

export default function TrustRegistryPage() {
  const { currentUser } = useRoleContext();
  if (!currentUser) return null;
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<Organization | null>(null);
  const [newStatus, setNewStatus] = useState<OrgStatus>('SUSPENDED');

  const loadTrustRegistry = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.listOrganizations();
      if (res.success && res.data?.organizations && res.data.organizations.length > 0) {
        const mapped: Organization[] = res.data.organizations.map((o: OrganizationSummary) => ({
          id: o.id,
          name: o.name,
          code: o.code,
          domain: (o.domain?.toUpperCase() as Organization['domain']) || 'ADMIN',
          did: o.did,
          status: ((o.status || o.verification_status) as OrgStatus) || 'ACTIVE',
          authorizedCredentialTypes: o.authorizedCredentialTypes || o.authorized_credential_types || ['Verifiable Credentials'],
          issuedCount: 0,
          verifiedCount: 0,
          createdAt: o.createdAt || new Date().toISOString(),
        }));
        setOrgs(mapped);
      } else {
        setOrgs(MOCK_ORGANIZATIONS);
      }
    } catch (err) {
      console.warn('Using demo fallback for trust registry:', err);
      setOrgs(MOCK_ORGANIZATIONS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadTrustRegistry();
  }, [loadTrustRegistry]);

  const filteredOrgs = orgs.filter((o) => {
    const matchesSearch =
      o.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.did.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDomain = selectedDomain === 'ALL' || o.domain === selectedDomain;
    return matchesSearch && matchesDomain;
  });

  const [approveTarget, setApproveTarget] = useState<Organization | null>(null);

  // Domain → default credential types mapping
  const domainCredentialTypes: Record<string, string[]> = {
    COLLEGE: ['AcademicCredential', 'DegreeCredential', 'TranscriptCredential'],
    HOSPITAL: ['MedicalCredential', 'VaccinationCredential', 'HealthRecord'],
    BANK: ['FinancialCredential', 'CreditScoreCredential'],
    EMPLOYER: ['EmploymentCredential', 'WorkExperienceCredential'],
  };

  const handleApproveOrg = async () => {
    if (!approveTarget) return;
    if (currentUser.role !== 'ADMIN') {
      alert('Forbidden: Only Network Administrators can approve organizations.');
      return;
    }
    try {
      const credTypes = domainCredentialTypes[approveTarget.domain] || ['VerifiableCredential'];
      await apiClient.updateOrganizationStatus(approveTarget.id, {
        verificationStatus: 'APPROVED',
        isIssuer: true,
        authorizedCredentialTypes: credTypes,
      });
      await loadTrustRegistry();
    } catch (e: any) {
      alert('Approval failed: ' + (e.message || 'Error'));
    } finally {
      setApproveTarget(null);
    }
  };

  const handleDenyOrg = async (org: Organization) => {
    if (currentUser.role !== 'ADMIN') {
      alert('Forbidden: Only Network Administrators can deny organizations.');
      return;
    }
    if (!confirm(`Deny registration for "${org.name}"?`)) return;
    try {
      await apiClient.updateOrganizationStatus(org.id, {
        verificationStatus: 'DENIED',
      });
      await loadTrustRegistry();
    } catch (e: any) {
      alert('Denial failed: ' + (e.message || 'Error'));
    }
  };

  const handleUpdateOrgStatus = async () => {
    if (!statusChangeTarget) return;
    if (currentUser.role !== 'ADMIN') {
      alert('Forbidden: Only Network Administrators can perform status updates.');
      return;
    }
    try {
      await apiClient.updateOrganizationStatus(statusChangeTarget.id, {
        verificationStatus: newStatus === 'ACTIVE' ? 'APPROVED' : 'DENIED',
      });
      await loadTrustRegistry();
    } catch (e: any) {
      // Local demo fallback update
      setOrgs((prev) =>
        prev.map((o) => (o.id === statusChangeTarget.id ? { ...o, status: newStatus } : o))
      );
    } finally {
      setStatusChangeTarget(null);
    }
  };

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Network Trust Registry & Issuer Authorization
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Verifiable Decentralized Identifiers (DIDs) and authorized credential schemas for verified institutions.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Badge variant="neutral" className="py-1 px-3 text-xs">
              Root Governance: CredLink Authority
            </Badge>
          </div>
        </div>

        {/* Filter Controls */}
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-80">
              <Input
                placeholder="Search institution name, DID, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Filter Realm:</span>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="h-9 px-3 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="ALL">All Realms</option>
                <option value="HOSPITAL">Healthcare</option>
                <option value="COLLEGE">Education</option>
                <option value="BANK">Financial</option>
                <option value="EMPLOYER">Employer</option>
                <option value="ADMIN">Governance Root</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Directory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Authorized Issuer Directory ({filteredOrgs.length})</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution Name & Code</TableHead>
                <TableHead>Decentralized Identifier (DID)</TableHead>
                <TableHead>Realm Domain</TableHead>
                <TableHead>Authorized Schemas</TableHead>
                <TableHead>Issuer Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading trust registry directory...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredOrgs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        {searchQuery || selectedDomain !== 'ALL'
                          ? 'No matching institutions found'
                          : 'No Registered Institutions in Trust Registry'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {searchQuery || selectedDomain !== 'ALL'
                          ? 'Try adjusting your search criteria or resetting the realm filter.'
                          : 'No organizations have been registered in the governance directory yet.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrgs.map((org) => {
                const statusStyle = getOrgStatusBadge(org.status);
                const domainStyle = getDomainBadgeStyle(org.domain);

                return (
                  <TableRow key={org.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{org.name}</p>
                        <p className="text-xs font-mono text-slate-500">{org.code}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                        {truncateDid(org.did)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${domainStyle.bg} ${domainStyle.text} ${domainStyle.border}`}>
                        {org.domain}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {org.authorizedCredentialTypes.map((type) => (
                          <span key={type} className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 rounded font-medium text-slate-600 dark:text-slate-300">
                            {type}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusStyle.bg}>{statusStyle.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedOrg(org)}
                          className="h-7 text-xs px-2"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Details</span>
                        </Button>
                        {currentUser.role === 'ADMIN' && (org.status === 'PENDING' || org.status === 'DENIED') && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setApproveTarget(org)}
                              className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </Button>
                            {org.status !== 'DENIED' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleDenyOrg(org)}
                                className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700"
                              >
                                <span>Deny</span>
                              </Button>
                            )}
                          </>
                        )}
                        {currentUser.role === 'ADMIN' && org.status !== 'PENDING' && org.status !== 'DENIED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setStatusChangeTarget(org);
                              setNewStatus(org.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE');
                            }}
                            className="h-7 text-xs px-2"
                          >
                            <span>Toggle Status</span>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Org Details Drawer */}
      <Drawer
        isOpen={selectedOrg !== null}
        onClose={() => setSelectedOrg(null)}
        title="Trust Registry Entry Details"
        description={`Issuer Code: ${selectedOrg?.code}`}
      >
        {selectedOrg && (
          <div className="space-y-5">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Registry Status</span>
                <Badge className={getOrgStatusBadge(selectedOrg.status).bg}>
                  {selectedOrg.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Institution Name</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{selectedOrg.name}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-1">Full Root DID</span>
                <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-900 p-2 rounded block break-all text-slate-800 dark:text-slate-200">
                  {selectedOrg.did}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-2">
                Permitted Credential Schemas
              </h4>
              <div className="space-y-1.5">
                {selectedOrg.authorizedCredentialTypes.map((schema) => (
                  <div key={schema} className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>{schema}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Admin Status Change Dialog */}
      <Dialog
        isOpen={statusChangeTarget !== null}
        onClose={() => setStatusChangeTarget(null)}
        title="Admin Governance Action"
        description="Update Trust Registry authorization status for this institution."
      >
        {statusChangeTarget && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">{statusChangeTarget.name}</p>
              <p className="text-[11px]">Current Status: {statusChangeTarget.status} → New Target: {newStatus}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setStatusChangeTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleUpdateOrgStatus}>
                Confirm Status Update
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Admin Approve Organization Dialog */}
      <Dialog
        isOpen={approveTarget !== null}
        onClose={() => setApproveTarget(null)}
        title="Approve Organization"
        description="Grant issuer authorization to this institution on the CredLink network."
      >
        {approveTarget && (
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-md text-sm">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">{approveTarget.name}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Code: {approveTarget.code} · Domain: {approveTarget.domain}</p>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
              <p className="font-medium text-slate-800 dark:text-slate-200">This approval will:</p>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>Set verification status to <strong>APPROVED</strong></li>
                <li>Grant <strong>Issuer</strong> privileges</li>
                <li>Authorize credential types: <span className="font-mono">{(domainCredentialTypes[approveTarget.domain] || ['VerifiableCredential']).join(', ')}</span></li>
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setApproveTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleApproveOrg} className="bg-emerald-600 hover:bg-emerald-700">
                Confirm Approval
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Shell>
  );
}
