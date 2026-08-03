import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FAQS } from '../lib/seo';
import { EXAMS, examPath } from '../lib/exams';
import { 
  BookOpen, 
  CheckCircle, 
  ChevronRight, 
  Search, 
  Sparkles, 
  Target, 
  X,
  FileText,
} from 'lucide-react';
import axios from "axios";
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface User {
  name: string;
  email: string;
  photoUrl?: string;
}

interface ExamCategory {
  id: string;
  name: string;
  code?: string | null;
}

// Featured exams are driven by lib/exams.ts so the cards, the landing pages,
// the sitemap and the JSON-LD can never disagree about which exams exist.
const CATEGORY_COLORS: Record<string, string> = {
  Engineering: "bg-blue-100 text-blue-700",
  Graduate: "bg-red-100 text-red-700",
  Railways: "bg-orange-100 text-orange-700",
  Medical: "bg-green-100 text-green-700",
  "Civil Services": "bg-purple-100 text-purple-700",
  Government: "bg-indigo-100 text-indigo-700",
};

const HomePage: React.FC = () => {
  // --- State ---
  const [user, setUser] = useState<User | null>(null);
  const [typedText, setTypedText] = useState("");
  
  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [allCategories, setAllCategories] = useState<ExamCategory[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<ExamCategory[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Hook for navigation
  const navigate = useNavigate();
  
 const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';


  const api = axios.create({
    baseURL: API_BASE,
    withCredentials: true, 
  });

  // --- 1. Auth & Typing Effect ---
  useEffect(() => {
    let timeoutId: any;
    const fetchUser = async () => {
      try {
        const res = await api.get("/api/auth/me");
        setUser(res.data.user);
        
        // Typing Effect
        const firstName = res.data.user.name.split(" ")[0];
        const fullText = `Welcome, ${firstName}`;
        let index = 0;
        let isDeleting = false;
        const type = () => {
          setTypedText(fullText.substring(0, index));
          if (!isDeleting && index < fullText.length) {
            index++;
            timeoutId = setTimeout(type, 100);
          } else if (!isDeleting && index === fullText.length) {
            timeoutId = setTimeout(() => { isDeleting = true; type(); }, 3000);
          } else if (isDeleting && index > 0) {
            index--;
            timeoutId = setTimeout(type, 50);
          } else {
            isDeleting = false;
            timeoutId = setTimeout(type, 500);
          }
        };
        type();
      } catch {
        setUser(null);
      }
    };
    fetchUser();
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, []);

  // --- 2. Fetch Exam Categories for Search ---
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/category/exam-categories`);
        setAllCategories(res.data || []);
      } catch (error) {
        console.error("Failed to load search categories");
      }
    };
    fetchCategories();

    // Click outside listener to close dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- 3. Handle Search Input ---
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchTerm(query);
    setShowDropdown(true);

    if (query.trim() === "") {
      setFilteredCategories([]);
    } else {
      const filtered = allCategories.filter((cat) => 
        cat.name.toLowerCase().includes(query.toLowerCase()) || 
        (cat.code && cat.code.toLowerCase().includes(query.toLowerCase()))
      );
      setFilteredCategories(filtered);
    }
  };

  // --- 4. Navigation Handlers ---
  const handleStartTest = (examCode?: string) => {
    if (!user) {
      navigate("/signup", {
        state: { redirectTo: "/GenerateTestPage", selectedExam: examCode },
      });
      return;
    }
    // Navigate with the specific exam code pre-selected
    navigate("/GenerateTestPage", {
      state: examCode ? { selectedExam: examCode } : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      
      <main>
        {/* ================= HERO SECTION ================= */}
        <section className="hero relative overflow-hidden">
           <div className="shell">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div className="max-w-2xl">
                {typedText && (
                  <div className="mb-5 h-9 text-2xl font-bold tracking-tight" style={{ color: "var(--c-brand)" }}>
                    {typedText}
                    <span className="ml-1 animate-pulse">|</span>
                  </div>
                )}
                <span className="chip chip-free mb-5">
                  Free · JEE Main · NEET UG · GATE · SSC CGL · RRB NTPC · UPSC
                </span>
                {/* Solid ink heading with a single coloured phrase. The old
                    indigo-to-violet gradient across the headline is the most
                    recognisable "AI-generated site" signature; none of the real
                    exam-prep sites use one. */}
                <h1 className="mb-5 text-[34px] font-extrabold leading-[1.12] tracking-tight sm:text-[44px] lg:text-[52px]">
                  Free AI mock tests for{" "}
                  <span style={{ color: "var(--c-brand)" }}>India&rsquo;s toughest exams</span>
                </h1>
                <p className="mb-7 max-w-xl text-[17px] leading-relaxed muted">
                  Questivo generates unlimited, syllabus-accurate practice papers for JEE Main,
                  NEET UG, GATE, SSC CGL, RRB NTPC and UPSC — scored instantly, with a
                  step-by-step explanation on every question.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => handleStartTest()} className="btn btn-primary btn-lg">
                    Start practising free <ChevronRight className="h-4 w-4" />
                  </button>
                  <Link to="/mock-test/jee-main" className="btn btn-secondary btn-lg">
                    Browse exams
                  </Link>
                </div>
                <p className="mt-4 text-sm muted">
                  No payment details required. Questions are never repeated between attempts.
                </p>
              </div>
              
              {/* Hero Image */}
              <div className="relative mx-auto w-full max-w-[600px] lg:max-w-none">
                 <div className="absolute -top-12 -right-12 h-[400px] w-[400px] rounded-full bg-indigo-100 blur-3xl opacity-50"></div>
                 <div className="relative rounded-[10px] bg-white p-2 ">
                    {/* LCP element. The src must stay identical to the
                        <link rel="preload"> in index.html or the preload is
                        wasted and the image is fetched twice. */}
                    <img
                      src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop"
                      alt="Student preparing for a competitive exam on a laptop"
                      width={1200}
                      height={900}
                      fetchPriority="high"
                      decoding="async"
                      className="rounded-xl object-cover aspect-[4/3] w-full"
                    />
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= SEARCH & STATS BAR ================= */}
        <section className="bg-white border-y border-slate-100 py-10 relative z-20">
          <div className="shell">
            
            {/* Search Container */}
            {/* No negative margin. The old -mt-32 floated this box up over
                whatever section happened to precede it, which broke twice: once
                overlapping the ATS panel, and again over the hero CTA when the
                hero padding was tightened. In-flow spacing cannot drift. */}
            <div ref={searchRef} className="relative mx-auto mb-10 max-w-3xl">
              <div className="relative rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-900/5 flex items-center gap-2">
                <Search className="ml-4 h-5 w-5 muted shrink-0" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search your exam (e.g., RRB NTPC, GATE ME...)" 
                  className="flex-1 border-0 bg-transparent py-4 text-slate-900 placeholder:muted focus:ring-0 focus:outline-none sm:text-sm"
                />
                
                {searchTerm && (
                  <button onClick={() => { setSearchTerm(""); setFilteredCategories([]); }} className="muted hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}

                <button 
                  onClick={() => handleStartTest()}
                  className="hidden sm:block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shrink-0"
                >
                  Create Custom
                </button>
              </div>

              {/* DROPDOWN RESULTS */}
              <AnimatePresence>
                {showDropdown && searchTerm && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden z-50 max-h-[300px] overflow-y-auto custom-scrollbar"
                  >
                    {filteredCategories.length > 0 ? (
                      <div>
                        <div className="px-4 py-2 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Matching Exams
                        </div>
                        {filteredCategories.map((category) => (
                          <div 
                            key={category.id}
                            onClick={() => {
                              handleStartTest(category.code || category.id);
                              setShowDropdown(false);
                            }}
                            className="flex items-center justify-between px-4 py-3 hover:bg-indigo-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0 group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                <BookOpen className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800 text-sm group-hover:text-indigo-700">
                                  {category.name}
                                </p>
                                {category.code && (
                                  <p className="text-xs muted">{category.code}</p>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-500" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-slate-500">
                        <Search className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                        <p>No exams found matching "{searchTerm}"</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4 text-center">
               {[
                 { label: "Active Exams", val: "50+" },
                 { label: "Questions Generated", val: "1M+" },
                 { label: "Active Users", val: "25k+" },
                 { label: "Success Rate", val: "92%" }
               ].map((stat, idx) => (
                 <div key={idx}>
                   <p className="text-3xl font-bold text-slate-900">{stat.val}</p>
                   <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* ================= RESUME ATS SECTION (NEW) ================= */}
        <section className="py-20 bg-white border-y border-slate-100">
          <div className="shell">
            <div className="bg-slate-900 rounded-[10px] p-8 md:p-16 flex flex-col md:flex-row items-center gap-12 shadow-sm">
              <div className="flex-1 space-y-6">
                <h2 className="text-3xl font-bold text-white sm:text-4xl">Resume ATS Analyzer</h2>
                <p className="text-slate-400 text-lg">Don't let your resume get rejected by ATS filters. Upload your resume to get an instant AI-powered audit, keyword improvements, and bullet-point rewrites.</p>
                <button onClick={() => navigate("/resume_ats_score")} className="btn btn-primary btn-lg">
                  Analyze My Resume <FileText className="w-5 h-5" />
                </button>
              </div>
              <div className="w-full md:w-1/3 text-center p-8 bg-white/5 rounded-[10px] border border-white/10">
                 <FileText className="w-20 h-20 text-indigo-400 mx-auto mb-4" />
                 <p className="text-white font-bold text-xl">Instant Audit</p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= AVAILABLE TESTS / EXAMS ================= */}
        <section id="exams" className="py-20 bg-slate-50">
          <div className="shell">
            <div className="mb-12 flex flex-col items-center text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Featured Exams
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                Popular exams taken by students this week.
              </p>
            </div>

            {/* Real <Link>s, not onClick divs. These were previously plain
                divs, so crawlers could not follow them and the exam pages had
                no inbound internal links at all. */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMS.map((exam) => (
                <Link
                  key={exam.code}
                  to={examPath(exam)}
                  className="card card-hover group relative overflow-hidden p-5"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                        CATEGORY_COLORS[exam.category] ?? "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {exam.category}
                    </span>
                    <div className="rounded-full bg-slate-50 p-2 muted transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                      <Target className="h-5 w-5" />
                    </div>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900 group-hover:text-indigo-600">
                    {exam.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{exam.summary}</p>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-medium text-slate-500">
                      Free mock tests
                    </span>
                    <span className="text-sm font-semibold text-indigo-600 group-hover:underline">
                      View {exam.shortName} tests &rarr;
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FEATURES SECTION ================= */}
        <section id="features" className="py-20 bg-white">
          <div className="shell">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div className="relative order-2 lg:order-1">
                <img
                  src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1200&auto=format&fit=crop"
                  alt="Students comparing mock test results and discussing solutions"
                  width={1200}
                  height={800}
                  loading="lazy"
                  decoding="async"
                  className="rounded-[10px] shadow-sm"
                />
              </div>
              
              <div className="order-1 lg:order-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl mb-6">
                  Why Questivo?
                </h2>
                <div className="space-y-8">
                  {[
                    { title: "Smart Difficulty Adjustment", desc: "Our AI adjusts question difficulty in real-time based on your performance." },
                    { title: "Detailed Explanations", desc: "Don't just get the answer. Understand the 'Why' behind every solution." },
                    { title: "Exam-Specific Patterns", desc: "We strictly follow the latest blueprints for JEE, GATE, and SSC exams." }
                  ].map((feature, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <CheckCircle className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{feature.title}</h3>
                        <p className="text-slate-600 mt-1">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= FAQ =================
            Rendered from the same FAQS array that feeds the FAQPage JSON-LD in
            lib/seo.ts. Google requires FAQ structured data to correspond to
            content visible on the page, so these must never diverge — which is
            why both read from one source instead of being written twice.

            Answers are deliberately self-contained: an answer engine quoting
            one of them should still produce a correct, complete statement
            without the surrounding page. */}
        <section id="faq" className="py-20 bg-slate-50 border-t border-slate-100">
          <div className="shell">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Frequently asked questions
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                What students ask before their first mock test on Questivo.
              </p>
            </div>

            <div className="mx-auto max-w-3xl divide-y divide-slate-200 rounded-[10px] bg-white px-6 shadow-sm ring-1 ring-slate-200">
              {FAQS.map((faq) => (
                <details key={faq.q} className="group py-5">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 text-left font-semibold text-slate-900 marker:content-none [&::-webkit-details-marker]:hidden">
                    <h3 className="text-base">{faq.q}</h3>
                    <ChevronRight className="h-5 w-5 shrink-0 muted transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 leading-relaxed text-slate-600">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="bg-slate-900 py-12 muted">
        <div className="shell">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                <span className="text-xl font-bold text-white">Questivo</span>
              </div>
              <p className="text-sm">
                Empowering students with AI-generated assessments to conquer their academic goals.
              </p>
            </div>
            
            {/* Every entry points at a route that actually exists. The previous
                href="#" placeholders passed no link equity and gave crawlers
                nothing to follow. */}
            {[
              {
                title: "Practice",
                links: [
                  { label: "Generate a mock test", to: "/GenerateTestPage" },
                  { label: "Featured exams", to: "/#exams" },
                  { label: "Why Questivo", to: "/#features" },
                ],
              },
              {
                title: "Career tools",
                links: [
                  { label: "ATS resume checker", to: "/resume_ats_score" },
                  { label: "AI mock interview", to: "/interviews" },
                ],
              },
              {
                title: "Help",
                links: [
                  { label: "Frequently asked questions", to: "/#faq" },
                  { label: "Your profile", to: "/profile" },
                ],
              },
            ].map((col) => (
              <div key={col.title}>
                <h4 className="font-bold text-white mb-4">{col.title}</h4>
                <ul className="space-y-2 text-sm">
                  {col.links.map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} className="hover:text-indigo-400 transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {/* Sitewide links to every exam page. Competitors in this vertical
              run 300–1300 internal links per page; this is the cheap, honest
              version of that — one crawlable link per page that exists. */}
          <div className="mt-12 border-t border-slate-800 pt-8">
            <h4 className="mb-4 font-bold text-white">Free mock tests by exam</h4>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {EXAMS.map((e) => (
                <li key={e.slug}>
                  <Link
                    to={examPath(e)}
                    className="hover:text-indigo-400 transition-colors"
                  >
                    {e.name} mock test
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-10 border-t border-slate-800 pt-8 text-center text-sm">
            &copy; {new Date().getFullYear()} Questivo Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;