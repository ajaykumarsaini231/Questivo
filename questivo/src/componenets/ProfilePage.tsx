import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Calendar, Shield, BookOpen,
  Trophy, Target, BarChart2, Clock,
  RefreshCw, Eye, Settings, Save, Lock, Image as ImageIcon,
  Search, Sparkles, FileText, Timer, Award, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast, { Toaster } from 'react-hot-toast';
import PremiumDialog from './PremiumDialog';
import { useAiGenerator } from '../lib/premium';
import { useAudience } from './AudienceProvider';
import { examsForAudience, getAudience, type AudienceId } from '../lib/audience';
import {
  fetchMyAttempts,
  hhmmss,
  fmtDate,
  searchIndex,
  sortRows,
  CATEGORY_LABEL,
  SORT_LABEL,
  type AttemptRow,
  type MockRow,
  type HistoryCategory,
  type SortKey,
} from '../lib/pyqHistory';
// --- CONFIG ---
import { API_BASE } from '../lib/apiBase';

// --- TYPES ---
interface UserProfile {
  name: string;
  email: string;
  authProvider: "LOCAL" | "GOOGLE" | "FACEBOOK";
  photoUrl: string | null;
  bio: string | null;
  preferredMedium: string;
  createdAt: string;
}

/**
 * Both spellings of every stat.
 *
 * The page used to read `totalGenerated` and `averageScore` from a payload that
 * only ever sent `totalTests` and `avgScore`, so two of the four tiles rendered
 * 0 for everyone forever. The server now sends both names; this type records
 * that rather than picking one and leaving the other to rot.
 */
interface UserStats {
  totalTests: number;
  totalGenerated: number;
  attemptedTests: number;
  avgScore: number;
  averageScore: number;
  bestScore: number;
  papersSat: number;
}

const CATEGORIES: HistoryCategory[] = ['pyq', 'mock', 'generated'];

/** Per-category search and sort. The three lists filter independently — a
 *  search for "Physics" in PYQ has no business narrowing the mock list. */
type Filters = Record<HistoryCategory, { search: string; sort: SortKey }>;

const EMPTY_FILTERS: Filters = {
  pyq: { search: '', sort: 'recent' },
  mock: { search: '', sort: 'recent' },
  generated: { search: '', sort: 'recent' },
};

