// Geographic and institutional landing-page data.
//
// WHY THIS FILE EXISTS
//
// A SERP audit of ~60 queries across five families found Questivo absent from
// three of them entirely:
//
//   1. "<exam> previous year question paper with solution"
//      Vedantu, Allen, MathonGo, SelfStudys, ExamSIDE, PW. Every one of them
//      ranks a PDF DOWNLOAD. Questivo's answer — sit the paper under the real
//      clock, key withheld until submission — is a different and better product
//      and it already has pages. This family is contested, not missing.
//
//   2. "<exam> coaching/test series in <city>"
//      Owned end to end by coaching brands: Allen Kota, Motion Kota, eSaral,
//      Brilliant Pala. Nobody ranks a free, no-signup practice option for a
//      named city. Questivo had no city page at all.
//
//   3. "colleges accepting <exam> score in <city>", "<college> admission"
//      Shiksha, Collegedunia, Careers360 — directories built on fee tables,
//      cut-offs and rankings. Questivo cannot and must not compete on that data
//      (see the accuracy policy in exams.ts). It CAN answer the question those
//      pages bury: which exam actually gets you in, and where to practise it.
//
//   4. "<exam> <subject> previous year questions chapter wise"
//      Returns an AI Overview that names platforms in prose. That is a
//      generative-engine surface, and being named in it depends on publishing
//      short, self-contained, checkable statements — which is what `facts` and
//      LLMS_FACTS in seo.ts are for.
//
//   5. "<exam> for NRI students <gulf city>"
//      ALLEN Overseas, TestprepKart, SATHEE. Indian-curriculum students abroad
//      sit the same papers and are served almost nothing free.
//
// WHAT THIS FILE DELIBERATELY DOES NOT CARRY
//
// No cut-offs, no fees, no rankings, no seat counts, no exam dates, no
// placement figures. Same rule as exams.ts, for the same reason: those change
// every cycle, the directories employ editors to maintain them, and one wrong
// number aimed at a candidate making an admissions decision is worse than
// publishing nothing. Every claim below is either a stable structural fact
// (which exam admits to an institution, which state a city is in) or a
// statement about Questivo's own product, which is verifiable from this repo.
//
// ON DOORWAY PAGES — READ BEFORE ADDING MORE
//
// A hundred near-identical pages differing only in a place name is a doorway
// network, and Google names that as a spam pattern rather than a grey area. The
// defence has to be that each page answers its own question: the exam mix, the
// `context` line and the ordering below are per-entry, and every page links out
// to the real depth on /mock-test/<exam> and /pyq rather than trying to be that
// depth. If a future entry cannot say something true and specific in `context`,
// it should not be added.

import { EXAMS, type Exam } from "./exams";

/* ================================ CITIES ================================ */

export interface ExamCity {
  /** URL segment: /practice/<slug> */
  slug: string;
  name: string;
  /** State or union territory. Empty for entries outside India. */
  state: string;
  country: string;
  /** Grouping used by the index page's headings. */
  region: string;
  /**
   * Why candidates HERE search differently. One honest sentence, specific to
   * the place — this is the line that keeps the page from being a template.
   */
  context: string;
  /** Exam slugs, most-searched first. Drives the page's ordering and links. */
  exams: string[];
}

/** Every exam slug, for cities with no particular skew. */
const ALL = ["jee-main", "neet-ug", "jee-advanced", "ssc-cgl", "rrb-ntpc", "upsc-ias"];
const ENGG = ["jee-main", "jee-advanced", "neet-ug"];
const MED = ["neet-ug", "jee-main", "jee-advanced"];
const GOVT = ["ssc-cgl", "rrb-ntpc", "upsc-ias"];

