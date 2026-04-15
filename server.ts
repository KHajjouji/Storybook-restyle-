import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2025-02-24.acacia' as any
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  // ─── Stripe Webhook (must receive raw body) ───────────────────────────────
  app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.warn("Stripe webhook secret not configured.");
      res.status(400).send(`Webhook Error: Secret not configured`);
      return;
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // ── One-time payment completed (top-up or first subscription checkout) ──
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const creditsToAdd = session.metadata?.credits ? parseInt(session.metadata.credits) : 0;
      const tierId = session.metadata?.tierId;

      console.log(`[WEBHOOK] checkout.session.completed — user=${userId} credits=${creditsToAdd} tier=${tierId}`);

      // TODO: Use Firebase Admin SDK to update Firestore when available
      // Example:
      // const userRef = adminDb.collection('users').doc(userId);
      // await userRef.update({ credits: FieldValue.increment(creditsToAdd), tierId });
    }

    // ── Recurring subscription payment succeeded (monthly renewal) ───────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const subscriptionId = invoice.subscription as string;

      console.log(`[WEBHOOK] invoice.payment_succeeded — customer=${customerId} subscription=${subscriptionId}`);

      // TODO: Reset monthly credits for the customer via Firebase Admin SDK
      // 1. Look up user by stripeCustomerId in Firestore
      // 2. Get their tier's monthlyCredits
      // 3. Set credits = monthlyCredits (reset, not increment)
    }

    // ── Subscription updated (upgrade / downgrade) ───────────────────────────
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const status = subscription.status; // 'active' | 'canceled' | 'past_due' etc.
      const tierId = subscription.metadata?.tierId;

      console.log(`[WEBHOOK] customer.subscription.updated — customer=${customerId} status=${status} tier=${tierId}`);

      // TODO: Update user tierId and subscription status in Firestore via Admin SDK
    }

    // ── Subscription cancelled ───────────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      console.log(`[WEBHOOK] customer.subscription.deleted — customer=${customerId}`);

      // TODO: Downgrade user to free tier via Firebase Admin SDK
      // await adminDb.collection('users').where('stripeCustomerId', '==', customerId).get()
      //   .then(snap => snap.docs[0].ref.update({ tierId: 'free', subscriptionStatus: 'cancelled' }));
    }

    res.send();
  });

  // ─── Standard JSON parsing for all other routes ───────────────────────────
  app.use(express.json());

  // ── Create Stripe Checkout Session (new subscription or top-up) ──────────
  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const { userId, credits, priceId, tierId, mode = 'payment' } = req.body;

      if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
        throw new Error("Stripe is not configured. Please add your STRIPE_SECRET_KEY to .env");
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: mode === 'subscription' ? 'subscription' : 'payment',
        success_url: `${req.headers.origin}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}?canceled=true`,
        client_reference_id: userId,
        metadata: {
          credits: credits?.toString() ?? '0',
          tierId: tierId ?? '',
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Create Stripe Billing Portal Session (manage / cancel subscription) ──
  app.post('/api/create-portal-session', async (req, res) => {
    try {
      const { stripeCustomerId } = req.body;

      if (!stripeCustomerId) {
        res.status(400).json({ error: 'stripeCustomerId is required' });
        return;
      }

      if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
        throw new Error("Stripe is not configured.");
      }

      const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || req.headers.origin as string;

      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: returnUrl,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─── Vite Dev / Static Production Serving ────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
