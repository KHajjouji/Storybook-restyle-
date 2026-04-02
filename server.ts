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

  // Stripe webhook must use raw body
  app.post('/api/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.warn("Stripe webhook secret not configured.");
      res.status(400).send(`Webhook Error: Secret not configured`);
      return;
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const creditsToAdd = session.metadata?.credits ? parseInt(session.metadata.credits) : 0;
      
      if (userId && creditsToAdd > 0) {
        // Here we would use Firebase Admin SDK to update the user's credits.
        // Since we don't have Firebase Admin configured yet, we'll just log it.
        // In a real scenario, you'd need the service account key.
        console.log(`[WEBHOOK] Added ${creditsToAdd} credits to user ${userId}`);
      }
    }

    res.send();
  });

  // Standard JSON parsing for other routes
  app.use(express.json());

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const { userId, credits, priceId } = req.body;
      
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("Stripe is not configured.");
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}?canceled=true`,
        client_reference_id: userId,
        metadata: {
          credits: credits.toString()
        }
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
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
