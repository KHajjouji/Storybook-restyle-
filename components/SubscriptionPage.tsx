import React, { useState } from 'react';
import { Check, X, Zap, CreditCard, ArrowLeft, Loader2 } from 'lucide-react';
import { SUBSCRIPTION_TIERS, TOPUP_PACKS, SubscriptionTier } from '../types';

interface SubscriptionPageProps {
  currentTierId: string;
  credits: number;
  userId: string;
  stripeCustomerId?: string | null;
  onBack: () => void;
}

export const SubscriptionPage: React.FC<SubscriptionPageProps> = ({
  currentTierId,
  credits,
  userId,
  stripeCustomerId,
  onBack,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSubscribe = async (tier: SubscriptionTier) => {
    setLoadingId(tier.id);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          credits: tier.monthlyCredits,
          priceId: tier.stripePriceId,
          tierId: tier.id,
          mode: 'subscription',
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleTopUp = async (pack: typeof TOPUP_PACKS[number]) => {
    setLoadingId(`topup-${pack.credits}`);
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          credits: pack.credits,
          priceId: pack.stripePriceId,
          mode: 'payment',
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!stripeCustomerId) {
      alert('No active subscription found.');
      return;
    }
    setLoadingId('portal');
    try {
      const res = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeCustomerId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      alert('Could not open subscription management. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const isSubscribed = currentTierId !== 'free';

  return (
    <div className="min-h-screen bg-slate-50 py-16 px-6">
      <div className="max-w-4xl mx-auto space-y-16">

        {/* Header */}
        <div className="text-center space-y-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-500 font-bold hover:text-slate-800 transition-colors mx-auto"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <h1 className="text-5xl font-black text-slate-900">
            Create unlimited storybooks
          </h1>
          <p className="text-slate-500 text-xl font-medium max-w-xl mx-auto">
            Subscribe and start creating illustrated children's books in minutes — no design or writing skills needed.
          </p>
          {credits > 0 && (
            <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-full font-bold border border-emerald-100">
              <Zap size={18} /> You have {credits} free book credit{credits !== 1 ? 's' : ''} remaining
            </div>
          )}
        </div>

        {/* Subscription tiers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SUBSCRIPTION_TIERS.map(tier => {
            const isCurrent = currentTierId === tier.id;
            const isLoading = loadingId === tier.id;

            return (
              <div
                key={tier.id}
                className={`relative bg-white rounded-[2.5rem] p-8 space-y-6 border-4 transition-all shadow-sm ${
                  tier.highlighted
                    ? 'border-indigo-600 shadow-indigo-100 shadow-2xl scale-[1.02]'
                    : 'border-slate-100'
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg">
                    Most Popular
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute -top-4 right-6 bg-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg">
                    Your Plan
                  </div>
                )}

                <div>
                  <h3 className="text-2xl font-black text-slate-900">{tier.name}</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-black text-slate-900">
                      ${(tier.price / 100).toFixed(2)}
                    </span>
                    <span className="text-slate-500 font-bold">/month</span>
                  </div>
                  <p className="text-indigo-600 font-bold mt-1">
                    {tier.monthlyCredits} books per month
                  </p>
                </div>

                <ul className="space-y-3">
                  {tier.features.map(feature => (
                    <li key={feature} className="flex items-start gap-3 text-slate-700 font-medium text-sm">
                      <Check size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => !isCurrent && handleSubscribe(tier)}
                  disabled={isCurrent || isLoading}
                  className={`w-full py-4 rounded-[1.5rem] font-black text-lg flex items-center justify-center gap-2 transition-all ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-400 cursor-default'
                      : tier.highlighted
                      ? 'bg-indigo-600 text-white shadow-xl hover:bg-indigo-700 hover:scale-[1.02]'
                      : 'bg-slate-900 text-white hover:bg-slate-800 hover:scale-[1.02]'
                  }`}
                >
                  {isLoading ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : (
                    'Get Started'
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Top-up section */}
        <div className="bg-white rounded-[2.5rem] p-10 border-2 border-slate-100 space-y-6 shadow-sm">
          <div>
            <h3 className="text-2xl font-black text-slate-900">Need more credits?</h3>
            <p className="text-slate-500 font-medium mt-1">Buy extra books at any time — they never expire.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TOPUP_PACKS.map(pack => {
              const isLoading = loadingId === `topup-${pack.credits}`;
              return (
                <button
                  key={pack.credits}
                  onClick={() => handleTopUp(pack)}
                  disabled={!!isLoading}
                  className="p-6 bg-slate-50 rounded-[2rem] border-2 border-slate-100 hover:border-indigo-300 hover:bg-indigo-50 text-left transition-all group"
                >
                  <p className="font-black text-2xl text-slate-900 group-hover:text-indigo-600">
                    {pack.credits} books
                  </p>
                  <p className="text-slate-500 font-bold text-sm mt-1">
                    ${(pack.price / 100).toFixed(2)} one-time
                  </p>
                  {isLoading && <Loader2 size={18} className="animate-spin text-indigo-600 mt-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Manage subscription */}
        {isSubscribed && (
          <div className="text-center">
            <button
              onClick={handleManageSubscription}
              disabled={loadingId === 'portal'}
              className="inline-flex items-center gap-2 px-8 py-4 bg-slate-100 text-slate-600 rounded-[2rem] font-bold hover:bg-slate-200 transition-colors"
            >
              {loadingId === 'portal' ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              Manage Subscription
            </button>
            <p className="text-slate-400 text-sm font-medium mt-2">
              Cancel, upgrade, or update payment method anytime.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
