import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { UserRole, CredentialStatus, OrgStatus, VerificationStatus } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDomainBadgeStyle(domain: UserRole): { label: string; bg: string; text: string; border: string } {
  switch (domain) {
    case 'COLLEGE':
      return { label: 'College / Education', bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800' };
    case 'BANK':
      return { label: 'Bank / Financial', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' };
    case 'HOSPITAL':
      return { label: 'Healthcare / Hospital', bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' };
    case 'EMPLOYER':
      return { label: 'Employer / Enterprise', bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' };
    case 'ADMIN':
      return { label: 'Network Admin', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-800 dark:text-slate-200', border: 'border-slate-300 dark:border-slate-700' };
    default:
      return { label: domain, bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-700' };
  }
}

export function getCredentialStatusBadge(status: CredentialStatus) {
  switch (status) {
    case 'VALID':
      return { label: 'Valid & Active', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60' };
    case 'REVOKED':
      return { label: 'Revoked', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800/60' };
    case 'EXPIRED':
      return { label: 'Expired', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800/60' };
  }
}

export function getVerificationStatusBadge(status: VerificationStatus) {
  switch (status) {
    case 'APPROVED':
      return { label: 'Verified & Approved', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60' };
    case 'PENDING':
      return { label: 'Awaiting Consent', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800/60' };
    case 'DENIED':
      return { label: 'Denied / Refused', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800/60' };
    case 'REVOKED':
      return { label: 'Consent Revoked', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800/60' };
    default:
      return { label: status, bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  }
}

export function getOrgStatusBadge(status: OrgStatus) {
  switch (status) {
    case 'ACTIVE':
    case 'APPROVED':
      return { label: 'Authorized Issuer', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
    case 'SUSPENDED':
    case 'REJECTED':
    case 'DENIED':
      return { label: status === 'DENIED' ? 'Denied' : 'Suspended / Rejected', bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800' };
    case 'PENDING':
      return { label: 'Pending Approval', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
    default:
      return { label: String(status), bg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700' };
  }
}

export function truncateDid(did: string, start = 14, end = 6) {
  if (!did || did.length <= start + end) return did;
  return `${did.slice(0, start)}...${did.slice(-end)}`;
}
