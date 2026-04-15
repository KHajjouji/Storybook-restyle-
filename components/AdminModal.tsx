import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ShieldCheck, User, Loader2, Layers, CreditCard, Settings, BarChart3, Search } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { UserProfile, Tier } from '../types';

interface AllowedEmail {
  email: string;
  role: string;
  addedBy: string;
  createdAt: number;
}

export const AdminModal = ({ onClose }: { onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'platform' | 'users' | 'tiers' | 'settings'>('platform');
  
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [systemConfig, setSystemConfig] = useState({ globalApiKey: '', stripePublicKey: '' });
  
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newTierId, setNewTierId] = useState('free');
  
  const [newTier, setNewTier] = useState<Partial<Tier>>({ name: '', maxProjects: 10, monthlyCredits: 100 });
  const [userSearch, setUserSearch] = useState('');
  const [grantAmounts, setGrantAmounts] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Tiers
      const tiersSnap = await getDocs(collection(db, 'tiers'));
      const fetchedTiers: Tier[] = [];
      tiersSnap.forEach(doc => fetchedTiers.push(doc.data() as Tier));
      
      // Ensure 'free' tier exists locally if not in DB
      if (!fetchedTiers.find(t => t.id === 'free')) {
        fetchedTiers.push({ id: 'free', name: 'Free', maxProjects: 3, monthlyCredits: 10 });
      }
      setTiers(fetchedTiers);

      // Fetch Allowed Emails
      const emailsSnap = await getDocs(collection(db, 'allowedEmails'));
      const fetchedEmails: AllowedEmail[] = [];
      emailsSnap.forEach(doc => fetchedEmails.push(doc.data() as AllowedEmail));
      setEmails(fetchedEmails.sort((a, b) => b.createdAt - a.createdAt));

      // Fetch User Profiles
      const usersSnap = await getDocs(collection(db, 'users'));
      const fetchedUsers: UserProfile[] = [];
      usersSnap.forEach(doc => fetchedUsers.push(doc.data() as UserProfile));
      setUserProfiles(fetchedUsers);

      // Fetch System Config
      const configSnap = await getDoc(doc(db, 'config', 'system'));
      if (configSnap.exists()) {
        setSystemConfig(configSnap.data() as any);
      }

    } catch (err: any) {
      console.error("Error fetching admin data:", err);
      setError("Failed to load data. You may not have permission.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) return;

    try {
      setLoading(true);
      const emailId = newEmail.trim().toLowerCase();
      const newEntry: AllowedEmail = {
        email: emailId,
        role: newRole,
        addedBy: auth.currentUser?.uid || 'unknown',
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'allowedEmails', emailId), newEntry);
      setNewEmail('');
      await fetchData();
    } catch (err: any) {
      console.error("Error adding email:", err);
      setError("Failed to add user.");
      setLoading(false);
    }
  };

  const handleUpdateUserCredits = async (uid: string, newCredits: number) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', uid), { credits: newCredits });
      await fetchData();
    } catch (err: any) {
      console.error("Error updating credits:", err);
      setError("Failed to update credits.");
      setLoading(false);
    }
  };

  const handleGrantCredits = async (uid: string, currentCredits: number) => {
    const amount = parseInt(grantAmounts[uid] || '0', 10);
    if (!amount || amount <= 0) return;
    await handleUpdateUserCredits(uid, currentCredits + amount);
    setGrantAmounts(prev => ({ ...prev, [uid]: '' }));
  };

  const handleUpdateUserTier = async (uid: string, tierId: string) => {
    try {
      setLoading(true);
      await updateDoc(doc(db, 'users', uid), { tierId });
      await fetchData();
    } catch (err: any) {
      console.error("Error updating tier:", err);
      setError("Failed to update tier.");
      setLoading(false);
    }
  };

  const handleAddTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTier.name) return;

    try {
      setLoading(true);
      const tierId = newTier.name.toLowerCase().replace(/\s+/g, '-');
      const tierData: Tier = {
        id: tierId,
        name: newTier.name,
        maxProjects: newTier.maxProjects || 0,
        monthlyCredits: newTier.monthlyCredits || 0
      };

      await setDoc(doc(db, 'tiers', tierId), tierData);
      setNewTier({ name: '', maxProjects: 10, monthlyCredits: 100 });
      await fetchData();
    } catch (err: any) {
      console.error("Error adding tier:", err);
      setError("Failed to add tier.");
      setLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await setDoc(doc(db, 'config', 'system'), systemConfig);
      setError(null);
      alert("System configuration saved.");
    } catch (err: any) {
      console.error("Error saving config:", err);
      setError("Failed to save system configuration.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveEmail = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email}? They will no longer be able to sign in.`)) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'allowedEmails', email));
      await fetchData();
    } catch (err: any) {
      console.error("Error removing email:", err);
      setError("Failed to remove user.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-8">
      <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">Admin Dashboard</h2>
              <p className="text-slate-500 font-medium">Manage users, tiers, and API credits</p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 bg-white rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shadow-sm">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50 px-8 overflow-x-auto">
          {([
            { id: 'platform', label: 'Platform' },
            { id: 'users',    label: 'Users & Access' },
            { id: 'tiers',    label: 'Tiers' },
            { id: 'settings', label: 'Settings' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-6 py-4 font-bold text-sm uppercase tracking-widest border-b-2 transition-colors ${activeTab === tab.id ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
          {error && (
            <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          {activeTab === 'platform' && (() => {
            const totalUsers = userProfiles.length;
            const activeSubscriptions = userProfiles.filter(u =>
              (u as any).subscriptionStatus === 'active' || (u as any).subscriptionStatus === 'trialing'
            ).length;
            const totalCredits = userProfiles.reduce((sum, u) => sum + (u.credits || 0), 0);
            const tierCounts: Record<string, number> = {};
            userProfiles.forEach(u => {
              tierCounts[u.tierId || 'free'] = (tierCounts[u.tierId || 'free'] || 0) + 1;
            });
            const filtered = userProfiles.filter(u =>
              !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase())
            );

            return (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {[
                    { label: 'Total Users', value: totalUsers, icon: <User size={20} />, color: 'indigo' },
                    { label: 'Active Subscribers', value: activeSubscriptions, icon: <CreditCard size={20} />, color: 'emerald' },
                    { label: 'Credits in Circulation', value: totalCredits, icon: <BarChart3 size={20} />, color: 'amber' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 text-center">
                      <div className={`w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center bg-${stat.color}-100 text-${stat.color}-600`}>
                        {stat.icon}
                      </div>
                      <div className="text-3xl font-black text-slate-900">{stat.value}</div>
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Tier breakdown */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 mb-8">
                  <h3 className="text-base font-black text-slate-800 mb-4">Users by Tier</h3>
                  <div className="space-y-2">
                    {Object.entries(tierCounts).map(([tierId, count]) => {
                      const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
                      return (
                        <div key={tierId} className="flex items-center gap-4">
                          <div className="w-24 text-sm font-bold text-slate-600 capitalize">{tierId}</div>
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="text-sm font-bold text-slate-500 w-16 text-right">{count} users</div>
                        </div>
                      );
                    })}
                    {Object.keys(tierCounts).length === 0 && (
                      <p className="text-slate-400 text-sm font-medium">No users yet.</p>
                    )}
                  </div>
                </div>

                {/* User management with search */}
                <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-4">
                    <h3 className="text-base font-black text-slate-800 flex-1">User Management</h3>
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={e => setUserSearch(e.target.value)}
                        placeholder="Search by email…"
                        className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {filtered.length === 0 && (
                      <div className="p-8 text-center text-slate-400 font-medium">No users match your search.</div>
                    )}
                    {filtered.map(user => (
                      <div key={user.uid} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <User size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm truncate">{user.email}</div>
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                              {user.role} • {user.credits} credits
                              {(user as any).subscriptionStatus ? ` • ${(user as any).subscriptionStatus}` : ''}
                            </div>
                          </div>
                        </div>
                        {/* Controls row */}
                        <div className="flex items-center gap-2 flex-wrap ml-12">
                          {/* Tier override */}
                          <select
                            value={user.tierId || 'free'}
                            onChange={e => handleUpdateUserTier(user.uid, e.target.value)}
                            className="text-xs font-bold bg-slate-100 border-none outline-none px-3 py-2 rounded-lg cursor-pointer text-slate-600"
                            title="Change tier"
                          >
                            {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          {/* Credit grant */}
                          <input
                            type="number"
                            min={1}
                            value={grantAmounts[user.uid] || ''}
                            onChange={e => setGrantAmounts(prev => ({ ...prev, [user.uid]: e.target.value }))}
                            placeholder="Credits"
                            className="w-24 text-xs font-bold bg-slate-100 border-none outline-none px-3 py-2 rounded-lg text-slate-600"
                          />
                          <button
                            onClick={() => handleGrantCredits(user.uid, user.credits)}
                            disabled={!grantAmounts[user.uid] || parseInt(grantAmounts[user.uid] || '0') <= 0}
                            className="text-xs font-black bg-amber-500 text-white px-3 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors"
                          >
                            Grant
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {activeTab === 'users' && (
            <>
              <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 mb-8">
                <h3 className="text-lg font-black text-slate-800 mb-4">Pre-Authorize New User</h3>
                <form onSubmit={handleAddEmail} className="flex gap-4">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="flex-1 bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium"
                    required
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium cursor-pointer"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <select
                    value={newTierId}
                    onChange={(e) => setNewTierId(e.target.value)}
                    className="bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium cursor-pointer"
                  >
                    {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button
                    type="submit"
                    disabled={loading || !newEmail}
                    className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <Plus size={20} /> Add
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden mb-8">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-lg font-black text-slate-800">Registered Users & Credits</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {userProfiles.map(user => (
                    <div key={user.uid} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                          <User size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{user.email}</div>
                          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">
                            {user.role} • Tier: {user.tierId}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold">
                          <CreditCard size={16} />
                          {user.credits} Credits
                        </div>
                        <button 
                          onClick={() => handleUpdateUserCredits(user.uid, user.credits + 100)}
                          className="text-xs font-bold bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200"
                        >
                          +100
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-lg font-black text-slate-800">Pre-Authorized Emails</h3>
                </div>
                
                {loading && emails.length === 0 ? (
                  <div className="p-12 flex justify-center">
                    <Loader2 className="animate-spin text-amber-500" size={32} />
                  </div>
                ) : emails.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-medium">
                    No users added yet. Only the default admin can access the app.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {emails.map((entry) => (
                      <div key={entry.email} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${entry.role === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                            {entry.role === 'admin' ? <ShieldCheck size={20} /> : <User size={20} />}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800">{entry.email}</div>
                            <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">
                              {entry.role} • Added {new Date(entry.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveEmail(entry.email)}
                          className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                          title="Remove Access"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'tiers' && (
            <>
              <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 mb-8">
                <h3 className="text-lg font-black text-slate-800 mb-4">Create New Tier</h3>
                <form onSubmit={handleAddTier} className="flex flex-col gap-4">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={newTier.name}
                      onChange={(e) => setNewTier({ ...newTier, name: e.target.value })}
                      placeholder="Tier Name (e.g. Pro)"
                      className="flex-1 bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium"
                      required
                    />
                    <input
                      type="number"
                      value={newTier.maxProjects}
                      onChange={(e) => setNewTier({ ...newTier, maxProjects: parseInt(e.target.value) })}
                      placeholder="Max Projects"
                      className="w-32 bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium"
                      title="Max Projects"
                    />
                    <input
                      type="number"
                      value={newTier.monthlyCredits}
                      onChange={(e) => setNewTier({ ...newTier, monthlyCredits: parseInt(e.target.value) })}
                      placeholder="Monthly Credits"
                      className="w-40 bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium"
                      title="Monthly Credits"
                    />
                    <button
                      type="submit"
                      disabled={loading || !newTier.name}
                      className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Plus size={20} /> Add
                    </button>
                  </div>
                </form>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-lg font-black text-slate-800">Available Tiers</h3>
                </div>
                <div className="divide-y divide-slate-50">
                  {tiers.map((tier) => (
                    <div key={tier.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                          <Layers size={20} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">{tier.name}</div>
                          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">
                            ID: {tier.id}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 text-sm font-medium text-slate-600">
                        <div><span className="text-slate-400">Max Projects:</span> {tier.maxProjects}</div>
                        <div><span className="text-slate-400">Monthly Credits:</span> {tier.monthlyCredits}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'settings' && (
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 mb-8">
              <h3 className="text-lg font-black text-slate-800 mb-4">System Configuration</h3>
              <p className="text-sm text-slate-500 mb-8">Configure global API keys and integrations. Note: For security, sensitive keys like Stripe Secret should remain in environment variables.</p>
              
              <form onSubmit={handleSaveConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Global Gemini API Key (Optional)</label>
                  <input
                    type="password"
                    value={systemConfig.globalApiKey || ''}
                    onChange={(e) => setSystemConfig({ ...systemConfig, globalApiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium focus:ring-2 ring-amber-500"
                  />
                  <p className="text-xs text-slate-400 ml-2">If set, this overrides the environment variable for all users.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-slate-400 ml-2">Stripe Public Key</label>
                  <input
                    type="text"
                    value={systemConfig.stripePublicKey || ''}
                    onChange={(e) => setSystemConfig({ ...systemConfig, stripePublicKey: e.target.value })}
                    placeholder="pk_test_..."
                    className="w-full bg-slate-50 border-none outline-none px-6 py-4 rounded-2xl font-medium focus:ring-2 ring-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Settings size={20} />}
                  Save Configuration
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
