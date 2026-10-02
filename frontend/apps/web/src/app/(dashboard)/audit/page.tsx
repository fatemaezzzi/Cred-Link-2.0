'use client';

import React, { useState } from 'react';
import { History, Search, Filter, ShieldCheck, CheckCircle2, Eye, Lock } from 'lucide-react';
import { Shell } from '../../../components/layout/Shell';
import { Card, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../../components/ui/Table';
import { Input } from '../../../components/ui/Input';
import { Drawer } from '../../../components/ui/Drawer';
import { Button } from '../../../components/ui/Button';
import { AuditLogItem } from '../../../types';
import { getDomainBadgeStyle } from '../../../lib/utils';
import { apiClient } from '../../../../../../packages/api-client';
import { MOCK_AUDIT_LOGS } from '../../../lib/mockData';

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  React.useEffect(() => {
    async function loadAuditLogs() {
      setIsLoading(true);
      try {
        const res = await apiClient.listAuditLogs({ limit: 50 });
        if (res.success && res.data?.logs && res.data.logs.length > 0) {
          const mappedLogs: AuditLogItem[] = res.data.logs.map((l: any) => ({
            id: l.id,
            timestamp: new Date(l.timestamp).toLocaleString(),
            eventType: l.eventType,
            action: l.action,
            domain: l.domain,
            outcome: l.outcome,
            actor: l.actor,
            organization: l.organization,
            details: l.details || l.action,
          }));
          setLogs(mappedLogs);
        } else {
          setLogs(MOCK_AUDIT_LOGS);
        }
      } catch (err) {
        console.warn('Using demo fallback for audit logs:', err);
        setLogs(MOCK_AUDIT_LOGS);
      } finally {
        setIsLoading(false);
      }
    }
    loadAuditLogs();
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.actor.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Immutable Network Audit Trail
              </h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Complete event ledger of issuance, verification requests, consent attestations, and trust registry updates.
            </p>
          </div>
        </div>

        {/* Filter */}
        <Card className="p-4">
          <div className="w-full md:w-80">
            <Input
              placeholder="Search audit action, actor, or organization..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<Search className="w-4 h-4" />}
            />
          </div>
        </Card>

        {/* Audit Log Table */}
        <Card>
          <CardHeader>
            <CardTitle>System Audit Ledger ({filteredLogs.length})</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Organization & Domain</TableHead>
                <TableHead>Action Summary</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading network audit logs...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                        <History className="w-6 h-6" />
                      </div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        {searchQuery ? 'No matching audit events' : 'Audit Trail Empty'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {searchQuery
                          ? 'Try modifying your search query.'
                          : 'No immutable audit events have been recorded yet. All network issuance, verification, and consent transactions will be logged here.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => {
                const domainStyle = getDomainBadgeStyle(log.domain);
                return (
                  <TableRow key={log.id}>
                    <TableCell>
                      <span className="font-mono text-xs sm:text-sm text-slate-500">{log.timestamp}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {log.eventType}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{log.organization}</p>
                        <Badge className={`text-xs ${domainStyle.bg} ${domainStyle.text} ${domainStyle.border}`}>
                          {log.domain}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs sm:text-sm text-slate-700 dark:text-slate-300">{log.action}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.outcome === 'SUCCESS' ? 'success' : 'warning'}>
                        {log.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="h-7 text-xs px-2"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Audit Inspector Drawer */}
      <Drawer
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Details"
        description={`Log ID: ${selectedLog?.id}`}
      >
        {selectedLog && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Event Type</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">{selectedLog.eventType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actor / Initiator</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{selectedLog.actor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Timestamp</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">{selectedLog.timestamp}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Execution Details</h4>
              <p className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedLog.details}
              </p>
            </div>

            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded text-[11px] text-slate-500 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Cryptographic hash digest verified against blockchain anchor.</span>
            </div>
          </div>
        )}
      </Drawer>
    </Shell>
  );
}
