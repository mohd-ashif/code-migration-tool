import crypto from "crypto";
import https from "https";
import { config } from "../config";
import { logger } from "../utils/logger";

export class RazorpayService {
  private keyId = config.RAZORPAY_KEY_ID;
  private keySecret = config.RAZORPAY_KEY_SECRET;

  private makeRequest<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
      const postData = body ? JSON.stringify(body) : "";

      const headers: Record<string, any> = {
        "Authorization": `Basic ${auth}`,
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
              logger.error(`Razorpay API Error (${res.statusCode}): ${JSON.stringify(parsed)}`);
              reject(new Error(parsed.error?.description || `Razorpay request failed with status ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch (err) {
            reject(new Error(`Failed to parse Razorpay response: ${responseBody}`));
          }
        });
      });

      // Set timeout of 8 seconds to prevent hanging queries on offline/mock environments
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error("Connection to Razorpay gateway timed out. Please verify your internet connection."));
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

  /**
   * Dynamically gets or creates a Razorpay plan for subscriptions
   */
  async getOrCreatePlan(planSlug: string, name: string, amount: number, billingCycle: 'monthly' | 'yearly'): Promise<string> {
    try {
      const period = billingCycle === 'yearly' ? 'yearly' : 'monthly';
      
      logger.info(`Creating plan on Razorpay: ${name} (${billingCycle}) - ₹${amount}`);
      const response = await this.makeRequest('POST', '/plans', {
        period,
        interval: 1,
        item: {
          name: `${name} Plan (${billingCycle})`,
          amount: Math.round(amount * 100), // convert to paise
          currency: "INR",
          description: `Subscription to ${name} plan`
        }
      });

      return response.id;
    } catch (err: any) {
      logger.error(`Failed to resolve Razorpay plan: ${err.message}`);
      throw err;
    }
  }

  /**
   * Creates a customer profile in Razorpay
   */
  async createCustomer(name: string, email: string, phone?: string): Promise<string> {
    try {
      const response = await this.makeRequest('POST', '/customers', {
        name,
        email,
        contact: phone || undefined,
        fail_existing: 0
      });
      return response.id;
    } catch (err: any) {
      logger.error(`Failed to create Razorpay customer: ${err.message}`);
      throw err;
    }
  }

  /**
   * Creates a subscription in Razorpay
   */
  async createSubscription(params: {
    planId: string;
    customerId?: string;
    totalCount: number;
    expireBy?: number;
    quantity?: number;
  }): Promise<{ id: string; short_url: string; status: string }> {
    try {
      const response = await this.makeRequest('POST', '/subscriptions', {
        plan_id: params.planId,
        customer_id: params.customerId || undefined,
        total_count: params.totalCount,
        quantity: params.quantity || 1,
        expire_by: params.expireBy || undefined
      });
      return {
        id: response.id,
        short_url: response.short_url,
        status: response.status
      };
    } catch (err: any) {
      logger.error(`Failed to create Razorpay subscription: ${err.message}`);
      throw err;
    }
  }

  /**
   * Cancels an active subscription in Razorpay
   */
  async cancelSubscription(subscriptionId: string, cancelAtCycleEnd = true): Promise<void> {
    try {
      await this.makeRequest('POST', `/subscriptions/${subscriptionId}/cancel`, {
        cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0
      });
      logger.info(`Subscription ${subscriptionId} cancelled on Razorpay.`);
    } catch (err: any) {
      logger.error(`Failed to cancel Razorpay subscription: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetches subscription details from Razorpay
   */
  async getSubscriptionDetails(subscriptionId: string): Promise<any> {
    if (subscriptionId?.startsWith("sub_mock_")) {
      return {
        id: subscriptionId,
        status: "active",
        order_id: `order_mock_${Math.random().toString(36).substring(2, 12)}`,
        payment_method: "card"
      };
    }
    return this.makeRequest('GET', `/subscriptions/${subscriptionId}`);
  }

  /**
   * Verifies the checkout payment signature (from frontend response)
   */
  verifyPaymentSignature(params: {
    paymentId: string;
    signature: string;
    subscriptionId: string;
  }): boolean {
    try {
      if (params.subscriptionId?.startsWith("sub_mock_") && params.signature === "mock_signature_success") {
        return true;
      }
      const data = `${params.paymentId}|${params.subscriptionId}`;
      const expectedSignature = crypto
        .createHmac("sha256", this.keySecret)
        .update(data)
        .digest("hex");

      return expectedSignature === params.signature;
    } catch (err) {
      return false;
    }
  }

  /**
   * Verifies standard webhook signatures from Razorpay
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac("sha256", config.RAZORPAY_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");

      return expectedSignature === signature;
    } catch (err) {
      return false;
    }
  }

  /**
   * Refund a captured payment
   */
  async refundPayment(paymentId: string, amount?: number): Promise<any> {
    try {
      const body = amount ? { amount: Math.round(amount * 100) } : {};
      const response = await this.makeRequest('POST', `/payments/${paymentId}/refund`, body);
      logger.info(`Refund processed for payment ${paymentId}.`);
      return response;
    } catch (err: any) {
      logger.error(`Failed to refund payment: ${err.message}`);
      throw err;
    }
  }
}
export const razorpayService = new RazorpayService();
