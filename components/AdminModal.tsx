import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ShieldCheck, User, Loader2 } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface AllowedEmail {
  email: string;
  role: string;
  addedBy: string;
  createdAt: number;
}

export const AdminModal = ({ onClose }: { onClose: () => void }) => {
  const [emails, setEmails] = useState<AllowedEmail[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmails();
  }, []);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'allowedEmails'));
      const fetchedEmails: AllowedEmail[] = [];
      querySnapshot.forEach((doc) => {
        fetchedEmails.push(doc.data() as AllowedEmail);
      });
      setEmails(fetchedEmails.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err: any) {
      console.error("Error fetching emails:", err);
      setError("Failed to load users. You may not have permission.");
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
      await fetchEmails();
    } catch (err: any) {
      console.error("Error adding email:", err);
      setError("Failed to add user.");
      setLoading(false);
    }
  };

  const handleRemoveEmail = async (email: string) => {
    if (!confirm(`Are you sure you want to remove ${email}? They will no longer be able to sign in.`)) return;
    
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'allowedEmails', email));
      await fetchEmails();
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
              <p className="text-slate-500 font-medium">Manage who can access the application</p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 bg-white rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shadow-sm">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
          {error && (
            <div className="mb-8 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
              {error}
            </div>
          )}

          <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 mb-8">
            <h3 className="text-lg font-black text-slate-800 mb-4">Add New User</h3>
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
              <button
                type="submit"
                disabled={loading || !newEmail}
                className="px-8 py-4 bg-amber-500 text-white rounded-2xl font-black hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Plus size={20} /> Add
              </button>
            </form>
          </div>

          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-black text-slate-800">Allowed Users</h3>
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
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${entry.role === 'admin' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
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
        </div>
      </div>
    </div>
  );
};
