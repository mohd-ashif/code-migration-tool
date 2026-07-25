export interface CreateOrderParams {
  amount: number; // in INR / primary currency units
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface GatewayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export interface CreateSubscriptionParams {
  planId: string;
  customerId?: string;
  totalCount: number;
  quantity?: number;
  expireBy?: number;
  notes?: Record<string, string>;
}

export interface GatewaySubscription {
  id: string;
  shortUrl?: string;
  status: string;
  currentStart?: Date;
  currentEnd?: Date;
}

export interface VerifyPaymentParams {
  paymentId: string;
  orderId?: string;
  subscriptionId?: string;
  signature: string;
}

export interface GatewayRefund {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
}

export interface IPaymentGateway {
  name: string;

  createOrder(params: CreateOrderParams): Promise<GatewayOrder>;

  createPlan(params: {
    name: string;
    amount: number;
    billingCycle: 'monthly' | 'yearly';
  }): Promise<string>;

  createCustomer(params: {
    name: string;
    email: string;
    phone?: string;
  }): Promise<string>;

  createSubscription(params: CreateSubscriptionParams): Promise<GatewaySubscription>;

  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<void>;

  getSubscriptionDetails(subscriptionId: string): Promise<any>;

  verifyPaymentSignature(params: VerifyPaymentParams): boolean;

  verifyWebhookSignature(payload: string, signature: string): boolean;

  refundPayment(paymentId: string, amount?: number): Promise<GatewayRefund>;

  createPaymentLink?(params: {
    amount: number;
    description: string;
    customer: { name: string; email: string; phone?: string };
  }): Promise<string>;
}
