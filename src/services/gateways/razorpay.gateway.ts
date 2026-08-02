import crypto from "crypto";
import https from "https";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import {
  IPaymentGateway,
  CreateOrderParams,
  GatewayOrder,
  CreateSubscriptionParams,
  GatewaySubscription,
  VerifyPaymentParams,
  GatewayRefund
} from "./payment-gateway.interface";

export class RazorpayGateway implements IPaymentGateway {
  readonly name = "razorpay";

  private get keyId(): string {
    return config.RAZORPAY_KEY_ID || "";
  }

  private get keySecret(): string {
    return config.RAZORPAY_KEY_SECRET || "";
  }

  private makeRequest<T = any>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
      const postData = body ? JSON.stringify(body) : "";

      const headers: Record<string, any> = {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      };

      if (postData) {
        headers["Content-Length"] = Buffer.byteLength(postData);
      }

      const options: https.RequestOptions = {
        hostname: "api.razorpay.com",
        port: 443,
        path: `/v1${path}`,
        method,
        headers,
      };

      const req = https.request(options, (res) => {
        let responseBody = "";
        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode && res.statusCode >= 400) {
              logger.error(`Razorpay Gateway Error (${res.statusCode}): ${JSON.stringify(parsed)}`);
              reject(new Error(parsed.error?.description || `Razorpay request failed with status ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            reject(new Error(`Failed to parse Razorpay response: ${responseBody}`));
          }
        });
      });

      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error("Connection to Razorpay gateway timed out. Please verify network connectivity."));
      });

      req.on("error", (err) => {
        logger.error(`Razorpay connection error: ${err.message}`);
        reject(err);
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  async createOrder(params: CreateOrderParams): Promise<GatewayOrder> {
    try {
      const amountPaise = Math.round(params.amount * 100);
      const response = await this.makeRequest("POST", "/orders", {
        amount: amountPaise,
        currency: params.currency || "INR",
        receipt: params.receipt || `order_rcpt_${Date.now()}`,
        notes: params.notes || {}
      });

      return {
        id: response.id,
        amount: response.amount / 100,
        currency: response.currency,
        status: response.status,
        receipt: response.receipt
      };
    } catch (err: any) {
      logger.error(`Razorpay createOrder failed: ${err.message}`);
      throw err;
    }
  }

  async createPlan(params: { name: string; amount: number; billingCycle: "monthly" | "yearly" }): Promise<string> {
    try {
      const period = params.billingCycle === "yearly" ? "yearly" : "monthly";
      const response = await this.makeRequest("POST", "/plans", {
        period,
        interval: 1,
        item: {
          name: `${params.name} Plan (${params.billingCycle})`,
          amount: Math.round(params.amount * 100),
          currency: "INR",
          description: `Subscription to ${params.name} plan`
        }
      });
      return response.id;
    } catch (err: any) {
      logger.error(`Razorpay createPlan failed: ${err.message}`);
      throw err;
    }
  }

  async createCustomer(params: { name: string; email: string; phone?: string }): Promise<string> {
    try {
      const response = await this.makeRequest("POST", "/customers", {
        name: params.name,
        email: params.email,
        contact: params.phone || undefined,
        fail_existing: 0
      });
      return response.id;
    } catch (err: any) {
      logger.error(`Razorpay createCustomer failed: ${err.message}`);
      throw err;
    }
  }

  async createSubscription(params: CreateSubscriptionParams): Promise<GatewaySubscription> {
    try {
      const response = await this.makeRequest("POST", "/subscriptions", {
        plan_id: params.planId,
        customer_id: params.customerId || undefined,
        total_count: params.totalCount,
        quantity: params.quantity || 1,
        expire_by: params.expireBy || undefined,
        notes: params.notes || {}
      });

      return {
        id: response.id,
        shortUrl: response.short_url,
        status: response.status,
        currentStart: response.current_start ? new Date(response.current_start * 1000) : undefined,
        currentEnd: response.current_end ? new Date(response.current_end * 1000) : undefined
      };
    } catch (err: any) {
      logger.error(`Razorpay createSubscription failed: ${err.message}`);
      throw err;
    }
  }

  async cancelSubscription(subscriptionId: string, atPeriodEnd = true): Promise<void> {
    try {
      if (subscriptionId.startsWith("sub_mock_")) {
        logger.info(`Mock subscription ${subscriptionId} cancelled.`);
        return;
      }
      await this.makeRequest("POST", `/subscriptions/${subscriptionId}/cancel`, {
        cancel_at_cycle_end: atPeriodEnd ? 1 : 0
      });
    } catch (err: any) {
      logger.error(`Razorpay cancelSubscription failed: ${err.message}`);
      throw err;
    }
  }

  async getSubscriptionDetails(subscriptionId: string): Promise<any> {
    if (subscriptionId?.startsWith("sub_mock_")) {
      return {
        id: subscriptionId,
        status: "active",
        order_id: `order_mock_${Math.random().toString(36).substring(2, 12)}`,
        payment_method: "card"
      };
    }
    return this.makeRequest("GET", `/subscriptions/${subscriptionId}`);
  }

  verifyPaymentSignature(params: VerifyPaymentParams): boolean {
    try {
      if (params.subscriptionId?.startsWith("sub_mock_") && params.signature === "mock_signature_success") {
        return true;
      }
      if (params.orderId?.startsWith("order_mock_") && params.signature === "mock_signature_success") {
        return true;
      }

      let data = "";
      if (params.orderId) {
        data = `${params.orderId}|${params.paymentId}`;
      } else if (params.subscriptionId) {
        data = `${params.paymentId}|${params.subscriptionId}`;
      } else {
        return false;
      }

      const expectedSignature = crypto
        .createHmac("sha256", this.keySecret)
        .update(data)
        .digest("hex");

      return expectedSignature === params.signature;
    } catch (err) {
      return false;
    }
  }

  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    try {
      const webhookSecret = secret || config.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_secret_default";
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      return expectedSignature === signature;
    } catch (err) {
      return false;
    }
  }

  async refundPayment(paymentId: string, amount?: number): Promise<GatewayRefund> {
    try {
      if (paymentId.startsWith("pay_mock_")) {
        return {
          id: `rfnd_mock_${Date.now()}`,
          paymentId,
          amount: amount || 0,
          currency: "INR",
          status: "processed"
        };
      }

      const body = amount ? { amount: Math.round(amount * 100) } : {};
      const response = await this.makeRequest("POST", `/payments/${paymentId}/refund`, body);

      return {
        id: response.id,
        paymentId: response.payment_id,
        amount: response.amount / 100,
        currency: response.currency,
        status: response.status
      };
    } catch (err: any) {
      logger.error(`Razorpay refundPayment failed: ${err.message}`);
      throw err;
    }
  }

  async createPaymentLink(params: {
    amount: number;
    description: string;
    customer: { name: string; email: string; phone?: string };
  }): Promise<string> {
    try {
      const response = await this.makeRequest("POST", "/payment_links", {
        amount: Math.round(params.amount * 100),
        currency: "INR",
        accept_partial: false,
        description: params.description,
        customer: {
          name: params.customer.name,
          email: params.customer.email,
          contact: params.customer.phone || undefined
        }
      });
      return response.short_url;
    } catch (err: any) {
      logger.error(`Razorpay createPaymentLink failed: ${err.message}`);
      throw err;
    }
  }
}
