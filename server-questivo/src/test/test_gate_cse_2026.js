// src/test/test_gate_cse_2026.js
// Safe seeder for GATE CSE 2026 topics (used by master all_test.js).
// Exports default async function seed(prisma).

const EXAM_CODE = "GATE_CSE_2026";
const EXAM_NAME = "GATE CSE 2026 (IIT Guwahati)";

// -------------------------
// Section 1: Engineering Mathematics
// -------------------------
const mathTopics = [
  { name: "Discrete Mathematics: Logic, sets, relations, functions, partial orders, lattices, monoids, groups, graphs, combinatorics", code: "GATE_CSE_MATH_DISCRETE", order: 100 },
  { name: "Linear Algebra: Matrices, determinants, linear systems, eigenvalues & eigenvectors, LU decomposition", code: "GATE_CSE_MATH_LINEAR_ALG", order: 101 },
  { name: "Calculus: Limits, continuity, differentiability, maxima/minima, mean value theorem, integration", code: "GATE_CSE_MATH_CALCULUS", order: 102 },
  { name: "Probability & Statistics: Random variables, uniform/normal/exponential/Poisson/binomial, mean/median/mode, conditional probability", code: "GATE_CSE_MATH_PROB_STAT", order: 103 },
];

// -------------------------
// Section 2: Digital Logic
// -------------------------
const digitalLogicTopics = [
  { name: "Boolean Algebra & Logic Minimization", code: "GATE_CSE_DIGITAL_BOOL", order: 200 },
  { name: "Combinational Circuits & Sequential Circuits", code: "GATE_CSE_DIGITAL_COMB_SEQ", order: 201 },
  { name: "Number Representations & Computer Arithmetic (fixed & floating point)", code: "GATE_CSE_DIGITAL_ARITH", order: 202 },
];

// -------------------------
// Section 3: Computer Organization & Architecture
// -------------------------
const coaTopics = [
  { name: "Machine Instructions & Addressing Modes", code: "GATE_CSE_COA_INSTR_ADDR", order: 300 },
  { name: "ALU, Data-path & Control Unit", code: "GATE_CSE_COA_ALU", order: 301 },
  { name: "Instruction Pipelining & Hazards", code: "GATE_CSE_COA_PIPELINE", order: 302 },
  { name: "Memory Hierarchy: Cache, Main Memory, Secondary Storage", code: "GATE_CSE_COA_MEMORY", order: 303 },
  { name: "I/O Interface: Interrupts & DMA", code: "GATE_CSE_COA_IO", order: 304 },
];

// -------------------------
// Section 4: Programming & Data Structures
// -------------------------
const pdsTopics = [
  { name: "Programming in C & Recursion", code: "GATE_CSE_PDS_C_RECURSION", order: 400 },
  { name: "Arrays, Stacks, Queues, Linked Lists", code: "GATE_CSE_PDS_LINEAR_DS", order: 401 },
  { name: "Trees, Binary Search Trees, Binary Heaps", code: "GATE_CSE_PDS_TREES", order: 402 },
  { name: "Graphs (representations & basics)", code: "GATE_CSE_PDS_GRAPHS", order: 403 },
];

// -------------------------
// Section 5: Algorithms
// -------------------------
const algoTopics = [
  { name: "Searching, Sorting & Hashing", code: "GATE_CSE_ALGO_SEARCH_SORT_HASH", order: 500 },
  { name: "Asymptotic Complexity (time & space)", code: "GATE_CSE_ALGO_COMPLEXITY", order: 501 },
  { name: "Design Techniques: Greedy, DP, Divide & Conquer", code: "GATE_CSE_ALGO_DESIGN", order: 502 },
  { name: "Graph Algorithms: Traversals, MST, Shortest Paths", code: "GATE_CSE_ALGO_GRAPH", order: 503 },
];

// -------------------------
// Section 6: Theory of Computation
// -------------------------
const tocTopics = [
  { name: "Regular Expressions & Finite Automata", code: "GATE_CSE_TOC_REGEX_FA", order: 600 },
  { name: "Context-Free Grammars & Push-Down Automata", code: "GATE_CSE_TOC_CFG_PDA", order: 601 },
  { name: "Regular & Context-Free Languages, Pumping Lemma", code: "GATE_CSE_TOC_LANG_PUMP", order: 602 },
  { name: "Turing Machines & Undecidability", code: "GATE_CSE_TOC_TM_UNDEC", order: 603 },
];

