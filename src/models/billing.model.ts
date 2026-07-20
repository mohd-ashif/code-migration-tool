export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  trialDays: number;
  displayOrder: number;
  isPublic: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionFeature {
  id: string;
  planId: string;
  featureKey: string;
  featureValue: string;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  workspaceId: string;
  planId: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'unpaid' | 'suspended';
  billingCycle: 'monthly' | 'yearly';
  trialStart?: Date | null;
  trialEnd?: Date | null;
  startsAt: Date;
  expiresAt?: Date | null;
  cancelAt?: Date | null;
  renewAt?: Date | null;
  paymentProvider: 'razorpay' | string;
  providerSubscriptionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceSubscription {
  workspaceId: string;
  subscriptionId: string;
}

export interface PaymentMethod {
  id: string;
  workspaceId: string;
  provider: 'razorpay' | string;
  providerCustomerId?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  upiId?: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingAddress {
  workspaceId: string;
  companyName?: string | null;
  gstNumber?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  phone?: string | null;
  email?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  workspaceId: string;
  subscriptionId?: string | null;
  gateway: 'razorpay' | string;
  transactionId: string;
  orderId?: string | null;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | 'refunded' | 'authorized';
  paymentMethod?: string | null;
  invoiceId?: string | null;
  paidAt?: Date | null;
  createdAt: Date;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  invoiceNumber: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  total: number;
  currency: string;
  status: 'paid' | 'failed' | 'pending' | 'cancelled';
  pdfUrl?: string | null;
  billingDetails?: any | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  amount: number;
  createdAt: Date;
}

export interface Coupon {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  duration: 'once' | 'repeating' | 'forever';
  durationInMonths?: number | null;
  maxRedemptions?: number | null;
  timesRedeemed: number;
  expiresAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  workspaceId: string;
  subscriptionId?: string | null;
  redeemedAt: Date;
}

export interface UsageTracking {
  id: string;
  workspaceId: string;
  metric: 'migrations' | 'storage_bytes' | 'downloads' | 'reports' | 'ai_requests' | 'api_requests' | 'projects';
  value: number;
  limitValue?: number | null;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingLog {
  id: string;
  workspaceId?: string | null;
  action: string;
  details?: any | null;
  createdAt: Date;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId?: string | null;
  eventType: string;
  payload?: any | null;
  createdAt: Date;
}
