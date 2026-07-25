import { IPaymentGateway } from "./payment-gateway.interface";
import { RazorpayGateway } from "./razorpay.gateway";

export class PaymentGatewayFactory {
  private static instances: Map<string, IPaymentGateway> = new Map();

  public static getGateway(gatewayName: string = "razorpay"): IPaymentGateway {
    const key = gatewayName.toLowerCase();
    if (!this.instances.has(key)) {
      switch (key) {
        case "razorpay":
          this.instances.set(key, new RazorpayGateway());
          break;
        default:
          throw new Error(`Unsupported payment gateway: ${gatewayName}`);
      }
    }
    return this.instances.get(key)!;
  }
}