export const CITIES: ExamCity[] = [
  /* ---- Rajasthan ---- */
  {
    slug: "kota",
    name: "Kota",
    state: "Rajasthan",
    country: "India",
    region: "North India",
    context:
      "Kota's candidates are already inside a coaching test series, so what they search for between institute tests is extra attempts on a specific weak chapter — not another full-length paper.",
    exams: ["neet-ug", "jee-main", "jee-advanced"],
  },
  {
    slug: "jaipur",
    name: "Jaipur",
    state: "Rajasthan",
    country: "India",
    region: "North India",
    context:
      "Jaipur runs both an engineering-entrance coaching cluster and one of the larger state government-exam candidate pools, so the two families of search sit side by side here.",
    exams: ["jee-main", "neet-ug", "ssc-cgl", "rrb-ntpc"],
  },
  {
    slug: "jodhpur",
    name: "Jodhpur",
    state: "Rajasthan",
    country: "India",
    region: "North India",
    context:
      "Jodhpur hosts both an IIT and an AIIMS, which makes it one of the few cities where the engineering and medical entrance routes are equally visible to a school student.",
    exams: ["neet-ug", "jee-main", "jee-advanced"],
  },
  {
    slug: "udaipur",
    name: "Udaipur",
    state: "Rajasthan",
    country: "India",
    region: "North India",
    context:
      "Udaipur candidates typically prepare away from the Kota machine, which makes unlimited free practice papers a larger part of the plan than a purchased test series.",
    exams: ENGG,
  },

  /* ---- Delhi NCR ---- */
  {
    slug: "delhi",
    name: "Delhi",
    state: "Delhi",
    country: "India",
    region: "North India",
    context:
      "Delhi carries every candidate pool at once — engineering, medical, staff selection and civil services — which is why its searches skew to the exam name rather than to a coaching brand.",
    exams: ALL,
  },
  {
    slug: "noida",
    name: "Noida",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Noida's search mix is dominated by working graduates preparing for staff-selection and railway recruitment alongside a job, so short timed sets matter more than full-length papers.",
    exams: ["ssc-cgl", "rrb-ntpc", "jee-main", "upsc-ias"],
  },
  {
    slug: "gurugram",
    name: "Gurugram",
    state: "Haryana",
    country: "India",
    region: "North India",
    context:
      "Gurugram combines a school-age engineering and medical pool with a large corporate workforce, so the resume and interview tools are searched here as often as the exam practice.",
    exams: ["jee-main", "neet-ug", "ssc-cgl"],
  },
  {
    slug: "faridabad",
    name: "Faridabad",
    state: "Haryana",
    country: "India",
    region: "North India",
    context:
      "Faridabad candidates commonly prepare for central government recruitment while commuting into Delhi, which puts a premium on practice that needs no fixed schedule.",
    exams: ["ssc-cgl", "rrb-ntpc", "jee-main"],
  },
  {
    slug: "ghaziabad",
    name: "Ghaziabad",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Ghaziabad sits between the Delhi coaching market and the western Uttar Pradesh candidate pool, and its searches reflect both.",
    exams: ["jee-main", "ssc-cgl", "neet-ug", "rrb-ntpc"],
  },

  /* ---- Uttar Pradesh ---- */
  {
    slug: "lucknow",
    name: "Lucknow",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Lucknow is a state-capital hub for staff-selection and civil services preparation, with a medical entrance pool built around its long-established government medical colleges.",
    exams: ["ssc-cgl", "upsc-ias", "neet-ug", "rrb-ntpc"],
  },
  {
    slug: "kanpur",
    name: "Kanpur",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Kanpur's engineering pool is anchored by IIT Kanpur being visible from every school in the city, which pushes JEE Advanced practice earlier here than in most places.",
    exams: ["jee-main", "jee-advanced", "neet-ug"],
  },
  {
    slug: "prayagraj",
    name: "Prayagraj",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Prayagraj is one of India's densest civil-services and staff-selection preparation centres, and its candidates are overwhelmingly graduates rather than school students.",
    exams: GOVT,
  },
  {
    slug: "varanasi",
    name: "Varanasi",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Varanasi's candidates prepare with IIT (BHU) and the BHU medical faculty as the local reference points, so both entrance tracks stay active through school.",
    exams: ["jee-main", "neet-ug", "jee-advanced", "upsc-ias"],
  },
  {
    slug: "gorakhpur",
    name: "Gorakhpur",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Gorakhpur has a large railway-recruitment candidate pool, reflecting the city's role as a major railway division headquarters.",
    exams: ["rrb-ntpc", "ssc-cgl", "neet-ug"],
  },
  {
    slug: "agra",
    name: "Agra",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Agra candidates typically prepare locally rather than relocating, which makes free unlimited practice a direct substitute for a paid test series here.",
    exams: ["jee-main", "neet-ug", "ssc-cgl"],
  },
  {
    slug: "meerut",
    name: "Meerut",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Meerut runs a substantial local coaching market for medical entrance in particular, feeding the western Uttar Pradesh medical colleges.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },
  {
    slug: "bareilly",
    name: "Bareilly",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Bareilly's candidates split fairly evenly between medical entrance and central government recruitment, with little local coaching concentration in either.",
    exams: ["neet-ug", "ssc-cgl", "rrb-ntpc"],
  },
  {
    slug: "aligarh",
    name: "Aligarh",
    state: "Uttar Pradesh",
    country: "India",
    region: "North India",
    context:
      "Aligarh's university town character keeps a steady graduate population preparing for civil services and staff selection alongside the school-age entrance pool.",
    exams: ["ssc-cgl", "neet-ug", "jee-main", "upsc-ias"],
  },

  /* ---- Bihar / Jharkhand ---- */
  {
    slug: "patna",
    name: "Patna",
    state: "Bihar",
    country: "India",
    region: "East India",
    context:
      "Patna sends one of the country's largest candidate cohorts to engineering and medical entrances, and cost is a live constraint for a large share of them.",
    exams: ["jee-main", "neet-ug", "ssc-cgl", "upsc-ias"],
  },
  {
    slug: "ranchi",
    name: "Ranchi",
    state: "Jharkhand",
    country: "India",
    region: "East India",
    context:
      "Ranchi candidates draw on a smaller local coaching market than Patna, which makes self-directed practice a larger part of preparation here.",
    exams: ["jee-main", "neet-ug", "ssc-cgl"],
  },
  {
    slug: "jamshedpur",
    name: "Jamshedpur",
    state: "Jharkhand",
    country: "India",
    region: "East India",
    context:
      "Jamshedpur is a steel city, and metallurgy is a live career path here rather than an abstract one — GATE Metallurgical Engineering practice has a real local audience.",
    exams: ["jee-main", "gate-metallurgy", "neet-ug"],
  },
  {
    slug: "dhanbad",
    name: "Dhanbad",
    state: "Jharkhand",
    country: "India",
    region: "East India",
    context:
      "Dhanbad hosts IIT (ISM) and sits in India's principal coalfield, so mining, materials and metallurgy postgraduate routes are unusually visible to local graduates.",
    exams: ["jee-main", "gate-metallurgy", "jee-advanced"],
  },

  /* ---- West Bengal / North East ---- */
  {
    slug: "kolkata",
    name: "Kolkata",
    state: "West Bengal",
    country: "India",
    region: "East India",
    context:
      "Kolkata carries a long-established medical and engineering entrance pool alongside one of the larger staff-selection candidate bases in eastern India.",
    exams: ALL,
  },
  {
    slug: "durgapur",
    name: "Durgapur",
    state: "West Bengal",
    country: "India",
    region: "East India",
    context:
      "Durgapur's steel-plant economy and NIT keep engineering entrance and metallurgy postgraduate routes both in view locally.",
    exams: ["jee-main", "gate-metallurgy", "neet-ug"],
  },
  {
    slug: "siliguri",
    name: "Siliguri",
    state: "West Bengal",
    country: "India",
    region: "East India",
    context:
      "Siliguri serves candidates across north Bengal, Sikkim and the nearer north-eastern states, most of whom prepare without relocating to a coaching city.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },
  {
    slug: "guwahati",
    name: "Guwahati",
    state: "Assam",
    country: "India",
    region: "North East India",
    context:
      "Guwahati is the north-east's principal preparation centre, and its candidates rely more on online material than on the physical coaching density available further west.",
    exams: ["jee-main", "neet-ug", "ssc-cgl", "jee-advanced"],
  },

  /* ---- Odisha / Chhattisgarh ---- */
  {
    slug: "bhubaneswar",
    name: "Bhubaneswar",
    state: "Odisha",
    country: "India",
    region: "East India",
    context:
      "Bhubaneswar's engineering pool is large relative to the city's size, supported by a dense cluster of technical institutions in and around the capital region.",
    exams: ["jee-main", "neet-ug", "jee-advanced"],
  },
  {
    slug: "rourkela",
    name: "Rourkela",
    state: "Odisha",
    country: "India",
    region: "East India",
    context:
      "Rourkela combines a steel-plant economy with an NIT, which makes metallurgical and materials postgraduate routes a visible option for local engineering graduates.",
    exams: ["jee-main", "gate-metallurgy", "neet-ug"],
  },
  {
    slug: "raipur",
    name: "Raipur",
    state: "Chhattisgarh",
    country: "India",
    region: "Central India",
    context:
      "Raipur's candidates have historically travelled out of state to prepare, which makes free online practice a genuine substitute rather than a supplement.",
    exams: ["jee-main", "neet-ug", "ssc-cgl"],
  },

  /* ---- Madhya Pradesh ---- */
  {
    slug: "indore",
    name: "Indore",
    state: "Madhya Pradesh",
    country: "India",
    region: "Central India",
    context:
      "Indore is central India's strongest engineering-entrance coaching market and hosts an IIT, keeping JEE Advanced in view for a large share of its candidates.",
    exams: ["jee-main", "jee-advanced", "neet-ug"],
  },
  {
    slug: "bhopal",
    name: "Bhopal",
    state: "Madhya Pradesh",
    country: "India",
    region: "Central India",
    context:
      "Bhopal's state-capital status gives it a large government-exam candidate pool alongside its medical and engineering entrance cohorts.",
    exams: ["neet-ug", "jee-main", "ssc-cgl", "upsc-ias"],
  },
  {
    slug: "gwalior",
    name: "Gwalior",
    state: "Madhya Pradesh",
    country: "India",
    region: "Central India",
    context:
      "Gwalior's candidates lean toward engineering entrance, supported by the presence of a long-established IIIT in the city.",
    exams: ENGG,
  },
  {
    slug: "jabalpur",
    name: "Jabalpur",
    state: "Madhya Pradesh",
    country: "India",
    region: "Central India",
    context:
      "Jabalpur hosts both an IIIT and a well-known government medical college, so both entrance tracks have a visible local destination.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },

  /* ---- Maharashtra / Gujarat ---- */
  {
    slug: "mumbai",
    name: "Mumbai",
    state: "Maharashtra",
    country: "India",
    region: "West India",
    context:
      "Mumbai's engineering and medical pools are both large, and its candidates are unusually likely to be preparing alongside school rather than through a dedicated coaching year.",
    exams: ALL,
  },
  {
    slug: "pune",
    name: "Pune",
    state: "Maharashtra",
    country: "India",
    region: "West India",
    context:
      "Pune's density of engineering colleges keeps JEE Main the dominant search here, with a graduate population that also drives resume and interview preparation.",
    exams: ["jee-main", "neet-ug", "jee-advanced", "ssc-cgl"],
  },
  {
    slug: "nagpur",
    name: "Nagpur",
    state: "Maharashtra",
    country: "India",
    region: "Central India",
    context:
      "Nagpur hosts VNIT and AIIMS Nagpur, giving candidates local destinations on both the engineering and the medical route.",
    exams: ["jee-main", "neet-ug", "ssc-cgl"],
  },
  {
    slug: "nashik",
    name: "Nashik",
    state: "Maharashtra",
    country: "India",
    region: "West India",
    context:
      "Nashik's candidates typically prepare locally and sit the same national papers as the Mumbai–Pune corridor without the same coaching density.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },
  {
    slug: "ahmedabad",
    name: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    region: "West India",
    context:
      "Ahmedabad's candidates draw on a strong local school system and a large medical entrance pool feeding Gujarat's government medical colleges.",
    exams: ["neet-ug", "jee-main", "jee-advanced", "ssc-cgl"],
  },
  {
    slug: "surat",
    name: "Surat",
    state: "Gujarat",
    country: "India",
    region: "West India",
    context:
      "Surat's entrance candidates largely prepare without relocating, and its medical pool is proportionally larger than its engineering one.",
    exams: MED,
  },
  {
    slug: "vadodara",
    name: "Vadodara",
    state: "Gujarat",
    country: "India",
    region: "West India",
    context:
      "Vadodara's long-established engineering faculty keeps a steady local engineering entrance cohort alongside the medical route.",
    exams: ENGG,
  },
  {
    slug: "rajkot",
    name: "Rajkot",
    state: "Gujarat",
    country: "India",
    region: "West India",
    context:
      "Rajkot serves the Saurashtra candidate pool, where medical entrance preparation is the larger of the two national tracks.",
    exams: MED,
  },

  /* ---- Punjab / Haryana / Himalayan ---- */
  {
    slug: "chandigarh",
    name: "Chandigarh",
    state: "Chandigarh",
    country: "India",
    region: "North India",
    context:
      "Chandigarh serves candidates from Punjab, Haryana and Himachal at once, and its medical entrance pool is anchored by PGIMER and the region's government medical colleges.",
    exams: ["neet-ug", "jee-main", "ssc-cgl", "upsc-ias"],
  },
  {
    slug: "ludhiana",
    name: "Ludhiana",
    state: "Punjab",
    country: "India",
    region: "North India",
    context:
      "Ludhiana's candidates skew toward medical entrance, supported by one of Punjab's oldest medical college clusters.",
    exams: MED,
  },
  {
    slug: "jalandhar",
    name: "Jalandhar",
    state: "Punjab",
    country: "India",
    region: "North India",
    context:
      "Jalandhar hosts NIT Jalandhar, which keeps engineering entrance a visible route for candidates across the Doaba region.",
    exams: ENGG,
  },
  {
    slug: "amritsar",
    name: "Amritsar",
    state: "Punjab",
    country: "India",
    region: "North India",
    context:
      "Amritsar's candidates typically prepare locally, with medical entrance and central government recruitment the two largest tracks.",
    exams: ["neet-ug", "ssc-cgl", "jee-main"],
  },
  {
    slug: "dehradun",
    name: "Dehradun",
    state: "Uttarakhand",
    country: "India",
    region: "North India",
    context:
      "Dehradun's boarding-school population and AIIMS Rishikesh nearby keep medical entrance unusually prominent for a city of its size.",
    exams: ["neet-ug", "jee-main", "upsc-ias"],
  },
  {
    slug: "shimla",
    name: "Shimla",
    state: "Himachal Pradesh",
    country: "India",
    region: "North India",
    context:
      "Shimla's candidates prepare with almost no local coaching density, which makes free unlimited online practice a primary resource rather than an extra.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },
  {
    slug: "jammu",
    name: "Jammu",
    state: "Jammu and Kashmir",
    country: "India",
    region: "North India",
    context:
      "Jammu hosts both an IIT and an AIIMS, which has made the two national entrance routes considerably more visible locally than they were a decade ago.",
    exams: ["neet-ug", "jee-main", "jee-advanced"],
  },
  {
    slug: "srinagar",
    name: "Srinagar",
    state: "Jammu and Kashmir",
    country: "India",
    region: "North India",
    context:
      "Srinagar's candidates contend with interrupted schedules and limited coaching access, so practice that can be attempted at any hour without a booking matters more here.",
    exams: ["neet-ug", "jee-main", "ssc-cgl"],
  },

  /* ---- South India ---- */
  {
    slug: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    country: "India",
    region: "South India",
    context:
      "Hyderabad runs one of India's most competitive engineering-entrance coaching markets, and its candidates typically start structured JEE preparation earlier than the national norm.",
    exams: ["jee-main", "neet-ug", "jee-advanced", "ssc-cgl"],
  },
  {
    slug: "warangal",
    name: "Warangal",
    state: "Telangana",
    country: "India",
    region: "South India",
    context:
      "Warangal hosts NIT Warangal, one of the most sought-after JEE Main destinations in the country, which keeps the exam in view from school onward.",
    exams: ENGG,
  },
  {
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    country: "India",
    region: "South India",
    context:
      "Bengaluru's candidate mix is unusually weighted toward working graduates, so the resume checker and interview studio see as much local demand as the entrance practice.",
    exams: ALL,
  },
  {
    slug: "mysuru",
    name: "Mysuru",
    state: "Karnataka",
    country: "India",
    region: "South India",
    context:
      "Mysuru's candidates prepare within a strong local college ecosystem, with medical and engineering entrance both well represented.",
    exams: ENGG,
  },
  {
    slug: "mangaluru",
    name: "Mangaluru",
    state: "Karnataka",
    country: "India",
    region: "South India",
    context:
      "Mangaluru's dense cluster of medical and engineering institutions gives its candidates local destinations on both national routes.",
    exams: MED,
  },
  {
    slug: "hubballi",
    name: "Hubballi",
    state: "Karnataka",
    country: "India",
    region: "South India",
    context:
      "Hubballi serves north Karnataka's candidate pool, which has historically had to travel to Bengaluru or Pune for a structured test series.",
    exams: ENGG,
  },
  {
    slug: "chennai",
    name: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    region: "South India",
    context:
      "Chennai's candidates sit the national entrances alongside a strong state-board route, so a large share are preparing for two different paper styles at once.",
    exams: ALL,
  },
  {
    slug: "coimbatore",
    name: "Coimbatore",
    state: "Tamil Nadu",
    country: "India",
    region: "South India",
    context:
      "Coimbatore's engineering college density makes JEE Main the dominant national search here, ahead of the medical route.",
    exams: ENGG,
  },
  {
    slug: "madurai",
    name: "Madurai",
    state: "Tamil Nadu",
    country: "India",
    region: "South India",
    context:
      "Madurai's candidates lean toward medical entrance, supported by one of Tamil Nadu's oldest government medical colleges.",
    exams: MED,
  },
  {
    slug: "tiruchirappalli",
    name: "Tiruchirappalli",
    state: "Tamil Nadu",
    country: "India",
    region: "South India",
    context:
      "Tiruchirappalli hosts NIT Trichy, consistently among the most competitive JEE Main destinations, which shapes how early local candidates begin.",
    exams: ENGG,
  },
  {
    slug: "salem",
    name: "Salem",
    state: "Tamil Nadu",
    country: "India",
    region: "South India",
    context:
      "Salem's candidates prepare largely outside the metro coaching markets, which makes unlimited free practice a direct replacement for a paid series.",
    exams: MED,
  },
  {
    slug: "visakhapatnam",
    name: "Visakhapatnam",
    state: "Andhra Pradesh",
    country: "India",
    region: "South India",
    context:
      "Visakhapatnam's steel and port economy keeps metallurgical and materials engineering a visible postgraduate route alongside the school-age entrances.",
    exams: ["jee-main", "neet-ug", "gate-metallurgy"],
  },
  {
    slug: "vijayawada",
    name: "Vijayawada",
    state: "Andhra Pradesh",
    country: "India",
    region: "South India",
    context:
      "Vijayawada anchors one of India's most intensive residential coaching markets for engineering and medical entrance alike.",
    exams: ["jee-main", "neet-ug", "jee-advanced"],
  },
  {
    slug: "tirupati",
    name: "Tirupati",
    state: "Andhra Pradesh",
    country: "India",
    region: "South India",
    context:
      "Tirupati hosts both an IIT and an IISER-scale research presence, which has raised the visibility of JEE Advanced locally in recent years.",
    exams: ENGG,
  },
  {
    slug: "kochi",
    name: "Kochi",
    state: "Kerala",
    country: "India",
    region: "South India",
    context:
      "Kochi's candidates commonly prepare for the national medical entrance alongside Kerala's own admission processes, which means two marking conventions in the same year.",
    exams: MED,
  },
  {
    slug: "thiruvananthapuram",
    name: "Thiruvananthapuram",
    state: "Kerala",
    country: "India",
    region: "South India",
    context:
      "Thiruvananthapuram's medical entrance pool is anchored by a long-established government medical college and a strong state-capital civil services cohort.",
    exams: ["neet-ug", "upsc-ias", "jee-main"],
  },
  {
    slug: "kozhikode",
    name: "Kozhikode",
    state: "Kerala",
    country: "India",
    region: "South India",
    context:
      "Kozhikode hosts NIT Calicut and a major government medical college, giving both national routes a visible local destination.",
    exams: ["neet-ug", "jee-main", "jee-advanced"],
  },
  {
    slug: "puducherry",
    name: "Puducherry",
    state: "Puducherry",
    country: "India",
    region: "South India",
    context:
      "Puducherry's medical entrance pool is disproportionately large for its population, driven by JIPMER and the surrounding medical college cluster.",
    exams: MED,
  },
  {
    slug: "panaji",
    name: "Panaji",
    state: "Goa",
    country: "India",
    region: "West India",
    context:
      "Goa's small candidate pool has almost no local test-series market, so national online practice does the work a coaching institute would elsewhere.",
    exams: ENGG,
  },
];

/* ========================= INTERNATIONAL CENTRES ========================= */

/**
 * Cities outside India with a substantial Indian-curriculum school population.
 *
 * These candidates sit the same papers under the same marking scheme, and the
 * SERP audit found them served almost entirely by paid overseas coaching
 * (ALLEN Overseas, TestprepKart). Deliberately phrased as "candidates
 * preparing from X" rather than "there is an exam centre in X" — centre lists
 * change every cycle and this file does not publish facts it cannot stand
 * behind.
 */
export const INTERNATIONAL_CITIES: ExamCity[] = [
  {
    slug: "dubai",
    name: "Dubai",
    state: "",
    country: "United Arab Emirates",
    region: "Gulf",
    context:
      "Dubai has one of the largest Indian-curriculum school populations outside India, and its candidates sit the same national entrance papers as their peers in Delhi or Chennai.",
    exams: ENGG,
  },
  {
    slug: "abu-dhabi",
    name: "Abu Dhabi",
    state: "",
    country: "United Arab Emirates",
    region: "Gulf",
    context:
      "Abu Dhabi's Indian-curriculum students prepare for the same papers on a school calendar that does not line up with India's coaching cycle, so on-demand practice matters more.",
    exams: ENGG,
  },
  {
    slug: "sharjah",
    name: "Sharjah",
    state: "",
    country: "United Arab Emirates",
    region: "Gulf",
    context:
      "Sharjah's large Indian-school cohort typically prepares without access to the physical test-series market that Indian cities take for granted.",
    exams: ENGG,
  },
  {
    slug: "doha",
    name: "Doha",
    state: "",
    country: "Qatar",
    region: "Gulf",
    context:
      "Doha's Indian-curriculum candidates prepare for Indian entrance exams from a school system that follows the CBSE calendar abroad.",
    exams: ENGG,
  },
  {
    slug: "muscat",
    name: "Muscat",
    state: "",
    country: "Oman",
    region: "Gulf",
    context:
      "Muscat's Indian schools follow the same syllabus as their counterparts in India, and their students compete in the same national ranking.",
    exams: ENGG,
  },
  {
    slug: "kuwait-city",
    name: "Kuwait City",
    state: "",
    country: "Kuwait",
    region: "Gulf",
    context:
      "Kuwait's Indian-curriculum students prepare for Indian entrances with limited local coaching options and a heavy reliance on online material.",
    exams: ENGG,
  },
  {
    slug: "riyadh",
    name: "Riyadh",
    state: "",
    country: "Saudi Arabia",
    region: "Gulf",
    context:
      "Riyadh's Indian international schools run the CBSE syllabus, so their students face the same papers on the same syllabus as candidates in India.",
    exams: ENGG,
  },
  {
    slug: "manama",
    name: "Manama",
    state: "",
    country: "Bahrain",
    region: "Gulf",
    context:
      "Bahrain's Indian-school population is small enough that a local test series is rarely viable, which makes free online practice the practical default.",
    exams: ENGG,
  },
  {
    slug: "singapore",
    name: "Singapore",
    state: "",
    country: "Singapore",
    region: "Asia Pacific",
    context:
      "Singapore's Indian-curriculum students often prepare for Indian entrances alongside a second admissions track, which makes time-efficient practice the constraint.",
    exams: ENGG,
  },
  {
    slug: "kathmandu",
    name: "Kathmandu",
    state: "",
    country: "Nepal",
    region: "South Asia",
    context:
      "Nepali candidates have long sat Indian medical and engineering entrances, and prepare from a school system with its own calendar and its own textbooks.",
    exams: MED,
  },
  {
    slug: "kuala-lumpur",
    name: "Kuala Lumpur",
    state: "",
    country: "Malaysia",
    region: "Asia Pacific",
    context:
      "Kuala Lumpur's Indian-diaspora students preparing for Indian entrances have very little local coaching infrastructure aimed at those specific papers.",
    exams: ENGG,
  },
  {
    slug: "london",
    name: "London",
    state: "",
    country: "United Kingdom",
    region: "Europe",
    context:
      "London's Indian-origin students preparing for Indian entrance exams are a small cohort with essentially no dedicated local provision.",
    exams: ENGG,
  },
];

/* =============================== COLLEGES =============================== */

export interface College {
  /** URL segment: /college/<slug> */
  slug: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  /** Institution family, used for grouping and for the page's subtitle. */
  type: "IIT" | "NIT" | "IIIT" | "Medical" | "University";
  /**
   * The exam slug whose score is the undergraduate admission route.
   *
   * This is the one genuinely load-bearing field on the page and the reason
   * these pages can exist honestly: which national examination admits to an
   * institution is a stable, checkable structural fact, unlike a cut-off.
   */
  admitsVia: string;
  /** Further exam slugs relevant here, e.g. GATE for postgraduate entry. */
  alsoVia?: string[];
  /** One specific, non-time-sensitive sentence. No rankings, no placements. */
  context: string;
}

export const COLLEGES: College[] = [
  /* ---- IITs: JEE Advanced, reached through JEE Main ---- */
  {
    slug: "iit-bombay",
    name: "Indian Institute of Technology Bombay",
    shortName: "IIT Bombay",
    city: "Mumbai",
    state: "Maharashtra",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Undergraduate admission runs through JEE Advanced, which can only be attempted after qualifying JEE Main — so the practice has to cover both papers, and they are not the same paper.",
  },
  {
    slug: "iit-delhi",
    name: "Indian Institute of Technology Delhi",
    shortName: "IIT Delhi",
    city: "New Delhi",
    state: "Delhi",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "The admission route is JEE Advanced, whose question formats — multiple-correct options, matching lists, integer answers — differ from JEE Main's in ways that change how you should attempt the paper.",
  },
  {
    slug: "iit-madras",
    name: "Indian Institute of Technology Madras",
    shortName: "IIT Madras",
    city: "Chennai",
    state: "Tamil Nadu",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Admission is through JEE Advanced. Its marking scheme has changed between years, so strategies built on one year's rules can cost marks under another's.",
  },
  {
    slug: "iit-kanpur",
    name: "Indian Institute of Technology Kanpur",
    shortName: "IIT Kanpur",
    city: "Kanpur",
    state: "Uttar Pradesh",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "JEE Advanced is the admission route, and it rewards working out where to begin on an unfamiliar problem rather than recall — which is why previous year papers matter more here than for any other exam.",
  },
  {
    slug: "iit-kharagpur",
    name: "Indian Institute of Technology Kharagpur",
    shortName: "IIT Kharagpur",
    city: "Kharagpur",
    state: "West Bengal",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main", "gate-metallurgy"],
    context:
      "Undergraduate entry is via JEE Advanced; its metallurgical and materials engineering postgraduate programmes are reached through GATE.",
  },
  {
    slug: "iit-roorkee",
    name: "Indian Institute of Technology Roorkee",
    shortName: "IIT Roorkee",
    city: "Roorkee",
    state: "Uttarakhand",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main", "gate-metallurgy"],
    context:
      "JEE Advanced admits undergraduates; GATE is the route into its postgraduate engineering programmes, including metallurgical and materials engineering.",
  },
  {
    slug: "iit-guwahati",
    name: "Indian Institute of Technology Guwahati",
    shortName: "IIT Guwahati",
    city: "Guwahati",
    state: "Assam",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "The north-east's IIT, admitting undergraduates through JEE Advanced after a JEE Main qualification.",
  },
  {
    slug: "iit-hyderabad",
    name: "Indian Institute of Technology Hyderabad",
    shortName: "IIT Hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Admission is through JEE Advanced, in a city whose coaching market starts structured JEE preparation earlier than the national norm.",
  },
  {
    slug: "iit-bhu-varanasi",
    name: "Indian Institute of Technology (BHU) Varanasi",
    shortName: "IIT (BHU) Varanasi",
    city: "Varanasi",
    state: "Uttar Pradesh",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main", "gate-metallurgy"],
    context:
      "Undergraduate admission is via JEE Advanced. Its metallurgical engineering department is among the oldest in India, and postgraduate entry there runs through GATE.",
  },
  {
    slug: "iit-ism-dhanbad",
    name: "Indian Institute of Technology (ISM) Dhanbad",
    shortName: "IIT (ISM) Dhanbad",
    city: "Dhanbad",
    state: "Jharkhand",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main", "gate-metallurgy"],
    context:
      "Formerly the Indian School of Mines. Undergraduate entry is through JEE Advanced; its mining, materials and metallurgical postgraduate routes run through GATE.",
  },
  {
    slug: "iit-indore",
    name: "Indian Institute of Technology Indore",
    shortName: "IIT Indore",
    city: "Indore",
    state: "Madhya Pradesh",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Admission is through JEE Advanced, in central India's strongest engineering-entrance coaching market.",
  },
  {
    slug: "iit-gandhinagar",
    name: "Indian Institute of Technology Gandhinagar",
    shortName: "IIT Gandhinagar",
    city: "Gandhinagar",
    state: "Gujarat",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Undergraduate admission runs through JEE Advanced after qualifying JEE Main.",
  },
  {
    slug: "iit-ropar",
    name: "Indian Institute of Technology Ropar",
    shortName: "IIT Ropar",
    city: "Rupnagar",
    state: "Punjab",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Punjab's IIT, admitting undergraduates through JEE Advanced.",
  },
  {
    slug: "iit-patna",
    name: "Indian Institute of Technology Patna",
    shortName: "IIT Patna",
    city: "Patna",
    state: "Bihar",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Admission is via JEE Advanced, serving a state that sends one of India's largest cohorts to the engineering entrances.",
  },
  {
    slug: "iit-jodhpur",
    name: "Indian Institute of Technology Jodhpur",
    shortName: "IIT Jodhpur",
    city: "Jodhpur",
    state: "Rajasthan",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Undergraduate entry is through JEE Advanced, in a city that also hosts an AIIMS.",
  },
  {
    slug: "iit-bhubaneswar",
    name: "Indian Institute of Technology Bhubaneswar",
    shortName: "IIT Bhubaneswar",
    city: "Bhubaneswar",
    state: "Odisha",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Odisha's IIT, admitting undergraduates through JEE Advanced.",
  },
  {
    slug: "iit-mandi",
    name: "Indian Institute of Technology Mandi",
    shortName: "IIT Mandi",
    city: "Mandi",
    state: "Himachal Pradesh",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Himachal Pradesh's IIT, with undergraduate admission through JEE Advanced.",
  },
  {
    slug: "iit-tirupati",
    name: "Indian Institute of Technology Tirupati",
    shortName: "IIT Tirupati",
    city: "Tirupati",
    state: "Andhra Pradesh",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context: "Undergraduate admission runs through JEE Advanced.",
  },
  {
    slug: "iit-jammu",
    name: "Indian Institute of Technology Jammu",
    shortName: "IIT Jammu",
    city: "Jammu",
    state: "Jammu and Kashmir",
    type: "IIT",
    admitsVia: "jee-advanced",
    alsoVia: ["jee-main"],
    context:
      "Admission is via JEE Advanced, and its presence has raised the visibility of the route considerably in the region.",
  },

  /* ---- NITs, IIITs and GFTIs: JEE Main ---- */
  {
    slug: "nit-tiruchirappalli",
    name: "National Institute of Technology Tiruchirappalli",
    shortName: "NIT Trichy",
    city: "Tiruchirappalli",
    state: "Tamil Nadu",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "Admission is on the JEE Main score through the central counselling process — JEE Advanced is not involved. Its metallurgical and materials postgraduate entry runs through GATE.",
  },
  {
    slug: "nit-surathkal",
    name: "National Institute of Technology Karnataka, Surathkal",
    shortName: "NIT Surathkal",
    city: "Mangaluru",
    state: "Karnataka",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "Entry is on the JEE Main score. Its metallurgical and materials engineering postgraduate programmes are reached through GATE.",
  },
  {
    slug: "nit-warangal",
    name: "National Institute of Technology Warangal",
    shortName: "NIT Warangal",
    city: "Warangal",
    state: "Telangana",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "Admission is through JEE Main. It has one of the longer-established metallurgical engineering departments among the NITs, with GATE as the postgraduate route.",
  },
  {
    slug: "nit-rourkela",
    name: "National Institute of Technology Rourkela",
    shortName: "NIT Rourkela",
    city: "Rourkela",
    state: "Odisha",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "JEE Main admits undergraduates. Sitting in a steel city, its metallurgical and materials engineering postgraduate route through GATE has a strong local pipeline.",
  },
  {
    slug: "nit-calicut",
    name: "National Institute of Technology Calicut",
    shortName: "NIT Calicut",
    city: "Kozhikode",
    state: "Kerala",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Undergraduate admission is on the JEE Main score through central counselling.",
  },
  {
    slug: "mnnit-allahabad",
    name: "Motilal Nehru National Institute of Technology Allahabad",
    shortName: "MNNIT Allahabad",
    city: "Prayagraj",
    state: "Uttar Pradesh",
    type: "NIT",
    admitsVia: "jee-main",
    context:
      "Admission runs on the JEE Main score, in a city better known for its civil-services preparation than its engineering one.",
  },
  {
    slug: "mnit-jaipur",
    name: "Malaviya National Institute of Technology Jaipur",
    shortName: "MNIT Jaipur",
    city: "Jaipur",
    state: "Rajasthan",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "JEE Main is the undergraduate route; GATE covers postgraduate entry, including metallurgical and materials engineering.",
  },
  {
    slug: "manit-bhopal",
    name: "Maulana Azad National Institute of Technology Bhopal",
    shortName: "MANIT Bhopal",
    city: "Bhopal",
    state: "Madhya Pradesh",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Undergraduate admission is on the JEE Main score.",
  },
  {
    slug: "vnit-nagpur",
    name: "Visvesvaraya National Institute of Technology Nagpur",
    shortName: "VNIT Nagpur",
    city: "Nagpur",
    state: "Maharashtra",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "JEE Main admits undergraduates; its metallurgical and materials engineering postgraduate programmes run through GATE.",
  },
  {
    slug: "nit-kurukshetra",
    name: "National Institute of Technology Kurukshetra",
    shortName: "NIT Kurukshetra",
    city: "Kurukshetra",
    state: "Haryana",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Admission is on the JEE Main score through central counselling.",
  },
  {
    slug: "nit-durgapur",
    name: "National Institute of Technology Durgapur",
    shortName: "NIT Durgapur",
    city: "Durgapur",
    state: "West Bengal",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "JEE Main is the undergraduate route. Its metallurgical and materials engineering postgraduate entry through GATE sits alongside a steel-plant economy.",
  },
  {
    slug: "nit-jamshedpur",
    name: "National Institute of Technology Jamshedpur",
    shortName: "NIT Jamshedpur",
    city: "Jamshedpur",
    state: "Jharkhand",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "Undergraduate admission is via JEE Main. Metallurgical engineering is a live local career path in Jamshedpur rather than an abstract one, and GATE is the postgraduate route.",
  },
  {
    slug: "nit-jalandhar",
    name: "Dr B R Ambedkar National Institute of Technology Jalandhar",
    shortName: "NIT Jalandhar",
    city: "Jalandhar",
    state: "Punjab",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Undergraduate entry is on the JEE Main score.",
  },
  {
    slug: "nit-silchar",
    name: "National Institute of Technology Silchar",
    shortName: "NIT Silchar",
    city: "Silchar",
    state: "Assam",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Admission is through JEE Main, serving candidates across the north-east.",
  },
  {
    slug: "nit-patna",
    name: "National Institute of Technology Patna",
    shortName: "NIT Patna",
    city: "Patna",
    state: "Bihar",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Undergraduate admission is on the JEE Main score.",
  },
  {
    slug: "nit-raipur",
    name: "National Institute of Technology Raipur",
    shortName: "NIT Raipur",
    city: "Raipur",
    state: "Chhattisgarh",
    type: "NIT",
    admitsVia: "jee-main",
    alsoVia: ["gate-metallurgy"],
    context:
      "JEE Main admits undergraduates; metallurgical engineering postgraduate entry runs through GATE.",
  },
  {
    slug: "nit-hamirpur",
    name: "National Institute of Technology Hamirpur",
    shortName: "NIT Hamirpur",
    city: "Hamirpur",
    state: "Himachal Pradesh",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Undergraduate admission is on the JEE Main score.",
  },
  {
    slug: "nit-srinagar",
    name: "National Institute of Technology Srinagar",
    shortName: "NIT Srinagar",
    city: "Srinagar",
    state: "Jammu and Kashmir",
    type: "NIT",
    admitsVia: "jee-main",
    context: "Admission is through JEE Main.",
  },
  {
    slug: "iiit-allahabad",
    name: "Indian Institute of Information Technology Allahabad",
    shortName: "IIIT Allahabad",
    city: "Prayagraj",
    state: "Uttar Pradesh",
    type: "IIIT",
    admitsVia: "jee-main",
    context:
      "Undergraduate admission is on the JEE Main score through the central counselling process.",
  },
  {
    slug: "iiitm-gwalior",
    name: "ABV Indian Institute of Information Technology and Management Gwalior",
    shortName: "IIITM Gwalior",
    city: "Gwalior",
    state: "Madhya Pradesh",
    type: "IIIT",
    admitsVia: "jee-main",
    context: "Entry is on the JEE Main score.",
  },
  {
    slug: "iiitdm-jabalpur",
    name: "Indian Institute of Information Technology, Design and Manufacturing Jabalpur",
    shortName: "IIITDM Jabalpur",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    type: "IIIT",
    admitsVia: "jee-main",
    context: "Undergraduate admission runs on the JEE Main score.",
  },

  /* ---- Medical: NEET UG ---- */
  {
    slug: "aiims-new-delhi",
    name: "All India Institute of Medical Sciences, New Delhi",
    shortName: "AIIMS New Delhi",
    city: "New Delhi",
    state: "Delhi",
    type: "Medical",
    admitsVia: "neet-ug",
    context:
      "MBBS admission is through NEET UG. AIIMS stopped running its own separate entrance examination, so NEET is the single route.",
  },
  {
    slug: "aiims-jodhpur",
    name: "All India Institute of Medical Sciences, Jodhpur",
    shortName: "AIIMS Jodhpur",
    city: "Jodhpur",
    state: "Rajasthan",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "MBBS admission runs through NEET UG, in a city that also hosts an IIT.",
  },
  {
    slug: "aiims-bhopal",
    name: "All India Institute of Medical Sciences, Bhopal",
    shortName: "AIIMS Bhopal",
    city: "Bhopal",
    state: "Madhya Pradesh",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission is on the NEET UG score.",
  },
  {
    slug: "aiims-bhubaneswar",
    name: "All India Institute of Medical Sciences, Bhubaneswar",
    shortName: "AIIMS Bhubaneswar",
    city: "Bhubaneswar",
    state: "Odisha",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "MBBS admission is through NEET UG.",
  },
  {
    slug: "aiims-patna",
    name: "All India Institute of Medical Sciences, Patna",
    shortName: "AIIMS Patna",
    city: "Patna",
    state: "Bihar",
    type: "Medical",
    admitsVia: "neet-ug",
    context:
      "MBBS admission runs on the NEET UG score, serving a state with one of India's largest medical entrance cohorts.",
  },
  {
    slug: "aiims-raipur",
    name: "All India Institute of Medical Sciences, Raipur",
    shortName: "AIIMS Raipur",
    city: "Raipur",
    state: "Chhattisgarh",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission is through NEET UG.",
  },
  {
    slug: "aiims-rishikesh",
    name: "All India Institute of Medical Sciences, Rishikesh",
    shortName: "AIIMS Rishikesh",
    city: "Rishikesh",
    state: "Uttarakhand",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "MBBS admission is on the NEET UG score.",
  },
  {
    slug: "aiims-nagpur",
    name: "All India Institute of Medical Sciences, Nagpur",
    shortName: "AIIMS Nagpur",
    city: "Nagpur",
    state: "Maharashtra",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission runs through NEET UG.",
  },
  {
    slug: "jipmer-puducherry",
    name: "Jawaharlal Institute of Postgraduate Medical Education and Research, Puducherry",
    shortName: "JIPMER Puducherry",
    city: "Puducherry",
    state: "Puducherry",
    type: "Medical",
    admitsVia: "neet-ug",
    context:
      "MBBS admission is through NEET UG. JIPMER, like AIIMS, no longer runs a separate undergraduate entrance of its own.",
  },
  {
    slug: "maulana-azad-medical-college",
    name: "Maulana Azad Medical College, New Delhi",
    shortName: "MAMC Delhi",
    city: "New Delhi",
    state: "Delhi",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "MBBS admission is on the NEET UG score through the counselling process.",
  },
  {
    slug: "kgmu-lucknow",
    name: "King George's Medical University, Lucknow",
    shortName: "KGMU Lucknow",
    city: "Lucknow",
    state: "Uttar Pradesh",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission runs through NEET UG.",
  },
  {
    slug: "grant-medical-college-mumbai",
    name: "Grant Government Medical College, Mumbai",
    shortName: "Grant Medical College",
    city: "Mumbai",
    state: "Maharashtra",
    type: "Medical",
    admitsVia: "neet-ug",
    context:
      "MBBS admission is through NEET UG, at one of the oldest medical colleges in the country.",
  },
  {
    slug: "madras-medical-college",
    name: "Madras Medical College, Chennai",
    shortName: "Madras Medical College",
    city: "Chennai",
    state: "Tamil Nadu",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission is on the NEET UG score.",
  },
  {
    slug: "bj-medical-college-ahmedabad",
    name: "B J Medical College, Ahmedabad",
    shortName: "BJ Medical College",
    city: "Ahmedabad",
    state: "Gujarat",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "MBBS admission runs through NEET UG.",
  },
  {
    slug: "government-medical-college-thiruvananthapuram",
    name: "Government Medical College, Thiruvananthapuram",
    shortName: "GMC Thiruvananthapuram",
    city: "Thiruvananthapuram",
    state: "Kerala",
    type: "Medical",
    admitsVia: "neet-ug",
    context: "Undergraduate medical admission is through NEET UG.",
  },
];

/* ============================== LOOKUPS =============================== */

/** Indian and international entries together — what the router walks. */
export const ALL_CITIES: ExamCity[] = [...CITIES, ...INTERNATIONAL_CITIES];

export const cityPath = (c: ExamCity) => `/practice/${c.slug}`;
export const collegePath = (c: College) => `/college/${c.slug}`;

export function getCity(slug: string | undefined): ExamCity | undefined {
  return ALL_CITIES.find((c) => c.slug === slug);
}

export function getCollege(slug: string | undefined): College | undefined {
  return COLLEGES.find((c) => c.slug === slug);
}

/** The exam records a city or college page links to, in the order given. */
export function examsFor(slugs: string[]): Exam[] {
  return slugs.map((s) => EXAMS.find((e) => e.slug === s)).filter((e): e is Exam => Boolean(e));
}

/** Cities grouped by region, for the index page's headings. */
export function citiesByRegion(): { region: string; cities: ExamCity[] }[] {
  const order = [
    "North India",
    "West India",
    "South India",
    "East India",
    "Central India",
    "North East India",
    "Gulf",
    "South Asia",
    "Asia Pacific",
    "Europe",
  ];
  return order
    .map((region) => ({ region, cities: ALL_CITIES.filter((c) => c.region === region) }))
    .filter((g) => g.cities.length > 0);
}

/** Colleges grouped by institution family, for the index page. */
export function collegesByType(): { type: string; label: string; colleges: College[] }[] {
  const groups: { type: College["type"]; label: string }[] = [
    { type: "IIT", label: "Indian Institutes of Technology" },
    { type: "NIT", label: "National Institutes of Technology" },
    { type: "IIIT", label: "Indian Institutes of Information Technology" },
    { type: "Medical", label: "Medical colleges" },
    { type: "University", label: "Universities" },
  ];
  return groups
    .map((g) => ({ ...g, colleges: COLLEGES.filter((c) => c.type === g.type) }))
    .filter((g) => g.colleges.length > 0);
}
