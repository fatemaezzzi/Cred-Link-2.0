'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, CurrentUser } from '../types';
import { apiClient, LoginInput, OrganizationMembership, ApiClientError } from '../../../../packages/api-client';

export function deriveUserRole(userRoleAttr?: string, orgDomainAttr?: string): UserRole {
  if (userRoleAttr?.toUpperCase() === 'ADMIN') {
    return 'ADMIN';
  }
  if (orgDomainAttr) {
    const domainUpper = orgDomainAttr.toUpperCase();
    if (domainUpper === 'HOSPITAL' || domainUpper === 'HEALTHCARE') return 'HOSPITAL';
    if (domainUpper === 'COLLEGE' || domainUpper === 'EDUCATION') return 'COLLEGE';
    if (domainUpper === 'BANK' || domainUpper === 'FINANCE') return 'BANK';
    if (domainUpper === 'EMPLOYER') return 'EMPLOYER';
    if (domainUpper === 'ADMIN') return 'ADMIN';
  }
  if (userRoleAttr) {
    const roleUpper = userRoleAttr.toUpperCase();
    if (roleUpper === 'HOSPITAL' || roleUpper === 'HEALTHCARE') return 'HOSPITAL';
    if (roleUpper === 'COLLEGE' || roleUpper === 'EDUCATION') return 'COLLEGE';
    if (roleUpper === 'BANK' || roleUpper === 'FINANCE') return 'BANK';
    if (roleUpper === 'EMPLOYER') return 'EMPLOYER';
  }
  return 'CITIZEN';
}

interface RoleContextType {
  currentUser: CurrentUser | null;
  switchRole: (role: UserRole) => void;
  activeOrgDid: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  memberships: OrganizationMembership[];
  login: (credentials: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);

  // Initialize session on startup
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem('credlink_auth_token') : null;
        if (!storedToken) {
          if (isMounted) {
            setCurrentUser(null);
            setIsAuthenticated(false);
            setIsLoading(false);
          }
          return;
        }

        apiClient.setToken(storedToken);
        const meRes = await apiClient.getMe();

