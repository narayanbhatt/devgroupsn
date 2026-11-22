import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type CustomerType = 'individual' | 'business' | 'government' | 'institution' | 'contractor';
export type StaffRole =
  | 'super_admin'
  | 'catalog_admin'
  | 'order_manager'
  | 'project_manager'
  | 'finance'
  | 'support_agent';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customer_type: CustomerType;
  status: 'active' | 'disabled';
}

interface AuthState {
  /** True until the stored session has been read on launch. */
  initializing: boolean;
  session: Session | null;
  profile: Profile | null;
  staffRoles: StaffRole[];
  isStaff: boolean;
  /** Staff can switch between the staff tabs and the customer tabs. */
  staffView: boolean;
  setStaffView: (on: boolean) => void;
  /** Set while a password-reset code has been accepted but no new password chosen. */
  recoveryPending: boolean;
  setRecoveryPending: (on: boolean) => void;
  /** Shown on the sign-in screen after an automatic sign-out (e.g. disabled account). */
  notice: string | null;
  clearNotice: () => void;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [staffRoles, setStaffRoles] = useState<StaffRole[]>([]);
  const [staffView, setStaffView] = useState(true);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadAccount = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setProfile(null);
      setStaffRoles([]);
      return;
    }
    const [{ data: p }, { data: roles }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email, phone, customer_type, status').eq('id', s.user.id).maybeSingle(),
      supabase.from('staff_roles').select('role').eq('user_id', s.user.id),
    ]);
    if (p?.status === 'disabled') {
      setNotice('This account has been disabled. Please contact DEV Group.');
      await supabase.auth.signOut();
      return;
    }
    setProfile((p as Profile | null) ?? null);
    setStaffRoles(((roles ?? []) as { role: StaffRole }[]).map((r) => r.role));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadAccount(data.session);
      if (active) setInitializing(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: Supabase recommends not awaiting other client calls inside this callback.
        setTimeout(() => void loadAccount(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const value = useMemo<AuthState>(
    () => ({
      initializing,
      session,
      profile,
      staffRoles,
      isStaff: staffRoles.length > 0,
      staffView,
      setStaffView,
      recoveryPending,
      setRecoveryPending,
      notice,
      clearNotice: () => setNotice(null),
      refreshProfile: () => loadAccount(session),
      signOut: async () => {
        setRecoveryPending(false);
        await supabase?.auth.signOut();
      },
    }),
    [initializing, session, profile, staffRoles, staffView, recoveryPending, notice, loadAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Whether a staff member holds a role (super admin holds every role). */
export function hasRole(roles: StaffRole[], role: StaffRole) {
  return roles.includes('super_admin') || roles.includes(role);
}