// -------------------------
// Section 7: Compiler Design
// -------------------------
const compilerTopics = [
  { name: "Lexical Analysis & Parsing", code: "GATE_CSE_COMPILER_LEX_PARSE", order: 700 },
  { name: "Syntax-directed Translation & Intermediate Code Generation", code: "GATE_CSE_COMPILER_SYN_TRANS", order: 701 },
  { name: "Runtime Environments & Local Optimization", code: "GATE_CSE_COMPILER_RUNTIME_OPT", order: 702 },
  { name: "Data-flow Analyses: Liveness, Constant Propagation, CSE", code: "GATE_CSE_COMPILER_DFA", order: 703 },
];

// -------------------------
// Section 8: Operating Systems
// -------------------------
const osTopics = [
  { name: "Processes, Threads & System Calls", code: "GATE_CSE_OS_PROCS_THREADS", order: 800 },
  { name: "Inter-process Communication, Concurrency & Synchronization, Deadlock", code: "GATE_CSE_OS_IPC_SYNC", order: 801 },
  { name: "CPU & I/O Scheduling", code: "GATE_CSE_OS_SCHEDULING", order: 802 },
  { name: "Memory Management & Virtual Memory", code: "GATE_CSE_OS_MEMORY", order: 803 },
  { name: "File Systems", code: "GATE_CSE_OS_FS", order: 804 },
];

// -------------------------
// Section 9: Databases
// -------------------------
const dbTopics = [
  { name: "ER Model & Relational Model: Relational algebra, tuple calculus, SQL", code: "GATE_CSE_DB_ER_REL", order: 900 },
  { name: "Integrity Constraints & Normal Forms", code: "GATE_CSE_DB_INTEGRITY_NF", order: 901 },
  { name: "File Organization & Indexing (B/B+ trees)", code: "GATE_CSE_DB_FILE_INDEX", order: 902 },
  { name: "Transactions & Concurrency Control", code: "GATE_CSE_DB_TRANS_CONC", order: 903 },
];

// -------------------------
// Section 10: Computer Networks
// -------------------------
const netTopics = [
  { name: "Layering: OSI & TCP/IP; Packet, Circuit & Virtual-Circuit Switching", code: "GATE_CSE_NET_LAYERING", order: 1000 },
  { name: "Data Link Layer: Framing, Error Detection, MAC, Ethernet, Bridging", code: "GATE_CSE_NET_DATALINK", order: 1001 },
  { name: "Routing Protocols: Shortest Path, Flooding, DV & LS", code: "GATE_CSE_NET_ROUTING", order: 1002 },
  { name: "IP Addressing, Fragmentation, IPv4, CIDR, ARP, DHCP, ICMP, NAT", code: "GATE_CSE_NET_IP", order: 1003 },
  { name: "Transport Layer: Flow & Congestion Control, UDP, TCP, Sockets", code: "GATE_CSE_NET_TRANSPORT", order: 1004 },
  { name: "Application Layer: DNS, SMTP, HTTP, FTP, Email", code: "GATE_CSE_NET_APP", order: 1005 },
];

const allTopics = [
  ...mathTopics,
  ...digitalLogicTopics,
  ...coaTopics,
  ...pdsTopics,
  ...algoTopics,
  ...tocTopics,
  ...compilerTopics,
  ...osTopics,
  ...dbTopics,
  ...netTopics,
];

const BATCH_SIZE = 200;

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default async function seed(prisma) {
  console.log("▶ Seeding GATE CSE 2026 topics…");

  // 1) ensure ExamCategory exists
  const exam = await prisma.examCategory.upsert({
    where: { code: EXAM_CODE },
    update: { name: EXAM_NAME, isActive: true },
    create: { name: EXAM_NAME, code: EXAM_CODE, isActive: true },
  });

  console.log("Using ExamCategory:", exam.name, exam.id);

  // 2) clear old topics for idempotency
  try {
    await prisma.examTopic.deleteMany({ where: { examCategoryId: exam.id } });
    console.log("Cleared existing topics for", EXAM_CODE);
  } catch (err) {
    console.warn("Warning clearing existing topics (continuing):", err.message || err);
  }

  // 3) prepare rows and insert in batches with skipDuplicates
  const rows = allTopics.map((t) => ({
    examCategoryId: exam.id,
    name: t.name,
    code: t.code,
    order: t.order,
    isActive: true,
  }));

  const batches = chunkArray(rows, BATCH_SIZE);
  for (let i = 0; i < batches.length; i++) {
    try {
      const res = await prisma.examTopic.createMany({ data: batches[i], skipDuplicates: true });
      console.log(`Inserted batch ${i + 1}/${batches.length}: ${res.count ?? "?"} rows`);
    } catch (err) {
      console.error(`Error inserting batch ${i + 1}:`, err.message || err);
      // continue to next batch — avoids killing master run
    }
  }

  console.log(`✅ Inserted ${rows.length} topics for ${exam.name} (attempted in ${batches.length} batches).`);
}