        if (meRes.success && meRes.data && isMounted) {
          const user = meRes.data.user;
          const userOrgs = meRes.data.memberships || [];
          const primaryOrg = userOrgs[0]?.organization;

          // Backend current-user response is authoritative
          const resolvedOrgId = user.organizationId || primaryOrg?.id || undefined;
          const resolvedOrgName = user.organizationName || primaryOrg?.name || (user.role === 'ADMIN' ? 'CredLink Network Governance' : 'Unaffiliated Citizen');
          const resolvedOrgCode = user.organizationCode || primaryOrg?.code || (user.role === 'ADMIN' ? 'GOV-ROOT' : undefined);
          const resolvedOrgDomain = user.organizationDomain || primaryOrg?.domain || (user.role === 'ADMIN' ? 'admin' : undefined);
          const resolvedOrgDid = user.organizationDid || primaryOrg?.did || (user.role === 'ADMIN' ? 'did:credlink:governance:root' : (user.id ? `did:credlink:citizen:${user.id}` : 'did:credlink:citizen:unaffiliated'));
          const resolvedOrgStatus = (user.organizationStatus as any) || (primaryOrg as any)?.verification_status || (primaryOrg as any)?.status || (user.role === 'ADMIN' ? 'APPROVED' : undefined);
          const resolvedIsIssuer = user.isIssuer ?? (primaryOrg?.is_issuer ?? false);
          const resolvedAuthorizedTypes = user.authorizedCredentialTypes || primaryOrg?.authorizedCredentialTypes || primaryOrg?.authorized_credential_types || [];
          const userRole = deriveUserRole(user.role, resolvedOrgDomain);

          setCurrentUser({
            id: user.id,
            name: user.fullName || user.email,
            email: user.email,
            role: userRole,
            organizationName: resolvedOrgName,
            organizationDid: resolvedOrgDid,
            organizationId: resolvedOrgId,
            organizationCode: resolvedOrgCode,
            organizationDomain: resolvedOrgDomain,
            organizationStatus: resolvedOrgStatus,
            isIssuer: resolvedIsIssuer,
            authorizedCredentialTypes: resolvedAuthorizedTypes,
          });
          setMemberships(userOrgs);
          setIsAuthenticated(true);
        } else if (isMounted) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('credlink_auth_token');
          }
          apiClient.setToken(null);
          setCurrentUser(null);
          setIsAuthenticated(false);
          setMemberships([]);
        }
      } catch (err: unknown) {
        if (isMounted) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('credlink_auth_token');
          }
          apiClient.setToken(null);
          setCurrentUser(null);
          setIsAuthenticated(false);
          setMemberships([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (credentials: LoginInput): Promise<boolean> => {
    setError(null);
    try {
      const res = await apiClient.login(credentials);
      if (res.success && res.data) {
        const { user, session, memberships: userOrgs } = res.data;
        if (session?.access_token) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('credlink_auth_token', session.access_token);
          }
        }

        const primaryOrg = userOrgs[0]?.organization;
        const resolvedOrgId = user.organizationId || primaryOrg?.id || undefined;
        const resolvedOrgName = user.organizationName || primaryOrg?.name || (user.role === 'ADMIN' ? 'CredLink Network Governance' : 'Unaffiliated Citizen');
        const resolvedOrgCode = user.organizationCode || primaryOrg?.code || (user.role === 'ADMIN' ? 'GOV-ROOT' : undefined);
        const resolvedOrgDomain = user.organizationDomain || primaryOrg?.domain || (user.role === 'ADMIN' ? 'admin' : undefined);
        const resolvedOrgDid = user.organizationDid || primaryOrg?.did || (user.role === 'ADMIN' ? 'did:credlink:governance:root' : (user.id ? `did:credlink:citizen:${user.id}` : 'did:credlink:citizen:unaffiliated'));
        const resolvedOrgStatus = (user.organizationStatus as any) || (primaryOrg as any)?.verification_status || (primaryOrg as any)?.status || (user.role === 'ADMIN' ? 'APPROVED' : undefined);
        const resolvedIsIssuer = user.isIssuer ?? (primaryOrg?.is_issuer ?? false);
        const resolvedAuthorizedTypes = user.authorizedCredentialTypes || primaryOrg?.authorizedCredentialTypes || primaryOrg?.authorized_credential_types || [];
        const userRole = deriveUserRole(user.role, resolvedOrgDomain);

        setCurrentUser({
          id: user.id,
          name: user.fullName || user.email,
          email: user.email,
          role: userRole,
          organizationName: resolvedOrgName,
          organizationDid: resolvedOrgDid,
          organizationId: resolvedOrgId,
          organizationCode: resolvedOrgCode,
          organizationDomain: resolvedOrgDomain,
          organizationStatus: resolvedOrgStatus,
          isIssuer: resolvedIsIssuer,
          authorizedCredentialTypes: resolvedAuthorizedTypes,
        });
        setMemberships(userOrgs);
        setIsAuthenticated(true);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err instanceof Error ? err.message : 'Login failed. Please check credentials.');
      setError(msg);
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const currentToken = apiClient.getToken();
      if (currentToken) {
        await apiClient.logout(currentToken);
      }
    } catch (err: unknown) {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('credlink_auth_token');
      }
      apiClient.setToken(null);
      setIsAuthenticated(false);
      setCurrentUser(null);
      setMemberships([]);
    }
  };

  const switchRole = (role: UserRole) => {
    if (!currentUser) return;

    // Prevent non-admin users from escalating to ADMIN role
    if (role === 'ADMIN' && currentUser.role !== 'ADMIN') {
      console.warn('[Security] Unauthorized attempt to switch to ADMIN role denied.');
      return;
    }

    // Find matching active organization membership
    const matchingMembership = memberships.find((m) => {
      const domainRole = deriveUserRole(undefined, m.organization?.domain);
      return domainRole === role;
    });

    if (matchingMembership?.organization) {
      const org = matchingMembership.organization;
      const orgStatus = (org as any).verification_status || (org as any).status || 'APPROVED';
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              role: role,
              organizationId: org.id,
              organizationName: org.name,
              organizationCode: org.code,
              organizationDomain: org.domain,
              organizationDid: org.did,
              organizationStatus: orgStatus,
              isIssuer: org.is_issuer ?? false,
              authorizedCredentialTypes: (org as any).authorizedCredentialTypes || (org as any).authorized_credential_types || [],
            }
          : null
      );
    } else if (role === 'ADMIN' && currentUser.role === 'ADMIN') {
      // Revert to genuine ADMIN Network Governance view
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              role: 'ADMIN',
              organizationId: undefined,
              organizationName: 'CredLink Network Governance',
              organizationCode: 'GOV-ROOT',
              organizationDomain: 'admin',
              organizationDid: 'did:credlink:governance:root',
              organizationStatus: 'APPROVED',
              isIssuer: false,
              authorizedCredentialTypes: [],
            }
          : null
      );
    } else {
      console.warn(`[Security] Denied switch to role ${role}: No matching DB organization membership.`);
    }
  };

  const clearError = () => setError(null);

  return (
    <RoleContext.Provider
      value={{
        currentUser,
        switchRole,
        activeOrgDid: currentUser?.organizationDid || null,
        isAuthenticated,
        isLoading,
        error,
        memberships,
        login,
        logout,
        clearError
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRoleContext() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRoleContext must be used within a RoleProvider');
  }
  return context;
}
