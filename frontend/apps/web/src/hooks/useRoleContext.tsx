'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, CurrentUser } from '../types';
import { apiClient, LoginInput, OrganizationMembership, ApiClientError } from '../../../../packages/api-client';
import { INITIAL_USER, MOCK_ORGANIZATIONS, MOCK_MEMBERSHIPS } from '../lib/mockData';

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
  enterDemoMode: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(INITIAL_USER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>(MOCK_MEMBERSHIPS);

  const enterDemoMode = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('credlink_auth_token', 'demo_token');
    }
    setCurrentUser(INITIAL_USER);
    setMemberships(MOCK_MEMBERSHIPS);
    setIsAuthenticated(true);
    setError(null);
  };

  // Initialize session on startup
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem('credlink_auth_token') : null;
        if (!storedToken || storedToken === 'demo_token') {
          if (isMounted) {
            setCurrentUser(INITIAL_USER);
            setMemberships(MOCK_MEMBERSHIPS);
            setIsAuthenticated(true);
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
          // Graceful fallback to demo mode
          setCurrentUser(INITIAL_USER);
          setMemberships(MOCK_MEMBERSHIPS);
          setIsAuthenticated(true);
        }
      } catch (err: unknown) {
        if (isMounted) {
          // Live backend offline -> Keep demo active
          setCurrentUser(INITIAL_USER);
          setMemberships(MOCK_MEMBERSHIPS);
          setIsAuthenticated(true);
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
      // Backend not running or demo credentials -> activate demo mode seamlessly!
      enterDemoMode();
      return true;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const currentToken = apiClient.getToken();
      if (currentToken && currentToken !== 'demo_token') {
        await apiClient.logout(currentToken);
      }
    } catch (err: unknown) {
      // Ignore network errors on logout
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('credlink_auth_token');
      }
      apiClient.setToken(null);
      // Reset to default demo session
      setCurrentUser(INITIAL_USER);
      setMemberships(MOCK_MEMBERSHIPS);
      setIsAuthenticated(true);
    }
  };

  const switchRole = (role: UserRole) => {
    if (!currentUser) return;

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
    } else {
      // Demo fallback switch across domains
      const matchingOrg = MOCK_ORGANIZATIONS.find((o) => o.domain === role) || MOCK_ORGANIZATIONS[0];
      setCurrentUser((prev) => ({
        id: prev?.id || `usr_${role.toLowerCase()}`,
        name: prev?.name || `Bhumi Patel (${role})`,
        email: prev?.email || `${role.toLowerCase()}@credlink.network`,
        role: role,
        organizationName: matchingOrg.name,
        organizationDid: matchingOrg.did,
        organizationId: matchingOrg.id,
        organizationCode: matchingOrg.code,
        organizationDomain: matchingOrg.domain,
        organizationStatus: 'APPROVED',
        isIssuer: true,
        authorizedCredentialTypes: matchingOrg.authorizedCredentialTypes,
      }));
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
        clearError,
        enterDemoMode,
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