// --- MAIN COMPONENT ---
export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'settings'>('overview');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);

  // Three lists, kept apart all the way from the API to the screen.
  const [pyqTests, setPyqTests] = useState<AttemptRow[]>([]);
  const [mockTests, setMockTests] = useState<MockRow[]>([]);
  const [generatedTests, setGeneratedTests] = useState<AttemptRow[]>([]);

  const [category, setCategory] = useState<HistoryCategory>('pyq');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [premiumOpen, setPremiumOpen] = useState(false);

  // Settings Form State
  const [photoUrl, setPhotoUrl] = useState('');
  const [bio, setBio] = useState('');
  const [medium, setMedium] = useState('english');
  /** The exam track, and optionally one exam within it. Editable here only. */
  const [track, setTrack_] = useState<AudienceId | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const { audience, options: trackOptions, setTrack, focusExam } = useAudience();

  /**
   * The exams on the track currently SELECTED IN THIS FORM.
   *
   * Read off `track`, not off the provider's `audience`. Those differ the
   * moment someone picks a different track and has not saved yet, and driving
   * the list from the provider would offer them the old track's exams to focus
   * on — a JEE aspirant switching to Government being asked to choose between
   * JEE Main and NEET.
   */
  const trackExams = useMemo(
    () => examsForAudience(getAudience(track)),
    [track]
  );

  // Password Reset State
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');

  // --- FETCH DATA ---
  useEffect(() => {
    fetchProfile();
  }, []);

  /**
   * Two calls, in parallel.
   *
   * The profile carries the user, the stats and the mock tests. The attempts
   * endpoint carries the PYQ and generated sittings WITH their rank and
   * percentile, which needs a scan across everyone who sat the same paper —
   * work the profile header should not wait on. If that second call fails the
   * page still renders, falling back to the un-ranked copies the profile
   * already returned rather than showing an empty history, which would read as
   * "your attempts are gone".
   */
  const fetchProfile = async () => {
    setLoading(true);
    try {
      const [profile, attempts] = await Promise.all([
        axios.get(`${API_BASE}/api/user/me`, { withCredentials: true }),
        fetchMyAttempts().catch(() => null),
      ]);

      const data = profile.data;
      if (!data?.success) throw new Error(data?.message || 'Could not load profile');

      setUser(data.user);
      setStats(data.stats);
      setMockTests(data.history?.mock ?? []);

      if (attempts) {
        setPyqTests(attempts.filter((a) => a.kind === 'pyq'));
        setGeneratedTests(attempts.filter((a) => a.kind === 'generated'));
      } else {
        setPyqTests(data.history?.pyq ?? []);
        setGeneratedTests(data.history?.generated ?? []);
      }

      // Init form state
      setBio(data.user.bio || '');
      setPhotoUrl(data.user.photoUrl || '');
      setMedium(data.user.preferredMedium || 'english');
      // The account's copy leads; fall back to whatever the provider resolved
      // for this browser so the control is never blank for someone who chose a
      // track before it was stored server-side.
      setTrack_(data.user.audienceId ?? audience?.id ?? null);
      setFocus(data.user.focusExam ?? focusExam?.slug ?? null);
    } catch (err) {
      console.error("Profile Load Error:", err);
      toast.error("Failed to load profile. Please login again.");
      // Optional: navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  const counts: Record<HistoryCategory, number> = {
    pyq: pyqTests.length,
    mock: mockTests.length,
    generated: generatedTests.length,
  };

  const rowsFor = (c: HistoryCategory): (AttemptRow | MockRow)[] =>
    c === 'pyq' ? pyqTests : c === 'mock' ? mockTests : generatedTests;

  const visibleRows = useMemo(() => {
    const { search, sort } = filters[category];
    const needle = search.trim().toLowerCase();
    const matched = needle
      ? rowsFor(category).filter((r) => searchIndex(r).includes(needle))
      : rowsFor(category);
    return sortRows(matched, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, filters, pyqTests, mockTests, generatedTests]);

  const setFilter = (patch: Partial<{ search: string; sort: SortKey }>) =>
    setFilters((f) => ({ ...f, [category]: { ...f[category], ...patch } }));

  /** Newest five across all three categories, for the overview tab. */
  const recent = useMemo(
    () =>
      [...pyqTests, ...mockTests, ...generatedTests]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [pyqTests, mockTests, generatedTests]
  );

  // --- UPDATE PROFILE HANDLER ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadingToast = toast.loading("Saving changes...");
    
    try {
        const payload = {
            bio: bio,
            preferredMedium: medium,
            photoUrl: photoUrl,
            audienceId: track,
            // Cleared to null when "All exams on my track" is chosen, which is
            // why the server tests for `undefined` rather than truthiness.
            focusExam: track ? focus : null,
        };

        // ✅ ACTUAL API CALL
        const { data } = await axios.put(
            `${API_BASE}/api/user/profile`,
            payload,
            { withCredentials: true }
        );

        if (data.success) {
            // Update local state immediately
            setUser(prev => prev ? { ...prev, ...payload } : null);
            // The profile is the ONLY place a track changes now, so the change
            // has to reach the provider immediately — every listing on the site
            // is filtered by it, and waiting for the next full page load would
            // leave the visitor looking at their old track's exams.
            if (track && (track !== audience?.id || focus !== (focusExam?.slug ?? null))) {
              setTrack(track, focus);
            }
            toast.success("Profile updated successfully!");
        } else {
            toast.error(data.message || "Update failed");
        }
    } catch (error) {
        console.error("Update Error:", error);
        toast.error("Failed to connect to server");
    } finally {
        toast.dismiss(loadingToast);
    }
  };

  // --- PASSWORD RESET HANDLER ---
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!oldPass || !newPass) return toast.error("Please fill all password fields");
    
    // Placeholder for password update API
    // await axios.post(`${API_BASE}/api/user/change-password`, { oldPass, newPass });
    
    toast.success("Password functionality coming soon!");
    setOldPass(''); setNewPass('');
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full"/>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 font-sans">
      <Toaster position="top-center" reverseOrder={false} />
      {/* Opened from the Generated Mock Tests tab. Mounted at the page root so
          it is never clipped by a scrolling tab panel. */}
      <PremiumDialog open={premiumOpen} onClose={() => setPremiumOpen(false)} />
      <div className="max-w-6xl mx-auto space-y-6">

        {/* --- HEADER CARD --- */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200">
          <div className="h-32 bg-gradient-to-r from-indigo-600 to-purple-600 relative">
            <div className="absolute -bottom-12 left-6 sm:left-10">
              <div className="relative group">
                <img 
                  src={user?.photoUrl || `https://ui-avatars.com/api/?name=${user?.name}&background=random`} 
                  alt="Profile" 
                  className="h-24 w-24 sm:h-28 sm:w-28 rounded-full border-4 border-white shadow-md object-cover bg-white"
                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user?.name}`; }}
                />
                <div className="absolute bottom-2 right-2 h-4 w-4 sm:h-5 sm:w-5 bg-green-500 border-2 border-white rounded-full" title="Online"></div>
              </div>
            </div>
          </div>
          
          <div className="pt-16 pb-6 px-6 sm:px-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{user?.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 mt-2">
                <span className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-slate-400" /> {user?.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" /> Joined {new Date(user!.createdAt).toLocaleDateString()}
                </span>
                <span className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                  user?.authProvider === 'LOCAL' 
                    ? 'bg-slate-100 text-slate-600 border-slate-200' 
                    : 'bg-blue-50 text-blue-600 border-blue-100'
                }`}>
                  <Shield className="h-3 w-3" /> {user?.authProvider}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => setActiveTab('settings')}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md"
            >
              <Settings className="h-4 w-4" /> Edit Profile
            </button>
          </div>
        </div>

        {/* --- STATS ROW --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Papers Sat"
            value={stats?.totalTests ?? 0}
            icon={<BookOpen className="text-blue-600" />}
            bg="bg-blue-50"
          />
          <StatCard
            label="Tests Attempted"
            value={stats?.attemptedTests ?? 0}
            icon={<Target className="text-green-600" />}
            bg="bg-green-50"
          />
          <StatCard
            label="Average Score"
            // Both names are read because the two endpoints that can answer
            // this page disagree on the spelling. Reading only one is what
            // pinned this tile to 0% for every user.
            value={`${stats?.averageScore ?? stats?.avgScore ?? 0}%`}
            icon={<BarChart2 className="text-violet-600" />}
            bg="bg-violet-50"
          />
          <StatCard
            label="Best Score"
            value={`${stats?.bestScore ?? 0}%`}
            icon={<Trophy className="text-amber-500" />}
            bg="bg-amber-50"
          />
        </div>

        {/* --- MAIN CONTENT TABS --- */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] overflow-hidden">
          
          {/* Tabs Header */}
          <div className="flex border-b border-slate-200 overflow-x-auto">
            <TabButton label="Overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            <TabButton label="Test History" active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
            <TabButton label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
          </div>

          {/* Tab Content */}
          <div className="p-4 sm:p-8">
            
            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <h3 className="text-lg font-bold text-slate-800 mb-5">Recent Activity</h3>
                {recent.length > 0 ? (
                  <div className="space-y-3">
                    {recent.map((test) => (
                      <HistoryRow key={test.id} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : (
                  <EmptyState category="pyq" navigate={navigate} onPremium={() => setPremiumOpen(true)} />
                )}
              </motion.div>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
                  <h3 className="text-lg font-bold text-slate-800">Test History</h3>
                  <button onClick={fetchProfile} className="text-indigo-600 hover:text-indigo-700 text-sm flex items-center gap-1.5 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors">
                    <RefreshCw className="h-4 w-4" /> Refresh
                  </button>
                </div>

                {/* The three categories. Shown as a segmented control rather
                    than a dropdown because the counts are the useful part — a
                    candidate should be able to see at a glance that they have
                    sat six real papers and no generated ones. */}
                <div className="flex flex-wrap gap-2 mb-5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                        category === c
                          ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50'
                      }`}
                    >
                      {CATEGORY_ICON[c]}
                      {CATEGORY_LABEL[c]}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          category === c ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {counts[c]}
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mb-4 text-sm text-slate-500">{CATEGORY_BLURB[category]}</p>

                {/* Search and sort, held per category so switching tabs does
                    not carry one list's filter onto another. */}
                <div className="flex flex-col gap-3 sm:flex-row mb-5">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={filters[category].search}
                      onChange={(e) => setFilter({ search: e.target.value })}
                      placeholder={
                        category === 'mock'
                          ? 'Search by exam or difficulty…'
                          : 'Search by exam, year, session, shift or subject…'
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200"
                    />
                    {filters[category].search && (
                      <button
                        type="button"
                        onClick={() => setFilter({ search: '' })}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <select
                    value={filters[category].sort}
                    onChange={(e) => setFilter({ sort: e.target.value as SortKey })}
                    aria-label="Sort tests"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-200 sm:w-52"
                  >
                    {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                      <option key={k} value={k}>{SORT_LABEL[k]}</option>
                    ))}
                  </select>
                </div>

                {visibleRows.length > 0 ? (
                  <div className="space-y-3">
                    {visibleRows.map((test) => (
                      <HistoryRow key={test.id} test={test} navigate={navigate} />
                    ))}
                  </div>
                ) : counts[category] > 0 ? (
                  // Filtered to nothing is not the same as having nothing, and
                  // showing "no tests taken yet" to someone with six would be a
                  // lie about their own history.
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                    <Search className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-3 font-semibold text-slate-700">
                      No {CATEGORY_LABEL[category].toLowerCase()} match “{filters[category].search}”
                    </p>
                    <button
                      type="button"
                      onClick={() => setFilter({ search: '' })}
                      className="mt-3 text-sm font-bold text-indigo-600 underline"
                    >
                      Clear the search
                    </button>
                  </div>
                ) : (
                  <EmptyState
                    category={category}
                    navigate={navigate}
                    onPremium={() => setPremiumOpen(true)}
                  />
                )}
              </motion.div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid md:grid-cols-2 gap-12">
                
                {/* General Settings */}
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    <User className="h-5 w-5 text-indigo-500" />
                    <h3 className="text-lg font-bold text-slate-800">General Info</h3>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Name</label>
                    <input disabled value={user?.name} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed font-medium" />
                    <p className="text-xs text-slate-400 mt-1">Name cannot be changed manually.</p>
                  </div>

                  {/* Photo URL Input */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Profile Photo</label>
                    <div className="flex gap-4 items-start">
                        <img 
                            src={photoUrl || `https://ui-avatars.com/api/?name=${user?.name}`} 
                            alt="Preview"
                            className="h-12 w-12 rounded-full object-cover border border-slate-200 flex-shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${user?.name}`; }}
                        />
                        <div className="flex-1 w-full">
                            <div className="relative">
                                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                                <input 
                                    type="text"
                                    value={photoUrl}
                                    onChange={(e) => setPhotoUrl(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm transition-all"
                                    placeholder="https://example.com/photo.jpg"
                                />
                            </div>
                        </div>
                    </div>
                  </div>

                  {/* THE track control.
                      It lives here and only here. Every exam list, the
                      generator's dropdown and the career tools are filtered by
                      it, so changing it is a deliberate act on the profile
                      rather than a stray click on a "show me everything" link
                      buried in a listing. */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      What are you preparing for?
                    </label>
                    <div className="space-y-2">
                      {trackOptions.map((opt) => (
                        <label
                          key={opt.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                            track === opt.id
                              ? 'border-indigo-500 bg-indigo-50'
                              : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="track"
                            checked={track === opt.id}
                            onChange={() => setTrack_(opt.id)}
                            className="mt-1 h-4 w-4 accent-indigo-600"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                            <span className="block text-xs leading-relaxed text-slate-500">{opt.tagline}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      This decides which exams and tools you see, on every device you sign in from.
                    </p>

                    {/* Narrow further to ONE exam. Separate from the track
                        because they answer different questions: the track is
                        what kind of candidate you are, this is which paper you
                        are actually sitting. Naming one hides the others
                        entirely — clearing it brings the whole track back. */}
                    {trackExams.length > 1 && (
                      <div className="mt-4">
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Focus on one exam
                        </label>
                        <select
                          value={focus ?? ''}
                          onChange={(e) => setFocus(e.target.value || null)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none cursor-pointer"
                        >
                          <option value="">All {trackExams.length} exams on my track</option>
                          {trackExams.map((e) => (
                            <option key={e.slug} value={e.slug}>{e.name} only</option>
                          ))}
                        </select>
                        <p className="mt-1.5 text-xs text-slate-400">
                          Pick one and the rest are hidden everywhere on the site.
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Preferred Language</label>
                    <div className="relative">
                        <select 
                        value={medium} 
                        onChange={(e) => setMedium(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none appearance-none cursor-pointer"
                        >
                        <option value="english">English</option>
                        <option value="hindi">Hindi</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bio</label>
                    <textarea 
                      value={bio} 
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                      placeholder="Tell us about your study goals..."
                    />
                  </div>
                  
                  <button  type="submit" className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all transform active:scale-95">
                    <Save className="h-4 w-4" /> Save Changes
                  </button>
                </form>

                {/* Security Settings */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <Lock className="h-5 w-5 text-indigo-500" />
                        <h3 className="text-lg font-bold text-slate-800">Security</h3>
                    </div>

                    {user?.authProvider === 'LOCAL' ? (
                    <form onSubmit={handlePasswordReset} className="space-y-4">
                        <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Current Password</label>
                        <input 
                            type="password" 
                            value={oldPass}
                            onChange={(e) => setOldPass(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="••••••••"
                        />
                        </div>
                        <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
                        <input 
                            type="password" 
                            value={newPass}
                            onChange={(e) => setNewPass(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="••••••••"
                        />
                        </div>

                        <button className="w-full sm:w-auto px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold transition-all shadow-lg shadow-slate-200">
                        Update Password
                        </button>
                    </form>
                    ) : (
                    <div className="bg-blue-50/50 p-8 rounded-2xl border border-blue-100 flex flex-col items-center justify-center text-center h-64">
                        <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                            <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                        <h4 className="font-bold text-blue-900 text-lg">Managed by {user?.authProvider}</h4>
                        <p className="text-sm text-blue-600 mt-2 max-w-xs leading-relaxed">
                        Your account security is managed by your social login provider. You don't need to manage a password here.
                        </p>
                    </div>
                    )}
                </div>

              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB COMPONENTS ---

const StatCard = ({ label, value, icon, bg }: any) => (
  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-5 hover:shadow-md transition-all duration-300">
    <div className={`p-4 rounded-xl ${bg} flex-shrink-0`}>
      {React.cloneElement(icon, { className: `h-6 w-6 ${icon.props.className}` })}
    </div>
    <div>
      <p className="text-slate-400 text-xs uppercase tracking-wider font-bold mb-1">{label}</p>
      <h3 className="text-2xl font-black text-slate-800">{value}</h3>
    </div>
  </div>
);

const TabButton = ({ label, active, onClick }: any) => (
  <button
    onClick={onClick}
    className={`px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
      active 
        ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10' 
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
    }`}
  >
    {label}
  </button>
);

const CATEGORY_ICON: Record<HistoryCategory, React.ReactNode> = {
  pyq: <FileText className="h-4 w-4" />,
  mock: <BookOpen className="h-4 w-4" />,
  generated: <Sparkles className="h-4 w-4" />,
};

const CATEGORY_BLURB: Record<HistoryCategory, string> = {
  pyq: 'Real papers you sat exactly as they were printed — every question, in order, under the original marking scheme.',
  mock: 'Mock papers you configured yourself on the generate screen: your exam, your topics, your question count.',
  generated: 'Balanced papers drawn automatically from the question bank to the official exam pattern.',
};

/**
 * One row of history.
 *
 * Handles all three categories rather than three near-identical components,
 * because they differ in only two places: what identifies the paper, and where
 * "review" goes. A mock test is a TestSession and reviews at
 * /tests/:id/result; a PYQ or generated attempt is a PyqAttempt and reviews at
 * /pyq/attempt/:id. Sending the second kind to the first route is what made
 * every real paper's "view result" button 404.
 */
const HistoryRow = ({ test, navigate }: { test: AttemptRow | MockRow; navigate: any }) => {
  const isMock = test.kind === 'mock';
  const percent = isMock ? (test as MockRow).scorePercent : (test as AttemptRow).percent;
  const attempted = percent != null;

  const attempt = test as AttemptRow;
  const mock = test as MockRow;

  const title = isMock
    ? mock.examType
    : [attempt.examName, attempt.year].filter(Boolean).join(' ');

  // The facets that identify WHICH paper this was — session, date, shift and,
  // for a single-subject draw, the subject. Without them a history of six JEE
  // Main papers is six identical rows.
  //
  // Attempts recorded before those became columns carry only the joined
  // `label`, so that is the fallback. Deliberately NOT parsed back apart: the
  // string is already exactly what we would render, and splitting it on " · "
  // would break the moment a shift label contained one.
  const discreteFacets = [
    attempt.sessionLabel,
    attempt.dateLabel,
    attempt.shiftLabel,
    attempt.subject,
  ];
  const facets = isMock
    ? [mock.difficulty, `${mock.totalQuestions} questions`, SOURCE_LABEL[mock.sourceType] ?? mock.sourceType]
    : discreteFacets.some(Boolean)
      ? discreteFacets
      : [attempt.label, attempt.subject];

  const reviewHref = isMock ? `/tests/${mock.sessionId}/result` : `/pyq/attempt/${attempt.id}`;

  return (
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all duration-300 gap-4">
      <div className="flex items-start gap-4 min-w-0">
        <div
          className={`mt-2 h-3 w-3 rounded-full flex-shrink-0 ${
            !attempted
              ? 'bg-slate-300'
              : percent! >= 50
                ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
          }`}
        />
        <div className="min-w-0">
          <h4 className="font-bold text-slate-800 text-lg group-hover:text-indigo-700 transition-colors">
            {title}
          </h4>

          {facets.filter(Boolean).length > 0 && (
            <p className="mt-0.5 text-sm text-slate-600 truncate">
              {facets.filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-2">
            <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md font-medium">
              <Clock className="h-3 w-3" /> {fmtDate(test.createdAt)}
            </span>
            {!isMock && attempt.timeTakenSeconds != null && (
              <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-md font-medium">
                <Timer className="h-3 w-3" /> {hhmmss(attempt.timeTakenSeconds)}
              </span>
            )}
            {/* Only rendered once enough other candidates have sat the same
                paper — the server withholds it below that, so an absent
                percentile means "not enough data", never "zero". */}
            {!isMock && attempt.percentile != null && (
              <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md font-bold">
                <Award className="h-3 w-3" /> {attempt.percentile} percentile
                {attempt.rank != null && ` · rank ${attempt.rank}/${attempt.outOf}`}
              </span>
            )}
            {!attempted && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md font-bold uppercase text-[10px] tracking-wide">
                Not attempted
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pl-7 sm:pl-0 border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
        <div className="text-left sm:text-right">
          <span className="block text-xl font-black text-slate-900">
            {attempted ? `${percent}%` : '—'}
          </span>
          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            {isMock
              ? `${mock.correct}/${mock.totalQuestions}`
              : `${attempt.score}/${attempt.totalMarks} marks`}
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate(reviewHref)}
            className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100"
            title="Review questions, answers and solutions"
            aria-label="Review this attempt"
          >
            <Eye className="h-5 w-5" />
          </button>
          {/* Retaking is offered where it means something. A mock test can be
              re-run and a real paper can be sat again; a generated paper was a
              one-off draw, and "retake" would hand over a different paper
              under the same name. */}
          {test.kind !== 'generated' && (
            <button
              onClick={() =>
                navigate(isMock ? `/tests/${mock.sessionId}` : `/pyq/${attempt.paperId}`)
              }
              className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100"
              title="Sit this paper again"
              aria-label="Sit this paper again"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** What a TestSession's sessionType means to a reader. */
const SOURCE_LABEL: Record<string, string> = {
  mock: 'Full mock · AI',
  practice: 'Practice · AI',
  pyq: 'Built from previous year questions',
};

/** Each category gets its own way out, because they are reached differently. */
const EmptyState = ({
  category,
  navigate,
  onPremium,
}: {
  category: HistoryCategory;
  navigate: any;
  onPremium: () => void;
}) => {
  // An empty state's whole job is the button. Sending someone who has never sat
  // a test to a paywall is the one outcome worse than the empty list.
  const generator = useAiGenerator();

  const copy = {
    pyq: {
      title: 'No previous year papers sat yet',
      body: 'Pick an exam, year and shift and sit the real paper under the original clock and marking scheme. Every attempt is saved here.',
      cta: 'Browse previous year papers',
      action: () => navigate('/pyq'),
    },
    mock: {
      title: 'No mock tests yet',
      body: 'Build a paper around your own exam, topics, difficulty and question count.',
      cta: generator.allowed ? 'Create a mock test' : 'Build a practice paper',
      action: () => navigate(generator.path),
    },
    generated: {
      title: 'No generated mock tests yet',
      body: 'Balanced papers drawn straight from the question bank in the official exam pattern.',
      cta: 'Generate a mock test',
      action: onPremium,
    },
  }[category];

  return (
    <div className="text-center py-16 flex flex-col items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
      <div className="bg-white p-4 rounded-full mb-4 shadow-sm">
        {category === 'generated' ? (
          <Sparkles className="h-8 w-8 text-indigo-400" />
        ) : (
          <BookOpen className="h-8 w-8 text-indigo-400" />
        )}
      </div>
      <h3 className="text-lg font-bold text-slate-900">{copy.title}</h3>
      <p className="text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed px-4">{copy.body}</p>
      <button
        onClick={copy.action}
        className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 transform hover:-translate-y-0.5"
      >
        {copy.cta}
      </button>
    </div>
  );
};