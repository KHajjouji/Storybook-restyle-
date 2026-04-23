import React from 'react';
import {
  X, BookOpen, CreditCard, Zap, Settings, LogOut, ShieldCheck,
  ArrowRight, User, ToggleLeft, ToggleRight
} from 'lucide-react';
import { UserProfile, UserMode, SUBSCRIPTION_TIERS } from '../types';

interface UserDashboardProps {
  userProfile: UserProfile;
  userMode: UserMode;
  isAdmin: boolean;
  onClose: () => void;
  onToggleMode: () => void;
  onShowSubscription: () => void;
  onShowAdmin: () => void;
  onSignOut: () => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  userProfile,
  userMode,
  isAdmin,
  onClose,
  onToggleMode,
  onShowSubscription,
  onShowAdmin,
  onSignOut,
}) => {
  const currentTier = SUBSCRIPTION_TIERS.find(t => t.id === userProfile.tierId);
  const maxCredits = currentTier?.monthlyCredits ?? 3;
  const creditPct = Math.min(100, Math.round((userProfile.credits / maxCredits) * 100));

  const creditColor =
    creditPct > 50 ? 'bg-emerald-500' :
    creditPct > 20 ? 'bg-amber-400' :
    'bg-red-500';

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-end p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 bg-white w-full max-w-sm rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="bg-indigo-600 px-8 py-8 text-white space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <User size={24} className="text-white" />
              </div>
              <div>
                <p className="font-black text-lg leading-tight">{userProfile.email.split('@')[0]}</p>
                <p className="text-indigo-200 text-xs font-medium">{userProfile.email}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Plan badge */}
          <div className="flex items-center gap-2">
            <span className="bg-white/30 border border-white/40 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest">
              {currentTier?.name ?? 'Free Trial'}
            </span>
          </div>
        </div>

        {/* Credits */}
        <div className="px-8 py-6 border-b border-slate-100 space-y-3">
          <div className="flex justify-between items-baseline">
            <div>
              <span className="text-sm font-black uppercase tracking-widest text-slate-500">Book Credits</span>
              <p className="text-slate-400 text-xs font-medium mt-0.5">1 credit = 1 illustrated book</p>
            </div>
            <span className="text-2xl font-black text-slate-900">{userProfile.credits}</span>
          </div>
          {/* Progress bar */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${creditColor}`}
              style={{ width: `${creditPct}%` }}
            />
          </div>
          <p className="text-slate-400 text-xs font-medium">
            {userProfile.credits === 0
              ? 'No credits remaining — subscribe to create more books'
              : `${userProfile.credits} of ${maxCredits} credits remaining this month`}
          </p>
          <button
            onClick={onShowSubscription}
            className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md hover:bg-indigo-700 transition-colors"
          >
            <Zap size={16} />
            {userProfile.tierId === 'free' ? 'Subscribe for More' : 'Buy More Credits'}
          </button>
        </div>

        {/* Settings */}
        <div className="px-8 py-4 space-y-1">

          {/* Mode toggle */}
          <button
            onClick={onToggleMode}
            className="w-full flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-slate-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <Settings size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <span className="font-bold text-slate-700 group-hover:text-slate-900">Professional Mode</span>
            </div>
            <div className={`flex items-center gap-2 ${userMode === 'professional' ? 'text-indigo-600' : 'text-slate-300'}`}>
              <span className="text-xs font-bold uppercase">{userMode === 'professional' ? 'ON' : 'OFF'}</span>
              {userMode === 'professional'
                ? <ToggleRight size={24} className="text-indigo-600" />
                : <ToggleLeft size={24} className="text-slate-300" />}
            </div>
          </button>

          {/* My books */}
          <button
            onClick={onClose}
            className="w-full flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-slate-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <BookOpen size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <span className="font-bold text-slate-700 group-hover:text-slate-900">My Books</span>
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500" />
          </button>

          {/* Subscription */}
          <button
            onClick={onShowSubscription}
            className="w-full flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-slate-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <CreditCard size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <span className="font-bold text-slate-700 group-hover:text-slate-900">Subscription & Billing</span>
            </div>
            <ArrowRight size={16} className="text-slate-300 group-hover:text-slate-500" />
          </button>

          {/* Admin */}
          {isAdmin && (
            <button
              onClick={() => { onShowAdmin(); onClose(); }}
              className="w-full flex items-center justify-between py-4 px-4 rounded-2xl hover:bg-amber-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-amber-600" />
                <span className="font-bold text-amber-600">Admin Panel</span>
              </div>
              <ArrowRight size={16} className="text-amber-300" />
            </button>
          )}
        </div>

        {/* Sign out */}
        <div className="px-8 py-6 border-t border-slate-100">
          <button
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 py-4 bg-red-50 text-red-500 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
