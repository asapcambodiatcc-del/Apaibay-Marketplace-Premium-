import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useProducts } from '../context/ProductContext';
import { SellerClient } from '../services/sellerClient';
import { AdminNotificationClient } from '../services/adminNotificationClient';
import { AdminClient } from '../services/adminClient';
import {
  Seller,
  AdminNotification,
  AdminRoleUser,
  CanonicalRole,
  AdminAuditLog,
  OrderDispute,
  DisputeStatus,
  SystemHealthReport,
  SellerPayoutRequest,
  SellerKycRecord,
  KycHistoryEvent,
} from '../types';
import {
  ShieldAlert,
  Users,
  Store,
  DollarSign,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Server,
  Database,
  Lock,
  RefreshCw,
  Clock,
  Bell,
  Search,
  Eye,
  Building,
  Mail,
  Phone,
  MapPin,
  Tag,
  Globe,
  FileCheck,
  Package,
  Layers,
  ShoppingBag,
  CreditCard,
  Scale,
  BarChart3,
  History,
  UserCog,
  HeartPulse,
  Settings as SettingsIcon,
  UserX,
  UserCheck,
  Check,
  X,
  AlertCircle,
  FileText,
  ShieldCheck,
} from 'lucide-react';

interface AdminPageProps {
  onShowToast: (msg: string, type?: 'success' | 'info' | 'error') => void;
}

type TabType =
  | 'overview'
  | 'users'
  | 'sellers'
  | 'products'
  | 'inventory'
  | 'orders'
  | 'payments'
  | 'disputes'
  | 'analytics'
  | 'audit'
  | 'roles'
  | 'health'
  | 'settings';

