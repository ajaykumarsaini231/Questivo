import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  BrainCircuit, 
  CheckCircle, 
  ChevronRight, 
  Search, 
  Sparkles, 
  Target, 
  // Loader2,
  X
} from 'lucide-react';
import axios from "axios";
import { motion, AnimatePresence } from 'framer-motion';

// import Header from './Header';

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

// --- Data (Static Featured Exams) ---
const FEATURED_EXAMS = [
  { title: "NTA JEE Mains", code: "NTA_JEE_MAIN_2025", category: "Engineering", color: "bg-blue-100 text-blue-700" },
  { title: "GATE MT (Metallurgy)", code: "GATE_MT", category: "Graduate", color: "bg-red-100 text-red-700" }, 
  { title: "RRB NTPC Graduate", code: "RRB_NTPC_GRAD_06_2025", category: "Railways", color: "bg-orange-100 text-orange-700" },
  { title: "NEET UG", code: "NEET_2025", category: "Medical", color: "bg-green-100 text-green-700" },
  { title: "UPSC IAS", code: "UPSC_IAS_IFS_2024", category: "Civil Services", color: "bg-purple-100 text-purple-700" },
  { title: "SSC CGL", code: "SSC_CGL_2024", category: "Government", color: "bg-indigo-100 text-indigo-700" },
];

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
  
  const API_BASE =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_API_URL) ||
    (typeof process !== "undefined" && (process.env as any).REACT_APP_API_URL) ||
    "http://localhost:4000";

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
      
      {/* {<Header/>} */}
      
      <main>
        {/* ================= HERO SECTION ================= */}
        <section className="relative overflow-hidden pt-12 pb-20 lg:pt-24 lg:pb-32">
           <div className="container mx-auto px-4 md:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div className="max-w-2xl">
                {typedText && (
                  <div className="mb-6 h-10 text-3xl font-bold tracking-tight text-slate-800">
                    <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                      {typedText}
                    </span>
                    <span className="ml-1 animate-pulse text-indigo-600">|</span>
                  </div>
                )}
                <div className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-600 mb-6">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-600 mr-2"></span>
                  New: AI-Generated Mock Tests for GATE 2025
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl mb-6 leading-[1.15]">
                  Master Your Exams with <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
                    AI-Powered Precision
                  </span>
                </h1>
                <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                  Quistivo generates unlimited, syllabus-accurate practice questions for JEE, GATE, and SSC exams.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <button onClick={() => handleStartTest()} className="inline-flex h-12 items-center justify-center rounded-lg bg-indigo-600 px-8 text-base font-semibold text-white shadow-xl shadow-indigo-200 transition-all hover:bg-indigo-700 hover:translate-y-[-2px]">
                    Start Practicing Now <ChevronRight className="ml-2 h-4 w-4" />
                  </button>
                </div>
              </div>
              
              {/* Hero Image */}
              <div className="relative mx-auto w-full max-w-[600px] lg:max-w-none">
                 <div className="absolute -top-12 -right-12 h-[400px] w-[400px] rounded-full bg-indigo-100 blur-3xl opacity-50"></div>
                 <div className="relative rounded-2xl bg-white p-2 shadow-2xl shadow-indigo-900/10">
                    <img src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1740&auto=format&fit=crop" alt="Student" className="rounded-xl object-cover aspect-[4/3] w-full"/>
                 </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= SEARCH & STATS BAR (UPDATED) ================= */}
        <section className="bg-white border-y border-slate-100 py-10 relative z-20">
          <div className="container mx-auto px-4 md:px-6">
            
            {/* Search Container */}
            <div ref={searchRef} className="relative mx-auto max-w-3xl -mt-16 mb-12">
              <div className="relative rounded-xl bg-white p-2 shadow-xl ring-1 ring-slate-900/5 flex items-center gap-2">
                <Search className="ml-4 h-5 w-5 text-slate-400 shrink-0" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search your exam (e.g., RRB NTPC, GATE ME...)" 
                  className="flex-1 border-0 bg-transparent py-4 text-slate-900 placeholder:text-slate-400 focus:ring-0 focus:outline-none sm:text-sm"
                />
                
                {/* Clear Button */}
                {searchTerm && (
                  <button onClick={() => { setSearchTerm(""); setFilteredCategories([]); }} className="text-slate-400 hover:text-slate-600">
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
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 max-h-[300px] overflow-y-auto custom-scrollbar"
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
                                  <p className="text-xs text-slate-400">{category.code}</p>
                                )}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-500" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-slate-500">
                        <Search className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        <p>No exams found matching "{searchTerm}"</p>
                        <button 
                          onClick={() => handleStartTest()} // Fallback to generic page
                          className="mt-2 text-sm text-indigo-600 hover:underline"
                        >
                          Browse all exams instead
                        </button>
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

        {/* ================= AVAILABLE TESTS / EXAMS (Bottom Grid) ================= */}
        <section id="exams" className="py-20 bg-slate-50">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mb-12 flex flex-col items-center text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Featured Exams
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-slate-600">
                Popular exams taken by students this week.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURED_EXAMS.map((exam) => (
                <div 
                  key={exam.code} 
                  onClick={() => handleStartTest(exam.code)}
                  className="group relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all hover:shadow-md hover:ring-indigo-200 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${exam.color}`}>
                      {exam.category}
                    </span>
                    <div className="rounded-full bg-slate-50 p-2 text-slate-400 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                      <Target className="h-5 w-5" />
                    </div>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-slate-900 group-hover:text-indigo-600">
                    {exam.title}
                  </h3>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-medium text-slate-500">Fast Track</span>
                    <span className="text-sm font-semibold text-indigo-600 group-hover:underline">
                      Start Test &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-12 text-center">
              <button 
                onClick={() => handleStartTest()}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Browse Full Catalog
              </button>
            </div>
          </div>
        </section>

        {/* ================= FEATURES SECTION ================= */}
        <section id="features" className="py-20 bg-white">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div className="relative order-2 lg:order-1">
                <img 
                  src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=1742&auto=format&fit=crop" 
                  alt="Students discussing" 
                  className="rounded-2xl shadow-2xl"
                />
                <div className="absolute -right-8 top-1/2 hidden h-40 w-40 -translate-y-1/2 items-center justify-center rounded-xl bg-indigo-600 p-4 text-white shadow-xl lg:flex animate-pulse">
                  <div className="text-center">
                    <BrainCircuit className="mx-auto h-10 w-10 mb-2" />
                    <p className="font-bold">AI Driven</p>
                    <p className="text-xs opacity-80">Analysis</p>
                  </div>
                </div>
              </div>
              
              <div className="order-1 lg:order-2">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl mb-6">
                  Why Quistivo?
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
      </main>

      {/* ================= FOOTER ================= */}
      <footer className="bg-slate-900 py-12 text-slate-400">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                <span className="text-xl font-bold text-white">Quistivo</span>
              </div>
              <p className="text-sm">
                Empowering students with AI-generated assessments to conquer their academic goals.
              </p>
            </div>
            
            {[
              { title: "Platform", links: ["Exams", "Pricing", "Teachers", "AI Models"] },
              { title: "Company", links: ["About Us", "Careers", "Blog", "Contact"] },
              { title: "Legal", links: ["Privacy", "Terms", "Cookie Policy"] }
            ].map((col, idx) => (
              <div key={idx}>
                <h4 className="font-bold text-white mb-4">{col.title}</h4>
                <ul className="space-y-2 text-sm">
                  {col.links.map(link => (
                    <li key={link}><a href="#" className="hover:text-indigo-400 transition-colors">{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 border-t border-slate-800 pt-8 text-center text-sm">
            &copy; {new Date().getFullYear()} Quistivo Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;