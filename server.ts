import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

import { createJob, getJob, geminiQueue } from "./lib/generationQueue.js";
import { getUserCredits, deductCredit } from "./lib/firebaseServer.js";
import {
  parsePromptPack,
  identifyAndDesignCharacters,
  restyleIllustration,
  generateBookCover,
} from "./geminiService.js";
import { GLOBAL_STYLE_LOCK } from "./seriesData.js";

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
    }

    // ── Recurring subscription payment succeeded (monthly renewal) ───────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      const customerId = invoice.customer as string;
      const subscriptionId = invoice.subscription as string;

      console.log(`[WEBHOOK] invoice.payment_succeeded — customer=${customerId} subscription=${subscriptionId}`);

      // TODO: Reset monthly credits via Firebase Admin SDK
    }

    // ── Subscription updated (upgrade / downgrade) ───────────────────────────
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const status = subscription.status;
      const tierId = subscription.metadata?.tierId;

      console.log(`[WEBHOOK] customer.subscription.updated — customer=${customerId} status=${status} tier=${tierId}`);
    }

    // ── Subscription cancelled ───────────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      console.log(`[WEBHOOK] customer.subscription.deleted — customer=${customerId}`);
    }

    res.send();
  });

  // ─── Standard JSON parsing (200 MB to handle base64 image payloads) ────────
  app.use(express.json({ limit: '200mb' }));

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

  // ─────────────────────────────────────────────────────────────────────────────
  // ─── Generation Endpoints ─────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/jobs/book
   *
   * Creates a server-side generation job and immediately returns the job ID.
   * The client then polls /api/jobs/:jobId/stream (SSE) for progress.
   *
   * Body:
   *   userId          string
   *   storyText       string
   *   stylePrompt     string
   *   styleRefBase64  string | undefined   (custom style reference image, base64)
   *   characters      Array<{ name: string; description: string; photoBase64?: string }>
   *   exportFormat    ExportFormat          (e.g. 'KDP_8_25x8_25')
   *   aspectRatio     '1:1' | '4:3' | '9:16'
   */
  app.post('/api/jobs/book', async (req, res) => {
    const {
      userId,
      storyText,
      coverPrompt,
      stylePrompt,
      styleRefBase64,
      characters = [],
      exportFormat,
      aspectRatio = '1:1',
    } = req.body;

    if (!userId || !storyText) {
      res.status(400).json({ error: 'userId and storyText are required' });
      return;
    }

    if (!process.env.GEMINI_API_KEY && !process.env.API_KEY) {
      res.status(500).json({ error: 'AI service is not configured on the server.' });
      return;
    }

    // ── Credit check ────────────────────────────────────────────────────────
    const credits = await getUserCredits(userId);
    if (credits < 1) {
      res.status(402).json({ error: 'Insufficient credits. Please subscribe or buy more credits.' });
      return;
    }

    // ── Create job and respond immediately ─────────────────────────────────
    const job = createJob(userId);
    res.json({ jobId: job.id });

    // ── Enqueue the generation pipeline (runs async, not awaited) ──────────
    geminiQueue.run(async () => {
      const emit = (event: string, data: object) => {
        job.emitter.emit('sse', { event, data });
      };

      try {
        job.status = 'running';

        // Deduct credit before starting so it can't be replayed on network retry
        await deductCredit(userId);

        // ── Step 1: Parse story into scenes ──────────────────────────────
        job.message = 'Planning your story…';
        emit('status', { status: 'running', message: job.message });

        const validChars = (characters as any[]).filter((c: any) => c.name?.trim());
        const charList = validChars
          .map((c: any) => `${c.name}: ${c.description || 'a friendly character'}`)
          .join('\n');
        const enrichedScript = validChars.length
          ? `CHARACTERS:\n${charList}\n\nSTORY:\n${storyText}`
          : storyText;

        const parsed = await parsePromptPack(enrichedScript);

        if (!parsed.scenes || parsed.scenes.length === 0) {
          throw new Error('Could not extract scenes from your story. Please try with more detail.');
        }

        // ── Step 2: Design character reference sheets ─────────────────────
        job.message = 'Designing your characters…';
        emit('status', { status: 'running', message: job.message });

        const charDescription = parsed.characterIdentities
          .map((ci: any) => `${ci.name}: ${ci.description}`)
          .join('\n');

        let charRefs: any[] = [];
        if (charDescription.trim()) {
          // Photos uploaded by user take priority over AI-generated sheets
          const photoRefs = validChars
            .filter((c: any) => c.photoBase64)
            .map((c: any) => ({
              id: Math.random().toString(36).substring(7),
              name: c.name,
              description: c.description || '',
              images: [c.photoBase64 as string],
            }));

          if (photoRefs.length > 0) {
            charRefs = photoRefs;
          } else {
            charRefs = await identifyAndDesignCharacters(
              charDescription,
              `${GLOBAL_STYLE_LOCK}\n${stylePrompt}`,
            );
          }
        }

        // ── Step 3: Illustrate each scene ─────────────────────────────────
        const totalPages = parsed.scenes.length;

        for (let i = 0; i < totalPages; i++) {
          const scene = parsed.scenes[i];
          const scenePrompt = scene.prompt || scene.text || '';
          const sceneText = scene.text || '';

          job.message = `Drawing page ${i + 1} of ${totalPages}…`;
          emit('status', { status: 'running', message: job.message });

          try {
            const image = await restyleIllustration(
              /* originalImageBase64 */ undefined,
              /* stylePrompt         */ `${GLOBAL_STYLE_LOCK}\n${stylePrompt}\n\nSCENE: ${scenePrompt}`,
              /* styleRefBase64      */ styleRefBase64,
              /* targetText          */ sceneText || undefined,
              /* charRefs            */ charRefs,
              /* assignments         */ [],
              /* usePro              */ false,
              /* cleanBackground     */ false,
              /* isSpread            */ scene.isSpread ?? false,
              /* masterBible         */ `${GLOBAL_STYLE_LOCK}\n${parsed.masterBible || ''}`,
              /* imageSize           */ '2K',
              /* projectContext      */ `A children's book. ${storyText.substring(0, 3000)}`,
              /* aspectRatio         */ aspectRatio as any,
              /* exportFormat        */ exportFormat,
              /* estimatedPageCount  */ totalPages,
            );

            const page = { index: i, image, text: sceneText, status: 'completed' as const };
            job.pages.push(page);
            emit('page_ready', page);
          } catch (pageErr: any) {
            console.error(`[job ${job.id}] page ${i + 1} failed:`, pageErr);
            const page = { index: i, image: '', text: sceneText, status: 'error' as const };
            job.pages.push(page);
            emit('page_error', { index: i, message: pageErr.message });
          }
        }

        // ── Step 4: Generate cover ─────────────────────────────────────────
        job.message = 'Designing your cover…';
        emit('status', { status: 'running', message: job.message });

        try {
          const coverImage = await generateBookCover(
            /* projectContext    */ coverPrompt ? `A children's book cover illustration. Cover instruction: ${coverPrompt}\n\nStory context: ${storyText.substring(0, 1000)}` : `A children's book cover. Story: ${storyText.substring(0, 3000)}`,
            /* charRefs          */ charRefs,
            /* stylePrompt       */ `${GLOBAL_STYLE_LOCK}\n${stylePrompt}`,
            /* masterBible       */ `${GLOBAL_STYLE_LOCK}\n${parsed.masterBible || ''}`,
            /* targetResolution  */ '2K',
            /* targetAspectRatio */ aspectRatio as any,
            /* exportFormat      */ exportFormat,
            /* estimatedPageCount*/ totalPages,
            /* styleRefBase64    */ styleRefBase64,
          );
          job.coverImage = coverImage;
          emit('cover_ready', { image: coverImage });
        } catch (coverErr: any) {
          console.warn(`[job ${job.id}] cover generation failed:`, coverErr);
          emit('cover_error', { message: coverErr.message });
        }

        // ── Done ──────────────────────────────────────────────────────────
        job.status = 'done';
        job.message = 'Your book is ready!';
        emit('done', { totalPages });
      } catch (err: any) {
        console.error(`[job ${job.id}] fatal error:`, err);
        job.status = 'failed';
        job.error = err.message || 'Generation failed';
        job.emitter.emit('sse', {
          event: 'error',
          data: { message: job.error },
        });
      }
    }).catch(err => {
      console.error(`[job ${job.id}] queue error:`, err);
    });
  });

  /**
   * GET /api/jobs/:jobId/stream
   *
   * Server-Sent Events stream for a generation job.
   * Events:
   *   status      { status, message }
   *   page_ready  { index, image, text, status }
   *   page_error  { index, message }
   *   cover_ready { image }
   *   cover_error { message }
   *   done        { totalPages }
   *   error       { message }
   */
  app.get('/api/jobs/:jobId/stream', (req, res) => {
    const job = getJob(req.params.jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    // ── SSE headers ─────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (event: string, data: object) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // ── If the job is already finished, replay its state immediately ────────
    if (job.status === 'done' || job.status === 'failed') {
      send('status', { status: job.status, message: job.message });
      for (const page of job.pages) {
        if (page.status === 'completed') send('page_ready', page);
        else send('page_error', { index: page.index, message: 'Page failed' });
      }
      if (job.coverImage) send('cover_ready', { image: job.coverImage });
      if (job.status === 'done') send('done', { totalPages: job.pages.length });
      else send('error', { message: job.error ?? 'Unknown error' });
      res.end();
      return;
    }

    // ── Forward live events from the job's emitter ──────────────────────────
    const onSse = ({ event, data }: { event: string; data: object }) => {
      send(event, data);
      if (event === 'done' || event === 'error') res.end();
    };

    job.emitter.on('sse', onSse);

    // Clean up when client disconnects
    req.on('close', () => {
      job.emitter.off('sse', onSse);
    });
  });

  // ─── Global Error Handler ──────────────────────────────────────────
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
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
    app.get('/(.*)', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