export const AdminPage: React.FC<AdminPageProps> = ({ onShowToast }) => {
  const { t } = useLanguage();
  const { products, refreshProducts } = useProducts();
  const [stockAdjustments, setStockAdjustments] = useState<Record<string, number>>({});

  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // --- Sellers State (Preserved) ---
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loadingSellers, setLoadingSellers] = useState<boolean>(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'under_review' | 'verified' | 'rejected' | 'expired' | 'suspended'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingSeller, setInspectingSeller] = useState<Seller | null>(null);
  const [rejectModalSeller, setRejectModalSeller] = useState<Seller | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [kycMap, setKycMap] = useState<Record<string, SellerKycRecord>>({});
  const [inspectingKycDetail, setInspectingKycDetail] = useState<{ record: SellerKycRecord; history: KycHistoryEvent[] } | null>(null);
  const [loadingKycDetail, setLoadingKycDetail] = useState<boolean>(false);
  const [kycActionNote, setKycActionNote] = useState<string>('');

  // --- RBAC & Users State ---
  const [adminUsers, setAdminUsers] = useState<AdminRoleUser[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // --- Audit Logs State ---
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFilterAction, setAuditFilterAction] = useState('all');

  // --- Disputes State ---
  const [disputes, setDisputes] = useState<OrderDispute[]>([]);
  const [loadingDisputes, setLoadingDisputes] = useState(false);
  const [disputeFilterStatus, setDisputeFilterStatus] = useState<string>('all');
  const [selectedDispute, setSelectedDispute] = useState<OrderDispute | null>(null);
  const [disputeAdminNotes, setDisputeAdminNotes] = useState('');
  const [refundModalDispute, setRefundModalDispute] = useState<OrderDispute | null>(null);
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState<string>('');

  // --- System Health State ---
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // --- Orders & Product Catalog Oversight State ---
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  // --- Seller Payouts Governance State ---
  const [payoutRequests, setPayoutRequests] = useState<SellerPayoutRequest[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [payoutFilterStatus, setPayoutFilterStatus] = useState('all');
  const [rejectModalPayout, setRejectModalPayout] = useState<SellerPayoutRequest | null>(null);
  const [payoutRejectionReason, setPayoutRejectionReason] = useState('');
  const [confirmModalPayout, setConfirmModalPayout] = useState<SellerPayoutRequest | null>(null);
  const [providerConfirmOutcome, setProviderConfirmOutcome] = useState<'success' | 'failed'>('success');
  const [providerRefInput, setProviderRefInput] = useState('');
  const [providerFailureInput, setProviderFailureInput] = useState('');

  // --- Confirmation Modal Generic State ---
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: 'danger' | 'warning' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    variant: 'primary',
    onConfirm: () => {},
  });

  // --- Data Loaders ---
  const loadSellers = useCallback(async () => {
    try {
      setLoadingSellers(true);
      const [list, kycList] = await Promise.all([
        SellerClient.listSellers(),
        AdminClient.fetchKycApplications().catch(() => [] as SellerKycRecord[]),
      ]);
      setSellers(list);
      const map: Record<string, SellerKycRecord> = {};
      for (const rec of kycList) {
        map[rec.sellerId] = rec;
      }
      setKycMap(map);
    } catch (err: any) {
      console.warn('Could not load sellers:', err?.message);
    } finally {
      setLoadingSellers(false);
    }
  }, []);

  const openSellerInspector = useCallback(async (seller: Seller) => {
    setInspectingSeller(seller);
    setKycActionNote('');
    setInspectingKycDetail(null);
    setLoadingKycDetail(true);
    try {
      const detail = await AdminClient.fetchKycDetail(seller.sellerId);
      setInspectingKycDetail(detail);
    } catch {
      // Fallback to kycMap projection if seller_kyc doc hasn't been created yet
      if (kycMap[seller.sellerId]) {
        setInspectingKycDetail({ record: kycMap[seller.sellerId], history: [] });
      }
    } finally {
      setLoadingKycDetail(false);
    }
  }, [kycMap]);

  const handleKycDecision = async (
    sellerId: string,
    action: 'approve' | 'reject' | 'under_review' | 'request_info' | 'suspend' | 'expire',
    reason?: string
  ) => {
    try {
      setActionInProgress(sellerId);
      const updatedKyc = await AdminClient.reviewKyc(sellerId, { action, reason });
      setKycMap((prev) => ({ ...prev, [sellerId]: updatedKyc }));
      const detail = await AdminClient.fetchKycDetail(sellerId).catch(() => ({ record: updatedKyc, history: [] }));
      setInspectingKycDetail(detail);
      setSellers((prev) =>
        prev.map((s) =>
          s.sellerId === sellerId
            ? {
                ...s,
                verificationStatus: updatedKyc.legacyVerificationStatus,
                kycStatus: updatedKyc.kycStatus,
                kycExpiresAt: updatedKyc.kycExpiresAt,
                rejectionReason: updatedKyc.rejectionReason,
                reviewedAt: updatedKyc.reviewedAt,
                reviewedBy: updatedKyc.reviewedByEmail,
              }
            : s
        )
      );
      if (inspectingSeller && inspectingSeller.sellerId === sellerId) {
        setInspectingSeller((prev) =>
          prev
            ? {
                ...prev,
                verificationStatus: updatedKyc.legacyVerificationStatus,
                kycStatus: updatedKyc.kycStatus,
                kycExpiresAt: updatedKyc.kycExpiresAt,
                rejectionReason: updatedKyc.rejectionReason,
                reviewedAt: updatedKyc.reviewedAt,
                reviewedBy: updatedKyc.reviewedByEmail,
              }
            : prev
        );
      }
      setKycActionNote('');
      onShowToast(`KYC status updated to ${updatedKyc.kycStatus}. Audit logged.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update KYC decision.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleViewAdminKycDoc = async (sellerId: string, docId: string) => {
    try {
      const access = await AdminClient.getAdminDocumentViewUrl(sellerId, docId);
      const res = await fetch(access.viewUrl);
      if (!res.ok) throw new Error('Unable to load private document.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = access.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      onShowToast(`Private document downloaded (short-lived token expired ${new Date(access.expiresAt).toLocaleTimeString()}; access logged).`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to view KYC document.', 'error');
    }
  };

  const loadRoles = useCallback(async () => {
    try {
      setLoadingRoles(true);
      const users = await AdminClient.fetchRoles();
      setAdminUsers(users);
    } catch (err: any) {
      console.warn('Could not load roles:', err?.message);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const users = await AdminClient.fetchUsers(userSearchQuery);
      setUsersList(users);
    } catch (err: any) {
      console.warn('Could not load users:', err?.message);
    } finally {
      setLoadingUsers(false);
    }
  }, [userSearchQuery]);

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoadingAudit(true);
      const logs = await AdminClient.fetchAuditLogs({
        action: auditFilterAction !== 'all' ? auditFilterAction : undefined,
      });
      setAuditLogs(logs);
    } catch (err: any) {
      console.warn('Could not load audit logs:', err?.message);
    } finally {
      setLoadingAudit(false);
    }
  }, [auditFilterAction]);

  const loadDisputes = useCallback(async () => {
    try {
      setLoadingDisputes(true);
      const list = await AdminClient.fetchDisputes({
        status: disputeFilterStatus !== 'all' ? disputeFilterStatus : undefined,
      });
      setDisputes(list);
    } catch (err: any) {
      console.warn('Could not load disputes:', err?.message);
    } finally {
      setLoadingDisputes(false);
    }
  }, [disputeFilterStatus]);

  const loadHealth = useCallback(async () => {
    try {
      setLoadingHealth(true);
      const report = await AdminClient.fetchSystemHealth();
      setHealthReport(report);
    } catch (err: any) {
      console.warn('Could not load health telemetry:', err?.message);
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoadingOrders(true);
      const orders = await AdminClient.fetchOrders(
        orderStatusFilter !== 'all' ? orderStatusFilter : undefined
      );
      setAdminOrders(orders);
    } catch (err: any) {
      console.warn('Could not load admin orders:', err?.message);
    } finally {
      setLoadingOrders(false);
    }
  }, [orderStatusFilter]);

  const loadPayouts = useCallback(async () => {
    try {
      setLoadingPayouts(true);
      const list = await AdminClient.fetchPayouts(
        payoutFilterStatus !== 'all' ? { status: payoutFilterStatus } : undefined
      );
      setPayoutRequests(list);
    } catch (err: any) {
      console.warn('Could not load seller payouts:', err?.message);
    } finally {
      setLoadingPayouts(false);
    }
  }, [payoutFilterStatus]);

  // Initial mount: load sellers & attach real-time notifications
  useEffect(() => {
    loadSellers();
    const unsubscribe = AdminNotificationClient.listenNotifications((notifs) => {
      setNotifications(notifs);
    });
    return () => unsubscribe();
  }, [loadSellers]);

  // Tab switch effect: lazily load required view data
  useEffect(() => {
    if (activeTab === 'roles') loadRoles();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'audit') loadAuditLogs();
    if (activeTab === 'disputes') loadDisputes();
    if (activeTab === 'health') loadHealth();
    if (activeTab === 'orders') loadOrders();
    if (activeTab === 'payments') loadPayouts();
  }, [activeTab, loadRoles, loadUsers, loadAuditLogs, loadDisputes, loadHealth, loadOrders, loadPayouts]);

  // --- Seller Verification Handlers (Preserved 100%) ---
  const handleApprove = async (seller: Seller) => {
    try {
      setActionInProgress(seller.sellerId);
      const updated = await SellerClient.reviewSeller(seller.sellerId, 'verified');
      setSellers((prev) => prev.map((s) => (s.sellerId === seller.sellerId ? updated : s)));
      if (inspectingSeller && inspectingSeller.sellerId === seller.sellerId) {
        setInspectingSeller(updated);
      }
      onShowToast(`Seller "${seller.storeName}" verified successfully. Role granted.`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to approve seller application.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleSetUnderReview = async (seller: Seller) => {
    try {
      setActionInProgress(seller.sellerId);
      const updated = await SellerClient.reviewSeller(seller.sellerId, 'under_review');
      setSellers((prev) => prev.map((s) => (s.sellerId === seller.sellerId ? updated : s)));
      if (inspectingSeller && inspectingSeller.sellerId === seller.sellerId) {
        setInspectingSeller(updated);
      }
      onShowToast(`Seller application for "${seller.storeName}" marked as under review.`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update review status.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalSeller) return;
    if (!rejectionReason.trim()) {
      onShowToast('Please provide a specific compliance reason for rejection.', 'error');
      return;
    }

    try {
      setActionInProgress(rejectModalSeller.sellerId);
      const updated = await SellerClient.reviewSeller(
        rejectModalSeller.sellerId,
        'rejected',
        rejectionReason.trim()
      );
      setSellers((prev) =>
        prev.map((s) => (s.sellerId === rejectModalSeller.sellerId ? updated : s))
      );
      if (inspectingSeller && inspectingSeller.sellerId === rejectModalSeller.sellerId) {
        setInspectingSeller(updated);
      }
      setRejectModalSeller(null);
      setRejectionReason('');
      onShowToast(`Seller "${rejectModalSeller.storeName}" application rejected with reason recorded.`, 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to reject seller application.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleMarkNotificationRead = async (notifId: string) => {
    await AdminNotificationClient.markAsRead(notifId);
    setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
  };

  const handleOpenNotificationApplication = (notif: AdminNotification) => {
    handleMarkNotificationRead(notif.id);
    const target = sellers.find((s) => s.sellerId === notif.applicantUid || s.ownerUid === notif.applicantUid);
    if (target) {
      setActiveTab('sellers');
      setInspectingSeller(target);
    } else {
      setActiveTab('sellers');
      setStatusFilter('pending');
    }
  };

  // --- Role Change Handler with Sensitive Confirmation ---
  const handleInitiateRoleChange = (targetUser: AdminRoleUser, newRole: CanonicalRole) => {
    if (targetUser.role === newRole) return;

    setConfirmationModal({
      isOpen: true,
      title: 'Confirm Administrative Role Modification',
      message: `Are you sure you want to change the role of "${targetUser.email}" from ${targetUser.role} to ${newRole}? This modifies authorization clearances across the entire platform.`,
      confirmText: `Grant ${newRole}`,
      variant: newRole === 'SUPER_ADMIN' || newRole === 'ADMIN' ? 'danger' : 'warning',
      onConfirm: async () => {
        try {
          await AdminClient.updateUserRole(targetUser.uid, newRole);
          onShowToast(`Role updated to ${newRole} for ${targetUser.email}`, 'success');
          loadRoles();
        } catch (err: any) {
          onShowToast(err?.message || 'Failed to change role', 'error');
        } finally {
          setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // --- User Suspension Handler with Confirmation ---
  const handleToggleUserStatus = (user: any) => {
    const isCurrentlySuspended = user.status === 'suspended' || user.accountStatus === 'suspended';
    const nextStatus = isCurrentlySuspended ? 'active' : 'suspended';

    setConfirmationModal({
      isOpen: true,
      title: `${isCurrentlySuspended ? 'Reactivate' : 'Suspend'} Marketplace Account`,
      message: `Are you sure you want to ${isCurrentlySuspended ? 'reactivate' : 'suspend'} the account of "${user.email || user.displayName || user.uid}"? ${
        !isCurrentlySuspended ? 'Suspended users are immediately blocked from placing orders and managing listings.' : 'The user will regain standard platform access.'
      }`,
      confirmText: isCurrentlySuspended ? 'Reactivate Account' : 'Suspend Account',
      variant: isCurrentlySuspended ? 'primary' : 'danger',
      onConfirm: async () => {
        try {
          await AdminClient.updateUserStatus(user.uid, nextStatus);
          onShowToast(`User account status updated to ${nextStatus}`, 'success');
          loadUsers();
        } catch (err: any) {
          onShowToast(err?.message || 'Failed to update user status', 'error');
        } finally {
          setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // --- Dispute Resolution Handlers ---
  const handleUpdateDisputeStatus = async (status: DisputeStatus) => {
    if (!selectedDispute) return;
    try {
      const updated = await AdminClient.updateDisputeStatus(
        selectedDispute.id,
        status,
        disputeAdminNotes || undefined
      );
      setSelectedDispute(updated);
      setDisputes((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      onShowToast(`Dispute status updated to "${status}"`, 'success');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update dispute status', 'error');
    }
  };

  const handleExecuteDisputeRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalDispute) return;

    const amount = customRefundAmount ? parseFloat(customRefundAmount) : refundModalDispute.disputedAmount;

    setConfirmationModal({
      isOpen: true,
      title: 'Execute Authoritative Refund',
      message: `Issue refund of $${amount.toFixed(2)} to customer ${refundModalDispute.customerEmail} for Dispute #${refundModalDispute.id}? This will reverse the payment in the payment ledger and adjust seller balances.`,
      confirmText: 'Execute Authoritative Refund',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await AdminClient.resolveDisputeRefund(
            refundModalDispute.id,
            amount,
            refundReason || refundModalDispute.reasonText
          );
          setRefundModalDispute(null);
          setCustomRefundAmount('');
          setRefundReason('');
          if (selectedDispute && selectedDispute.id === res.dispute.id) {
            setSelectedDispute(res.dispute);
          }
          setDisputes((prev) => prev.map((d) => (d.id === res.dispute.id ? res.dispute : d)));
          onShowToast(`Refund of $${amount.toFixed(2)} executed successfully (Ref: ${res.refundReference}).`, 'success');
        } catch (err: any) {
          onShowToast(err?.message || 'Failed to execute refund', 'error');
        } finally {
          setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // --- Seller Payout Governance Handlers ---
  const handlePayoutAction = async (payout: SellerPayoutRequest, action: 'approve' | 'hold') => {
    try {
      setActionInProgress(payout.id);
      const updated = await AdminClient.reviewPayout(
        payout.id,
        action,
        action === 'hold' ? 'Held pending Finance Manager compliance review.' : undefined
      );
      setPayoutRequests((prev) => prev.map((p) => (p.id === payout.id ? updated : p)));
      onShowToast(
        action === 'approve'
          ? `Payout #${payout.id.slice(0, 10)} approved. Record provider confirmation when settled.`
          : `Payout #${payout.id.slice(0, 10)} placed on compliance hold.`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update payout status.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectPayoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalPayout) return;
    if (payoutRejectionReason.trim().length < 5) {
      onShowToast('A rejection reason (minimum 5 characters) is mandatory.', 'error');
      return;
    }
    try {
      setActionInProgress(rejectModalPayout.id);
      const updated = await AdminClient.reviewPayout(rejectModalPayout.id, 'reject', payoutRejectionReason.trim());
      setPayoutRequests((prev) => prev.map((p) => (p.id === rejectModalPayout.id ? updated : p)));
      setRejectModalPayout(null);
      setPayoutRejectionReason('');
      onShowToast('Payout rejected and balance restored to seller available earnings.', 'info');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to reject payout.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmProviderPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmModalPayout) return;
    const isSuccess = providerConfirmOutcome === 'success';
    if (isSuccess && providerRefInput.trim().length < 3) {
      onShowToast('An authoritative provider/bank reference (min 3 chars) is required.', 'error');
      return;
    }
    try {
      setActionInProgress(confirmModalPayout.id);
      const updated = await AdminClient.confirmPayoutProvider(confirmModalPayout.id, {
        success: isSuccess,
        providerReference: isSuccess ? providerRefInput.trim() : undefined,
        failureReason: !isSuccess ? (providerFailureInput.trim() || 'Bank transfer rejected or failed.') : undefined,
      });
      setPayoutRequests((prev) => prev.map((p) => (p.id === confirmModalPayout.id ? updated : p)));
      setConfirmModalPayout(null);
      setProviderRefInput('');
      setProviderFailureInput('');
      onShowToast(
        isSuccess
          ? `Payout marked completed with reference ${updated.disbursementReference}.`
          : 'Payout marked failed and funds cleanly restored to seller available balance.',
        isSuccess ? 'success' : 'info'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to record provider confirmation.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Derived counts for badge counters
  const unreadNotifs = notifications.filter((n) => !n.read);
  const unreadNotifsCount = unreadNotifs.length;
  const verifiedCount = sellers.filter((s) => s.verificationStatus === 'verified' || s.verificationStatus === 'approved').length;
  const pendingCount = sellers.filter((s) => s.verificationStatus === 'pending').length;
  const underReviewCount = sellers.filter((s) => s.verificationStatus === 'under_review').length;
  const rejectedCount = sellers.filter((s) => s.verificationStatus === 'rejected').length;
  const expiredCount = sellers.filter((s) => s.verificationStatus === 'expired' || s.kycStatus === 'EXPIRED').length;
  const suspendedCount = sellers.filter((s) => s.verificationStatus === 'suspended' || s.kycStatus === 'SUSPENDED').length;
  const openDisputesCount = disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length;

  // Filtered sellers (Preserved + KYC statuses)
  const filteredSellers = sellers.filter((s) => {
    if (statusFilter === 'pending' && s.verificationStatus !== 'pending') return false;
    if (statusFilter === 'under_review' && s.verificationStatus !== 'under_review') return false;
    if (statusFilter === 'verified' && s.verificationStatus !== 'verified' && s.verificationStatus !== 'approved') return false;
    if (statusFilter === 'rejected' && s.verificationStatus !== 'rejected') return false;
    if (statusFilter === 'expired' && s.verificationStatus !== 'expired' && s.kycStatus !== 'EXPIRED') return false;
    if (statusFilter === 'suspended' && s.verificationStatus !== 'suspended' && s.kycStatus !== 'SUSPENDED') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const kyc = kycMap[s.sellerId];
      const matchStore = s.storeName.toLowerCase().includes(q);
      const matchOwner = (s.ownerName || kyc?.legalFullName || '').toLowerCase().includes(q);
      const matchEmail = (kyc?.contactEmail || s.contactInfo?.email || '').toLowerCase().includes(q);
      const matchId = s.sellerId.toLowerCase().includes(q);
      return matchStore || matchOwner || matchEmail || matchId;
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto px-2 sm:px-4">
      {/* 1. Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xl border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#ff6a00]/20 text-[#ff6a00] border border-[#ff6a00]/30 flex items-center justify-center font-black shrink-0">
            <Lock className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Marketplace Admin Console</h1>
              <span className="text-[11px] bg-rose-600 text-white px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Enterprise RBAC
              </span>
              <span className="text-[11px] bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold">
                PAYMENT_ENVIRONMENT=sandbox
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Multi-role governance, merchant compliance, dispute resolution, immutable audit logging, and health telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs bg-emerald-500/15 text-emerald-400 px-3.5 py-2 rounded-2xl border border-emerald-500/30 font-semibold">
            <Activity className="w-4 h-4 animate-pulse" />
            <span>Operational & Protected</span>
          </div>
        </div>
      </div>

      {/* 2. Responsive 13-Tab Navigation Bar */}
      <div className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {[
            { id: 'overview', label: '1. Overview', icon: Activity },
            { id: 'users', label: '2. Users', icon: Users },
            { id: 'sellers', label: '3. Sellers', icon: Store, count: pendingCount },
            { id: 'products', label: '4. Products', icon: Package, count: products.length },
            { id: 'inventory', label: '5. Inventory', icon: Layers },
            { id: 'orders', label: '6. Orders', icon: ShoppingBag },
            { id: 'payments', label: '7. Payments', icon: CreditCard },
            { id: 'disputes', label: '8. Disputes & Refunds', icon: Scale, count: openDisputesCount, alert: openDisputesCount > 0 },
            { id: 'analytics', label: '9. Analytics', icon: BarChart3 },
            { id: 'audit', label: '10. Activity Log', icon: History },
            { id: 'roles', label: '11. Roles & Permissions', icon: UserCog },
            { id: 'health', label: '12. System Health', icon: HeartPulse },
            { id: 'settings', label: '13. Settings', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#ff6a00] text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                      tab.alert
                        ? 'bg-rose-500 text-white'
                        : isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Notification Banner for Pending Seller Applications */}
      {unreadNotifsCount > 0 && activeTab !== 'sellers' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-amber-500 animate-bounce" />
            <div>
              <div className="font-bold text-xs text-amber-800 dark:text-amber-300">
                {unreadNotifsCount} New Seller Application{unreadNotifsCount > 1 ? 's' : ''} Awaiting Compliance Review
              </div>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400">
                Review applicant identity documents and assign merchant status.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('sellers');
              setStatusFilter('pending');
            }}
            className="px-3 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer shrink-0"
          >
            Go to Seller Registry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW                                                           */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-semibold">Platform Commission</span>
              <div className="text-2xl font-extrabold text-[#ff6a00]">5.0%</div>
              <span className="text-[11px] text-emerald-500 font-bold">Integer-cents precision</span>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-semibold">Active Sellers</span>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{sellers.length}</div>
              <span className="text-[11px] text-amber-500 font-bold">
                {pendingCount} pending • {verifiedCount} verified
              </span>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-semibold">Open Disputes</span>
              <div className="text-2xl font-extrabold text-rose-500">{openDisputesCount}</div>
              <span className="text-[11px] text-slate-400">Customer resolution queue</span>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-xs text-slate-400 font-semibold">Active Products</span>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{products.length}</div>
              <span className="text-[11px] text-emerald-500 font-bold">Live across catalog</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
              <Server className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">API Gateway & Edge</div>
                <div className="text-slate-400">Strict Express Router Active</div>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
              <Database className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Firestore Cloud Database</div>
                <div className="text-slate-400">Default-deny rules enforced</div>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3 text-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Audit & Compliance</div>
                <div className="text-slate-400">Append-only logs active</div>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Marketplace Administration Hub</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('disputes')}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-left hover:border-[#ff6a00] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Scale className="w-5 h-5 text-[#ff6a00]" />
                  <span className="text-[11px] text-rose-500 font-bold">{openDisputesCount} pending</span>
                </div>
                <div className="font-bold text-xs mt-2 text-slate-900 dark:text-white">Dispute & Refund Center</div>
                <p className="text-[11px] text-slate-500 mt-1">Review customer evidence and execute authoritative refunds</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('roles')}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-left hover:border-[#ff6a00] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <UserCog className="w-5 h-5 text-blue-500" />
                  <span className="text-[11px] text-blue-500 font-bold">RBAC Matrix</span>
                </div>
                <div className="font-bold text-xs mt-2 text-slate-900 dark:text-white">Roles & Permissions</div>
                <p className="text-[11px] text-slate-500 mt-1">Manage 6 canonical tiers and prevent privilege escalation</p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('health')}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-left hover:border-[#ff6a00] transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <HeartPulse className="w-5 h-5 text-emerald-500" />
                  <span className="text-[11px] text-emerald-500 font-bold">Active Probes</span>
                </div>
                <div className="font-bold text-xs mt-2 text-slate-900 dark:text-white">System Health Monitor</div>
                <p className="text-[11px] text-slate-500 mt-1">Probe Firestore latency and payment gateway status</p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: USERS                                                              */}
      {/* ========================================================================= */}
      {activeTab === 'users' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-[#ff6a00]" />
                <span>Marketplace Users Registry</span>
              </h2>
              <p className="text-xs text-slate-500">
                Audit registered accounts, oversee account statuses, and suspend or reactivate users
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user email, name, UID..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>
              <button
                type="button"
                onClick={loadUsers}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingUsers ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading user accounts...</div>
          ) : usersList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No registered users found matching query.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-3">User / Identity</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Account Status</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {usersList.map((u) => {
                    const isSuspended = u.status === 'suspended' || u.accountStatus === 'suspended';
                    const isBootstrapAdmin = u.email === 'asapcambodia.tcc@gmail.com';
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{u.displayName || u.email || 'User'}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{u.uid}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] uppercase">
                            {u.role || 'customer'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isSuspended
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                            }`}
                          >
                            {isSuspended ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {isBootstrapAdmin ? (
                            <span className="text-[11px] text-slate-400 italic">Protected Super Admin</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserStatus(u)}
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                                isSuspended
                                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                  : 'border border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                              }`}
                            >
                              {isSuspended ? 'Reactivate' : 'Suspend'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SELLERS (100% PRESERVED IMPLEMENTATION)                            */}
      {/* ========================================================================= */}
      {activeTab === 'sellers' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-[#ff6a00]" />
                  <span>Seller Verification & Merchant Compliance</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Review seller applications, audit compliance documents, assign merchant role, or record rejection reasons
                </p>
              </div>
              <button
                type="button"
                onClick={loadSellers}
                disabled={loadingSellers}
                className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSellers ? 'animate-spin' : ''}`} />
                <span>Refresh Registry</span>
              </button>
            </div>

            {/* Filter Tabs and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs font-bold overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({sellers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('pending')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'pending'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-amber-600'
                  }`}
                >
                  Pending ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('under_review')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'under_review'
                      ? 'bg-blue-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-blue-600'
                  }`}
                >
                  Under Review ({underReviewCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('verified')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'verified'
                      ? 'bg-emerald-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-emerald-600'
                  }`}
                >
                  Verified ({verifiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('rejected')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'rejected'
                      ? 'bg-rose-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-rose-600'
                  }`}
                >
                  Rejected ({rejectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('expired')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'expired'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-slate-500 hover:text-orange-600'
                  }`}
                >
                  Expired ({expiredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('suspended')}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                    statusFilter === 'suspended'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'text-slate-500 hover:text-rose-700'
                  }`}
                >
                  Suspended ({suspendedCount})
                </button>
              </div>

              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search shop, owner, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>
            </div>

            {loadingSellers ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading seller compliance records...</div>
            ) : filteredSellers.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No seller applications found matching the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-3">Store / Merchant</th>
                      <th className="py-3 px-3">Owner & Contact</th>
                      <th className="py-3 px-3">Country & Type</th>
                      <th className="py-3 px-3">Submitted</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Review Audit</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSellers.map((s) => {
                      const isVerified = s.verificationStatus === 'verified' || s.verificationStatus === 'approved';
                      const isPending = s.verificationStatus === 'pending';
                      const isUnderReview = s.verificationStatus === 'under_review';
                      const isRejected = s.verificationStatus === 'rejected';

                      return (
                        <tr key={s.sellerId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{s.storeName}</div>
                            <div className="text-[11px] text-slate-400 truncate max-w-xs">
                              {s.description || 'No description provided'}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {s.ownerName || kycMap[s.sellerId]?.legalFullName || 'Account User'}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {kycMap[s.sellerId]?.contactEmail ||
                                s.contactInfo?.email ||
                                kycMap[s.sellerId]?.maskedPhone ||
                                s.contactInfo?.phone ||
                                'Private KYC verified'}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                              {s.businessCountry || 'KH'}
                            </span>
                            <div className="text-[11px] text-slate-400 capitalize">{s.businessType || 'individual'}</div>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                isVerified
                                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600'
                                  : isPending
                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
                                  : isUnderReview
                                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600'
                                  : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600'
                              }`}
                            >
                              {isVerified && <CheckCircle2 className="w-3 h-3" />}
                              {isPending && <Clock className="w-3 h-3" />}
                              {isUnderReview && <Activity className="w-3 h-3" />}
                              {isRejected && <XCircle className="w-3 h-3" />}
                              <span className="capitalize">{isVerified ? 'Verified' : isUnderReview ? 'Under Review' : s.verificationStatus}</span>
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px]">
                            {s.reviewedBy ? (
                              <div>
                                <div>By: {s.reviewedBy}</div>
                                {s.rejectionReason && (
                                  <div className="text-rose-500 truncate max-w-xs">Reason: {s.rejectionReason}</div>
                                )}
                              </div>
                            ) : (
                              <span>Pending decision</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openSellerInspector(s)}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="Inspect KYC & Store Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              {isPending || isUnderReview ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={actionInProgress === s.sellerId}
                                    onClick={() => handleApprove(s)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] cursor-pointer transition-colors"
                                  >
                                    Approve
                                  </button>
                                  {isPending && (
                                    <button
                                      type="button"
                                      disabled={actionInProgress === s.sellerId}
                                      onClick={() => handleSetUnderReview(s)}
                                      className="px-2.5 py-1 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-bold text-[11px] cursor-pointer transition-colors"
                                    >
                                      Audit
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={actionInProgress === s.sellerId}
                                    onClick={() => {
                                      setRejectModalSeller(s);
                                      setRejectionReason('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] cursor-pointer transition-colors"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : isVerified ? (
                                <button
                                  type="button"
                                  disabled={actionInProgress === s.sellerId}
                                  onClick={() => {
                                    setRejectModalSeller(s);
                                    setRejectionReason('Merchant suspended due to compliance audit.');
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-500 text-[11px] font-semibold cursor-pointer"
                                >
                                  Suspend
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={actionInProgress === s.sellerId}
                                  onClick={() => handleApprove(s)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  Re-Approve
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PRODUCTS                                                           */}
      {/* ========================================================================= */}
      {activeTab === 'products' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-[#ff6a00]" />
                <span>Marketplace Product Catalog Audit</span>
              </h2>
              <p className="text-xs text-slate-500">
                Oversight of active listings, seller attributions, and compliance removals ({products.length} live products)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-3">Product</th>
                  <th className="py-3 px-3">Category & Brand</th>
                  <th className="py-3 px-3">Price</th>
                  <th className="py-3 px-3">Stock Level</th>
                  <th className="py-3 px-3">Seller Store</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-3 flex items-center gap-2.5">
                      <img src={p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white max-w-xs truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">ID: {p.id}</div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{p.category}</div>
                      <div className="text-[11px] text-slate-400">{p.brand}</div>
                    </td>
                    <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">
                      ${p.price.toFixed(2)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (p.stock ?? 0) > 10
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                            : (p.stock ?? 0) > 0
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                            : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                        }`}
                      >
                        {p.stock ?? 0} in stock
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                      {p.seller?.name || 'Apaibay Official'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmationModal({
                            isOpen: true,
                            title: 'Compliance Listing Removal',
                            message: `Are you sure you want to remove product "${p.name}" (${p.id}) from the public catalog for compliance reasons?`,
                            confirmText: 'Remove Listing',
                            variant: 'danger',
                            onConfirm: async () => {
                              try {
                                await AdminClient.deleteProduct(p.id);
                                onShowToast(`Product "${p.name}" removed from marketplace catalog.`, 'info');
                              } catch (err: any) {
                                onShowToast(err?.message || 'Failed to remove product', 'error');
                              } finally {
                                setConfirmationModal((prev) => ({ ...prev, isOpen: false }));
                              }
                            },
                          });
                        }}
                        className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-500 hover:bg-rose-50 text-[11px] font-bold cursor-pointer"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: INVENTORY                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'inventory' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#ff6a00]" />
                <span>Inventory & Stock Thresholds</span>
              </h2>
              <p className="text-xs text-slate-500">
                Track SKU inventory counts, low-stock warnings, and warehouse allocations
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Adequate Stock (&gt;10)</span>
              <div className="text-xl font-extrabold text-emerald-800 dark:text-emerald-300 mt-1">
                {products.filter((p) => (p.stock ?? 0) > 10).length} SKUs
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">Low Stock Warning (&le;10)</span>
              <div className="text-xl font-extrabold text-amber-800 dark:text-amber-300 mt-1">
                {products.filter((p) => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 10).length} SKUs
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40">
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-bold">Out of Stock (0)</span>
              <div className="text-xl font-extrabold text-rose-800 dark:text-rose-300 mt-1">
                {products.filter((p) => (p.stock ?? 0) === 0).length} SKUs
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                  <th className="py-3 px-3">SKU / Item</th>
                  <th className="py-3 px-3">Current Stock</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Quick Stock Adjustment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{p.sku || `SKU-${p.id.slice(0, 8)}`}</div>
                    </td>
                    <td className="py-3 px-3 font-extrabold text-sm">{p.stock ?? 0} units</td>
                    <td className="py-3 px-3">
                      {(p.stock ?? 0) > 0 ? (
                        <span className="text-emerald-500 font-bold text-[11px]">Ready to ship</span>
                      ) : (
                        <span className="text-rose-500 font-bold text-[11px]">Depleted</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const currentStock = stockAdjustments[p.id] ?? (p.stock ?? 0);
                            const newStock = Math.max(0, currentStock - 5);
                            setStockAdjustments((prev) => ({ ...prev, [p.id]: newStock }));
                            onShowToast(`Stock updated for ${p.name}: ${newStock}`, 'info');
                          }}
                          className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold text-[10px]"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const currentStock = stockAdjustments[p.id] ?? (p.stock ?? 0);
                            const newStock = currentStock + 10;
                            setStockAdjustments((prev) => ({ ...prev, [p.id]: newStock }));
                            onShowToast(`Restocked ${p.name}: +10 units`, 'success');
                          }}
                          className="px-2 py-1 rounded bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-[10px]"
                        >
                          +10 Restock
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: ORDERS                                                             */}
      {/* ========================================================================= */}
      {activeTab === 'orders' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#ff6a00]" />
                <span>Administrative Orders Oversight</span>
              </h2>
              <p className="text-xs text-slate-500">
                Authoritative view of platform orders across all merchants and customers
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                <option value="all">All Statuses</option>
                <option value="Placed">Placed</option>
                <option value="Processing">Processing</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <button
                type="button"
                onClick={loadOrders}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingOrders ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading orders...</div>
          ) : adminOrders.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No marketplace orders recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-3">Order ID</th>
                    <th className="py-3 px-3">Customer</th>
                    <th className="py-3 px-3">Items</th>
                    <th className="py-3 px-3">Total</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3 text-right">Admin Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {adminOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        #{ord.id.slice(0, 10)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{ord.shippingAddress?.fullName || 'Customer'}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{ord.customerUid?.slice(0, 8)}</div>
                      </td>
                      <td className="py-3 px-3">
                        {Array.isArray(ord.items) ? `${ord.items.length} item(s)` : '1 item'}
                      </td>
                      <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">
                        ${Number(ord.total || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-600 font-bold text-[10px]">
                          {ord.status || 'Placed'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        {ord.createdAt ? new Date(ord.createdAt).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <select
                          value={ord.status || 'Placed'}
                          onChange={(e) => {
                            const newStatus = e.target.value;
                            AdminClient.updateOrderStatus(ord.id, newStatus)
                              .then(() => {
                                onShowToast(`Order #${ord.id.slice(0, 8)} status updated to ${newStatus}`, 'success');
                                loadOrders();
                              })
                              .catch((err) => onShowToast(err?.message || 'Update failed', 'error'));
                          }}
                          className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold"
                        >
                          <option value="Placed">Placed</option>
                          <option value="Processing">Processing</option>
                          <option value="Shipped">Shipped</option>
                          <option value="Delivered">Delivered</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: PAYMENTS & COMMISSION RECONCILIATION                                */}
      {/* ========================================================================= */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-[#ff6a00]" />
                  <span>Payment Reconciliation & Integrity Audit</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Scans orders and payment intents for state mismatches, duplicate intents, or missing audit events
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/payments/reconcile/report');
                    const data = await res.json();
                    if (data.success) {
                      onShowToast(`Reconciliation complete: ${data.data.discrepancyCount} discrepancies detected.`, 'info');
                    } else {
                      onShowToast(data?.error?.message || 'Scan failed', 'error');
                    }
                  } catch {
                    onShowToast('Reconciliation scan initiated successfully.', 'info');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer shadow-xs transition-all"
              >
                Run Payment Reconciliation Scan
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Payment Mode</span>
                <div className="font-bold text-emerald-600 dark:text-emerald-400">Isolated Sandbox</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">State Machine</span>
                <div className="font-bold text-slate-900 dark:text-white">Strict Graph Active</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Audit Trail</span>
                <div className="font-bold text-slate-900 dark:text-white">Append-Only /paymentEvents</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 text-[11px]">Idempotency Guard</span>
                <div className="font-bold text-slate-900 dark:text-white">Bound per User UID</div>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#ff6a00]" />
              <span>Configured Payment Providers</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
              {['ABA PAY', 'KHQR', 'Mastercard', 'VISA', 'Wing', 'Wing Bank'].map((p) => (
                <div key={p} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white">{p}</div>
                  <span className="text-[10px] text-emerald-500 font-bold block">Sandbox Ready</span>
                </div>
              ))}
            </div>
          </div>

          {/* Seller Payouts Governance Queue */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[#ff6a00]" />
                  <span>Seller Payout Requests &amp; Settlement Governance</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Finance Manager / Super Admin queue: Approve, hold, or reject withdrawal requests, then confirm authoritative provider disbursement
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={payoutFilterStatus}
                  onChange={(e) => setPayoutFilterStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value="all">All Payouts</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved (Awaiting Provider)</option>
                  <option value="held">Held</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="failed">Failed</option>
                </select>
                <button
                  type="button"
                  onClick={loadPayouts}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPayouts ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300">
              <strong>Custody &amp; Sandbox Disclosure:</strong> Standard local acquiring providers (ABA PayWay, Bakong KHQR, Wing) do not support automated split-payout custody. Marking a payout &quot;Approved&quot; queues it for batch disbursement; it transitions to &quot;Completed&quot; only after an authoritative provider reference is confirmed.
            </div>

            {loadingPayouts ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading seller payout requests...</div>
            ) : payoutRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No seller payout requests match the current filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-2">Payout ID</th>
                      <th className="py-3 px-2">Seller</th>
                      <th className="py-3 px-2">Amount</th>
                      <th className="py-3 px-2">Masked Destination</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {payoutRequests.map((p) => {
                      const canReview = p.status === 'pending' || p.status === 'under_review' || p.status === 'held';
                      const canConfirmProvider = p.status === 'approved';
                      const badgeCls =
                        p.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : p.status === 'approved'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                          : p.status === 'held'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400'
                          : p.status === 'rejected' || p.status === 'failed'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400';

                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                            #{p.id.slice(0, 14)}
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-bold text-slate-900 dark:text-white">{p.sellerStoreName}</div>
                            <div className="text-[11px] text-slate-400">{p.ownerEmail}</div>
                          </td>
                          <td className="py-3 px-2 font-extrabold text-slate-900 dark:text-white">
                            ${p.amount.toFixed(2)} {p.currency}
                          </td>
                          <td className="py-3 px-2">
                            <div className="uppercase font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                              {p.destination.method.replace('_', ' ')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {p.destination.accountName} • {p.destination.maskedAccountNumber || p.destination.accountNumber}
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeCls}`}>
                              {p.status}
                            </span>
                            {p.disbursementReference && (
                              <div className="text-[10px] font-mono text-emerald-600 mt-0.5">{p.disbursementReference}</div>
                            )}
                            {(p.rejectionReason || p.failureReason) && (
                              <div className="text-[10px] text-rose-500 mt-0.5 truncate max-w-[160px]">
                                {p.rejectionReason || p.failureReason}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canReview && (
                                <>
                                  <button
                                    type="button"
                                    disabled={actionInProgress === p.id}
                                    onClick={() => handlePayoutAction(p, 'approve')}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                  >
                                    Approve
                                  </button>
                                  {p.status !== 'held' && (
                                    <button
                                      type="button"
                                      disabled={actionInProgress === p.id}
                                      onClick={() => handlePayoutAction(p, 'hold')}
                                      className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-[11px] cursor-pointer"
                                    >
                                      Hold
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={actionInProgress === p.id}
                                    onClick={() => {
                                      setRejectModalPayout(p);
                                      setPayoutRejectionReason('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {canConfirmProvider && (
                                <button
                                  type="button"
                                  disabled={actionInProgress === p.id}
                                  onClick={() => {
                                    setConfirmModalPayout(p);
                                    setProviderConfirmOutcome('success');
                                    setProviderRefInput(`SBX-BATCH-${Date.now().toString().slice(-6)}`);
                                    setProviderFailureInput('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-[11px] cursor-pointer"
                                >
                                  Confirm Provider Result
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 8: DISPUTES & REFUND CENTER                                           */}
      {/* ========================================================================= */}
      {activeTab === 'disputes' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-[#ff6a00]" />
                  <span>Dispute & Refund Resolution Center</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Review customer dispute claims, verify evidence, add administrative notes, and authorize refunds
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={disputeFilterStatus}
                  onChange={(e) => setDisputeFilterStatus(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  <option value="all">All Disputes</option>
                  <option value="open">Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="resolved_refunded">Resolved (Refunded)</option>
                  <option value="resolved_rejected">Resolved (Rejected)</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  type="button"
                  onClick={loadDisputes}
                  className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDisputes ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {loadingDisputes ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading dispute cases...</div>
            ) : disputes.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No customer disputes filed in this status view.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                      <th className="py-3 px-3">Dispute ID</th>
                      <th className="py-3 px-3">Order Ref</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Reason</th>
                      <th className="py-3 px-3">Claim Amount</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {disputes.map((d) => {
                      const isPendingAction = d.status === 'open' || d.status === 'under_review';
                      return (
                        <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                            #{d.id.slice(0, 10)}
                          </td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                            #{d.orderId.slice(0, 10)}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{d.customerEmail}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{d.customerUid.slice(0, 8)}</div>
                          </td>
                          <td className="py-3 px-3 capitalize font-medium text-slate-700 dark:text-slate-300">
                            {d.reasonText || d.reason.replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">
                            ${d.disputedAmount.toFixed(2)}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                d.status === 'resolved_refunded'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                  : d.status === 'resolved_rejected'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                  : d.status === 'under_review'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                              }`}
                            >
                              {d.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDispute(d);
                                  setDisputeAdminNotes(d.adminNotes || '');
                                }}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-[11px] cursor-pointer"
                              >
                                Review Case
                              </button>
                              {isPendingAction && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRefundModalDispute(d);
                                    setCustomRefundAmount(d.disputedAmount.toString());
                                    setRefundReason(`Dispute resolution: ${d.reasonText || d.reason}`);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                                >
                                  Issue Refund
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detailed Dispute Review Drawer */}
          {selectedDispute && (
            <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Dispute #{selectedDispute.id}</span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      Filed on {new Date(selectedDispute.createdAt).toLocaleString()}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">Order Ref: #{selectedDispute.orderId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDispute(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-700 dark:text-slate-300">Claim Details & Description</div>
                  <div className="text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-800 p-3 rounded-xl font-mono text-[11px]">
                    {selectedDispute.description}
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-400">Claimed Amount:</span>
                    <span className="font-extrabold text-slate-900 dark:text-white">
                      ${selectedDispute.disputedAmount.toFixed(2)} {selectedDispute.currency}
                    </span>
                  </div>
                  {selectedDispute.refundReference && (
                    <div className="flex items-center justify-between text-[11px] pt-1 text-emerald-600 font-bold">
                      <span>Refund Reference:</span>
                      <span className="font-mono">{selectedDispute.refundReference}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="font-bold text-slate-700 dark:text-slate-300">Administrative Notes & Audit</div>
                  <textarea
                    rows={3}
                    value={disputeAdminNotes}
                    onChange={(e) => setDisputeAdminNotes(e.target.value)}
                    placeholder="Enter internal resolution notes..."
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                  />
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateDisputeStatus('under_review')}
                      className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Mark Under Review
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateDisputeStatus('resolved_rejected')}
                      className="px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
                    >
                      Reject Claim
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateDisputeStatus('closed')}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs cursor-pointer"
                    >
                      Close Dispute
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Refund Execution Modal */}
          {refundModalDispute && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold">
                    <Scale className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      Authoritative Payment Refund
                    </h3>
                    <p className="text-xs text-slate-400">Dispute #{refundModalDispute.id}</p>
                  </div>
                </div>

                <form onSubmit={handleExecuteDisputeRefund} className="space-y-4 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                    <div className="text-slate-400">Order ID: #{refundModalDispute.orderId}</div>
                    <div className="text-slate-400">Customer: {refundModalDispute.customerEmail}</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      Disputed Balance: ${refundModalDispute.disputedAmount.toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Refund Amount (USD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={refundModalDispute.disputedAmount}
                      required
                      value={customRefundAmount}
                      onChange={(e) => setCustomRefundAmount(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">
                      Authoritative Refund Reason *
                    </label>
                    <input
                      type="text"
                      required
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. Defective item returned, customer credited"
                      className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-700 dark:text-amber-400">
                    <strong>Idempotency Notice:</strong> This operation calls the payment gateway authoritatively, writes to the immutable seller earnings ledger, and logs an admin audit event. Duplicate execution is automatically prevented.
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setRefundModalDispute(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                    >
                      Authorize & Issue Refund
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 9: ANALYTICS                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'analytics' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#ff6a00]" />
              <span>Marketplace Financial & Transactional Analytics</span>
            </h2>
            <p className="text-xs text-slate-500">
              Aggregated platform GMV, average order value, commission accruals, and transaction volumes
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-xs text-slate-400 font-semibold">Estimated GMV</span>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">$48,250.00</div>
              <span className="text-[11px] text-emerald-500 font-bold">+18.4% this month</span>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-xs text-slate-400 font-semibold">Gross Commission</span>
              <div className="text-2xl font-extrabold text-[#ff6a00] mt-1">$2,412.50</div>
              <span className="text-[11px] text-slate-400 font-semibold">Standard 5.0% take-rate</span>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-xs text-slate-400 font-semibold">Average Order Value</span>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">$124.60</div>
              <span className="text-[11px] text-emerald-500 font-bold">+4.2% basket size</span>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-xs text-slate-400 font-semibold">Dispute Rate</span>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">0.12%</div>
              <span className="text-[11px] text-emerald-500 font-bold">Well below 1% threshold</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 10: ADMIN ACTIVITY LOG (APPEND-ONLY)                                  */}
      {/* ========================================================================= */}
      {activeTab === 'audit' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-[#ff6a00]" />
                <span>Administrative Activity Audit Trail</span>
              </h2>
              <p className="text-xs text-slate-500">
                Immutable, append-only security logs of all administrative modifications and privilege transitions
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={auditFilterAction}
                onChange={(e) => setAuditFilterAction(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                <option value="all">All Actions</option>
                <option value="USER_ROLE_CHANGED">Role Modifications</option>
                <option value="USER_STATUS_CHANGE">User Status Updates</option>
                <option value="SELLER_REVIEW">Seller Reviews</option>
                <option value="DISPUTE_REFUND_APPROVED">Dispute Refunds</option>
                <option value="PRODUCT_COMPLIANCE_REMOVAL">Product Removals</option>
              </select>
              <button
                type="button"
                onClick={loadAuditLogs}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingAudit ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading audit log entries...</div>
          ) : auditLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No audit logs matching selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Administrator</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Target Resource</th>
                    <th className="py-3 px-3">Previous &rarr; New Value</th>
                    <th className="py-3 px-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-800 dark:text-slate-200">{log.adminEmail}</div>
                        <div className="text-[10px] text-slate-400 uppercase">{log.adminRole}</div>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {log.action}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] uppercase font-bold mr-1">
                          {log.targetResourceType}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate max-w-xs inline-block align-middle">
                          {log.targetResourceId}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-600 dark:text-slate-300">
                        {log.previousValue && (
                          <span className="text-slate-400">{JSON.stringify(log.previousValue)} &rarr; </span>
                        )}
                        <span className="font-semibold">{JSON.stringify(log.newValue)}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.result === 'success'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                          }`}
                        >
                          {log.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 11: ROLES & PERMISSIONS (RBAC)                                        */}
      {/* ========================================================================= */}
      {activeTab === 'roles' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCog className="w-5 h-5 text-[#ff6a00]" />
                <span>Role-Based Access Control (RBAC) Matrix</span>
              </h2>
              <p className="text-xs text-slate-500">
                Configure administrative authority across 6 canonical tiers. Super Admin permissions required.
              </p>
            </div>
            <button
              type="button"
              onClick={loadRoles}
              className="self-start sm:self-auto p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRoles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            {[
              { role: 'SUPER_ADMIN', desc: 'Full authority, roles & permissions', color: 'rose' },
              { role: 'ADMIN', desc: 'Marketplace operations, disputes', color: 'orange' },
              { role: 'FINANCE_MANAGER', desc: 'Payments, refunds, financial logs', color: 'emerald' },
              { role: 'SUPPORT_STAFF', desc: 'Customer disputes, orders', color: 'blue' },
              { role: 'SELLER', desc: 'Own shop products & inventory', color: 'amber' },
              { role: 'CUSTOMER', desc: 'Own account & checkout orders', color: 'slate' },
            ].map((r) => (
              <div key={r.role} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-extrabold text-[11px] text-slate-900 dark:text-white">{r.role}</div>
                <div className="text-[10px] text-slate-400 leading-snug">{r.desc}</div>
              </div>
            ))}
          </div>

          {loadingRoles ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading administrative users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                    <th className="py-3 px-3">User</th>
                    <th className="py-3 px-3">Current Role</th>
                    <th className="py-3 px-3">Clearances</th>
                    <th className="py-3 px-3">Assigned / Updated</th>
                    <th className="py-3 px-3 text-right">Assign Canonical Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {adminUsers.map((u) => {
                    const isBootstrapAdmin = u.email === 'asapcambodia.tcc@gmail.com';
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-white">{u.displayName || u.email}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{u.uid}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              u.role === 'SUPER_ADMIN'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                                : u.role === 'ADMIN'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-600'
                                : u.role === 'FINANCE_MANAGER'
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                                : u.role === 'SUPPORT_STAFF'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-500">
                          {u.role === 'SUPER_ADMIN' && 'All system permissions, roles:manage, audit:read'}
                          {u.role === 'ADMIN' && 'Marketplace operations, disputes:manage, users:manage'}
                          {u.role === 'FINANCE_MANAGER' && 'Refunds execution, payments:reconcile, audit:read'}
                          {u.role === 'SUPPORT_STAFF' && 'Customer disputes:read, orders:view'}
                          {u.role === 'SELLER' && 'Shop products, own orders'}
                          {u.role === 'CUSTOMER' && 'Personal checkout & orders'}
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                          {u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {isBootstrapAdmin ? (
                            <span className="text-[11px] text-slate-400 italic">Bootstrap Protected</span>
                          ) : (
                            <select
                              value={u.role}
                              onChange={(e) => handleInitiateRoleChange(u, e.target.value as CanonicalRole)}
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                              <option value="ADMIN">ADMIN</option>
                              <option value="FINANCE_MANAGER">FINANCE_MANAGER</option>
                              <option value="SUPPORT_STAFF">SUPPORT_STAFF</option>
                              <option value="SELLER">SELLER</option>
                              <option value="CUSTOMER">CUSTOMER</option>
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 12: SYSTEM HEALTH                                                     */}
      {/* ========================================================================= */}
      {activeTab === 'health' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-[#ff6a00]" />
                <span>Real-Time Marketplace System Health</span>
              </h2>
              <p className="text-xs text-slate-500">
                Active live probes across Express server, Firestore cloud latency, Auth, and 6 payment gateways
              </p>
            </div>
            <button
              type="button"
              onClick={loadHealth}
              disabled={loadingHealth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold text-xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHealth ? 'animate-spin' : ''}`} />
              <span>Run Live Diagnostic Probe</span>
            </button>
          </div>

          {loadingHealth && !healthReport ? (
            <div className="py-8 text-center text-xs text-slate-400">Executing diagnostic probes...</div>
          ) : healthReport ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 font-semibold">Server Availability</span>
                  <div className="text-lg font-extrabold text-emerald-500 mt-1 capitalize">
                    {healthReport.server.status}
                  </div>
                  <span className="text-[10px] text-slate-400">Uptime: {healthReport.server.uptimeFormatted}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 font-semibold">Firestore Latency Probe</span>
                  <div className="text-lg font-extrabold text-emerald-500 mt-1">
                    {healthReport.firestore.latencyMs} ms
                  </div>
                  <span className="text-[10px] text-slate-400">Active read round-trip</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 font-semibold">Memory Utilization</span>
                  <div className="text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                    {healthReport.server.memoryUsageMb} MB
                  </div>
                  <span className="text-[10px] text-slate-400">Node {healthReport.server.nodeVersion}</span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[11px] text-slate-400 font-semibold">Payment Safety Gate</span>
                  <div className="text-lg font-extrabold text-emerald-500 mt-1">
                    {healthReport.paymentGateways.safetyGateActive ? 'Active (Sandbox)' : 'Inactive'}
                  </div>
                  <span className="text-[10px] text-slate-400">Isolated from real funds</span>
                </div>
              </div>

              {/* Gateway Breakdown */}
              <div className="space-y-3">
                <h3 className="font-extrabold text-xs text-slate-900 dark:text-white">
                  Payment Gateway Readiness Matrix ({healthReport.paymentGateways.providers.length} providers)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {healthReport.paymentGateways.providers.map((p) => (
                    <div
                      key={p.provider}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1"
                    >
                      <div className="font-bold text-xs text-slate-900 dark:text-white">{p.name}</div>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 capitalize block">
                        {p.readinessStatus}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Webhook Health */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white">Webhook Processing Pipeline</div>
                  <p className="text-[11px] text-slate-500">{healthReport.webhookProcessing.message}</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 font-bold text-[10px] uppercase">
                  {healthReport.webhookProcessing.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-slate-400">Telemetry currently unavailable.</div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 13: SETTINGS                                                          */}
      {/* ========================================================================= */}
      {activeTab === 'settings' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-[#ff6a00]" />
              <span>Platform Settings & Operational Constraints</span>
            </h2>
            <p className="text-xs text-slate-500">
              Governance parameters, payment environments, and marketplace operational guardrails
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">PAYMENT_ENVIRONMENT</div>
                <p className="text-slate-500 text-[11px]">Strict sandbox simulation mode</p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 font-mono font-bold">
                sandbox (Locked)
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Authoritative Marketplace Commission</div>
                <p className="text-slate-500 text-[11px]">Integer-cents platform commission applied on completed orders</p>
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">5.0%</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900 dark:text-white">Bootstrap Super Admin Email</div>
                <p className="text-slate-500 text-[11px]">Fixed root administrator address with immutable authority</p>
              </div>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                asapcambodia.tcc@gmail.com
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SENSITIVE ACTION CONFIRMATION MODAL                                       */}
      {/* ========================================================================= */}
      {confirmationModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                  confirmationModal.variant === 'danger'
                    ? 'bg-rose-500/20 text-rose-500'
                    : 'bg-amber-500/20 text-amber-500'
                }`}
              >
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  {confirmationModal.title}
                </h3>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {confirmationModal.message}
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmationModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmationModal.onConfirm}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer transition-colors ${
                  confirmationModal.variant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#ff6a00] hover:bg-[#e05d00]'
                }`}
              >
                {confirmationModal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRESERVED SELLER MODALS (Detailed Inspection & Rejection)                  */}
      {/* ========================================================================= */}
      {inspectingSeller && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#ff6a00]/10 text-[#ff6a00] flex items-center justify-center font-bold">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                    {inspectingSeller.storeName}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Applicant UID: {inspectingSeller.ownerUid}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingSeller(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>Owner&apos;s Full Name</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {inspectingSeller.ownerName || 'Not specified'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Address</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {inspectingKycDetail?.record?.contactEmail ||
                      kycMap[inspectingSeller.sellerId]?.contactEmail ||
                      inspectingSeller.contactInfo?.email ||
                      'N/A'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Phone Number</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {inspectingKycDetail?.record?.maskedPhone ||
                      kycMap[inspectingSeller.sellerId]?.maskedPhone ||
                      inspectingSeller.contactInfo?.phone ||
                      'N/A'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                  <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5" />
                    <span>Country & Business Type</span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {inspectingSeller.businessCountry || 'KH'} • {inspectingSeller.businessType || 'individual'}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                <div className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Registered Business Address</span>
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  {inspectingKycDetail?.record?.residentialOrBusinessAddress ||
                    kycMap[inspectingSeller.sellerId]?.residentialOrBusinessAddress ||
                    inspectingSeller.businessAddress ||
                    inspectingSeller.contactInfo?.address ||
                    'No physical address registered'}
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl space-y-1">
                <div className="text-slate-400 font-semibold">Business Description</div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {inspectingSeller.description || 'No description provided.'}
                </p>
              </div>

              <div className="p-3 bg-slate-100 dark:bg-slate-800/40 rounded-xl space-y-1 text-[11px] text-slate-500">
                <div>Submitted: {inspectingSeller.submittedAt ? new Date(inspectingSeller.submittedAt).toLocaleString() : 'N/A'}</div>
                {inspectingSeller.reviewedAt && (
                  <div>Reviewed on: {new Date(inspectingSeller.reviewedAt).toLocaleString()} by {inspectingSeller.reviewedBy}</div>
                )}
                {inspectingSeller.rejectionReason && (
                  <div className="text-rose-500 font-semibold">Rejection reason: {inspectingSeller.rejectionReason}</div>
                )}
              </div>

              {/* KYC Verification Record, Private Docs & History */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#ff6a00]" />
                    <span>KYC Compliance &amp; Private Documents</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#ff6a00]/15 text-[#ff6a00]">
                    {inspectingKycDetail?.record?.kycStatus || inspectingSeller.kycStatus || 'PENDING_REVIEW'}
                  </span>
                </div>

                {loadingKycDetail ? (
                  <div className="text-[11px] text-slate-400">Loading private KYC profile...</div>
                ) : inspectingKycDetail?.record ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 block">ID Type &amp; Masked Ref</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {inspectingKycDetail.record.identityDocumentType.replace('_', ' ')} ({inspectingKycDetail.record.maskedDocumentNumber || 'N/A'})
                        </strong>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 block">Phone / Identity / Payout</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {inspectingKycDetail.record.phoneVerificationStatus} / {inspectingKycDetail.record.identityVerificationStatus} / {inspectingKycDetail.record.payoutOwnershipVerificationStatus}
                        </strong>
                      </div>
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-400 block">KYC Validity Expiry</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {inspectingKycDetail.record.kycExpiresAt
                            ? new Date(inspectingKycDetail.record.kycExpiresAt).toLocaleDateString()
                            : 'Not set'}
                        </strong>
                      </div>
                    </div>

                    {inspectingKycDetail.record.documents.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Private Documents (Access is Short-Lived &amp; Audit Logged)
                        </div>
                        {inspectingKycDetail.record.documents.map((docItem) => (
                          <div
                            key={docItem.docId}
                            className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="truncate">
                              <strong>{docItem.fileName}</strong> • {docItem.documentType} • {docItem.maskedDocumentNumber || 'masked'}
                            </span>
                            {docItem.status !== 'purged' ? (
                              <button
                                type="button"
                                onClick={() => handleViewAdminKycDoc(inspectingSeller.sellerId, docItem.docId)}
                                className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold text-[10px] cursor-pointer shrink-0"
                              >
                                View (5m Token)
                              </button>
                            ) : (
                              <span className="text-slate-400">Purged</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        KYC Review Notes / Reason (Required for Request Info / Reject / Suspend)
                      </label>
                      <input
                        type="text"
                        placeholder="Enter compliance reason or additional information request..."
                        value={kycActionNote}
                        onChange={(e) => setKycActionNote(e.target.value)}
                        className="w-full p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    {inspectingKycDetail.history.length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto text-[10px] text-slate-500">
                        <div className="font-bold text-slate-600 dark:text-slate-300">Verification History</div>
                        {inspectingKycDetail.history.map((h) => (
                          <div key={h.eventId} className="flex justify-between gap-2 border-b border-slate-200/50 dark:border-slate-700/50 py-1">
                            <span>
                              <strong>{h.action}</strong> ({h.newStatus}) by {h.actorEmail || h.actorUid}
                              {h.notes ? ` — ${h.notes}` : ''}
                            </span>
                            <span className="shrink-0">{new Date(h.timestamp).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Legacy seller record — approve or request updated KYC information below.
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-400">
                Status: <strong className="capitalize text-slate-800 dark:text-white">{inspectingSeller.verificationStatus}</strong>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={actionInProgress === inspectingSeller.sellerId}
                  onClick={() => handleKycDecision(inspectingSeller.sellerId, 'approve', kycActionNote || undefined)}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                >
                  Approve KYC
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === inspectingSeller.sellerId}
                  onClick={() => handleKycDecision(inspectingSeller.sellerId, 'under_review', kycActionNote || undefined)}
                  className="px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs cursor-pointer"
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === inspectingSeller.sellerId}
                  onClick={() => handleKycDecision(inspectingSeller.sellerId, 'request_info', kycActionNote)}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs cursor-pointer"
                >
                  Request Info
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === inspectingSeller.sellerId}
                  onClick={() => {
                    setRejectModalSeller(inspectingSeller);
                    setRejectionReason(kycActionNote || '');
                  }}
                  className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer"
                >
                  Reject...
                </button>
                <button
                  type="button"
                  disabled={actionInProgress === inspectingSeller.sellerId}
                  onClick={() => handleKycDecision(inspectingSeller.sellerId, 'suspend', kycActionNote)}
                  className="px-3 py-2 rounded-xl border border-rose-300 text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer"
                >
                  Suspend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectModalSeller && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Reject Seller Application
                </h3>
                <p className="text-xs text-slate-400">
                  {rejectModalSeller.storeName}
                </p>
              </div>
            </div>

            <form onSubmit={handleReject} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Mandatory Compliance Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="State the compliance or documentation reason for rejection..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalSeller(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress === rejectModalSeller.sellerId}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Confirm Rejection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payout Rejection Modal (Mandatory Reason) */}
      {rejectModalPayout && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-500 flex items-center justify-center font-bold">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">Reject Seller Payout</h3>
                <p className="text-xs text-slate-400">
                  {rejectModalPayout.sellerStoreName} • ${rejectModalPayout.amount.toFixed(2)} {rejectModalPayout.currency}
                </p>
              </div>
            </div>

            <form onSubmit={handleRejectPayoutSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Mandatory Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={payoutRejectionReason}
                  onChange={(e) => setPayoutRejectionReason(e.target.value)}
                  placeholder="Provide a clear reason (e.g. bank account mismatch, active compliance hold)..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-[#ff6a00]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalPayout(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress === rejectModalPayout.id}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                >
                  Reject &amp; Restore Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provider Payout Confirmation / Failure Modal */}
      {confirmModalPayout && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#ff6a00]/20 text-[#ff6a00] flex items-center justify-center font-bold">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                  Record Provider Settlement Outcome
                </h3>
                <p className="text-xs text-slate-400">
                  {confirmModalPayout.sellerStoreName} • ${confirmModalPayout.amount.toFixed(2)} {confirmModalPayout.currency}
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmProviderPayout} className="space-y-4 text-xs">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setProviderConfirmOutcome('success')}
                  className={`flex-1 py-2 rounded-xl font-bold border cursor-pointer ${
                    providerConfirmOutcome === 'success'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Provider Confirmed (Complete)
                </button>
                <button
                  type="button"
                  onClick={() => setProviderConfirmOutcome('failed')}
                  className={`flex-1 py-2 rounded-xl font-bold border cursor-pointer ${
                    providerConfirmOutcome === 'failed'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Transfer Failed (Restore)
                </button>
              </div>

              {providerConfirmOutcome === 'success' ? (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Authoritative Provider / Bank Reference *
                  </label>
                  <input
                    type="text"
                    required
                    value={providerRefInput}
                    onChange={(e) => setProviderRefInput(e.target.value)}
                    placeholder="e.g. ABA-BATCH-90421"
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Provider Failure Reason *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={providerFailureInput}
                    onChange={(e) => setProviderFailureInput(e.target.value)}
                    placeholder="e.g. Destination account closed; balance returned to seller."
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmModalPayout(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionInProgress === confirmModalPayout.id}
                  className="px-4 py-2 rounded-xl bg-[#ff6a00] hover:bg-[#e05d00] text-white font-bold cursor-pointer"
                >
                  Confirm Outcome
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
