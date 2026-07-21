import { Router, type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import Stripe from "stripe";
import { usersCollection } from "../config/db";
import { verifyToken } from "../middleware/verifyToken";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-06-24.dahlia",
});

const router = Router();

export async function handleWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    res.status(400).json({ error: "Missing signature or webhook secret" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) {
          console.error("No client_reference_id in checkout session");
          break;
        }

        const subscriptionId = session.subscription as string;
        let currentPeriodEnd: Date | null = null;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        }

        await usersCollection.updateOne(
          { id: userId },
          {
            $set: {
              role: "pro",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: "active",
              currentPeriodEnd,
              upgradedAt: new Date(),
            },
          }
        );
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

        await usersCollection.updateOne(
          { stripeSubscriptionId: subscriptionId },
          {
            $set: {
              subscriptionStatus: "active",
              currentPeriodEnd,
            },
          }
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
        const status = subscription.status === "active" ? "active" : subscription.status === "past_due" ? "past_due" : subscription.status === "canceled" ? "canceled" : "incomplete";

        await usersCollection.updateOne(
          { stripeSubscriptionId: subscription.id },
          {
            $set: {
              subscriptionStatus: status,
              currentPeriodEnd,
              ...(status === "canceled" ? { role: "free", currentPeriodEnd: null } : {}),
            },
          }
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await usersCollection.updateOne(
          { stripeSubscriptionId: subscription.id },
          {
            $set: {
              role: "free",
              subscriptionStatus: "canceled",
              currentPeriodEnd: null,
            },
          }
        );
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        if (!subscriptionId) break;

        await usersCollection.updateOne(
          { stripeSubscriptionId: subscriptionId },
          {
            $set: {
              subscriptionStatus: "past_due",
            },
          }
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).json({ error: "Webhook handler failed" });
  }
}

router.post("/cancel", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.sub;

    const query = ObjectId.isValid(userId)
      ? { $or: [{ _id: new ObjectId(userId) }, { id: userId }] }
      : { id: userId };

    const user = await usersCollection.findOne(query);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const subscriptionId = user.stripeSubscriptionId;
    if (!subscriptionId) {
      res.status(400).json({ error: "No active subscription" });
      return;
    }

    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    await usersCollection.updateOne(query, {
      $set: {
        subscriptionStatus: "cancel_at_period_end",
      },
    });

    res.json({ success: true, message: "Subscription will cancel at period end" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
