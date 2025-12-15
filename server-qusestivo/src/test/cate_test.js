// cate_test.js
// Seed script to upsert ExamCategory rows for EXAMS list (no destructive reset).
// Usage: node cate_test.js

import prisma from "../prismaClient.js"; // adjust path if needed
import { setTimeout as wait } from "timers/promises";

const EXAMS = [
  { name: "KVS / NVS Teaching & Non-Teaching", code: "KVS_NVS_TNT_2025" },
  { name: "RRB NTPC 10+2 UG", code: "RRB_NTPC_UG_07_2025" },
  { name: "RRB NTPC Graduate Level", code: "RRB_NTPC_GRAD_06_2025" },
  { name: "RRB Junior Engineer JE", code: "RRB_JE_05_2025" },
  { name: "RSSB REET Primary / Upper Primary Teacher", code: "RSSB_REET_2025" },

  { name: "BSSC 10+2 Inter Level", code: "BSSC_INTER_2023" },
  { name: "BSSC Sports Trainer", code: "BSSC_SPORTS_TRAINER_2025" },
  { name: "BSSC Office Attendant", code: "BSSC_OFFICE_ATTENDANT_2025" },
  { name: "BSSC 4th Graduate Level", code: "BSSC_4TH_GRAD_2025" },
  { name: "BSSC Stenographer", code: "BSSC_STENO_2025" },

  { name: "NTA JEE Mains", code: "NTA_JEE_MAIN_2025" },
  { name: "NEET", code: "NEET_2025" },
  { name: "Delhi Police Constable", code: "DELHI_POLICE_CONST" },
  { name: "Delhi Police SI", code: "DELHI_POLICE_SI" },
  { name: "Delhi Police Head Constable Ministerial", code: "DELHI_POLICE_HCM_2025" },

  { name: "GATE CSE – Computer Science", code: "GATE_CSE" },
  { name: "GATE CE – Civil Engineering", code: "GATE_CE" },
  { name: "GATE ME – Mechanical Engineering", code: "GATE_ME" },
  { name: "GATE EE – Electrical Engineering", code: "GATE_EE" },
  { name: "GATE EC – Electronics & Communication", code: "GATE_EC" },
  { name: "GATE IN – Instrumentation Engineering", code: "GATE_IN" },
  { name: "GATE CH – Chemical Engineering", code: "GATE_CH" },
  { name: "GATE MT – Metallurgical Engineering", code: "GATE_MT" },
  { name: "GATE BT – Biotechnology", code: "GATE_BT" },
  { name: "GATE AE – Aerospace Engineering", code: "GATE_AE" },
  { name: "GATE AG – Agricultural Engineering", code: "GATE_AG" },
  { name: "GATE AR – Architecture & Planning", code: "GATE_AR" },
  { name: "GATE CY – Chemistry", code: "GATE_CY" },
  { name: "GATE EY – Ecology & Evolution", code: "GATE_EY" },
  { name: "GATE GE – Geology", code: "GATE_GE" },
  { name: "GATE GG – Geophysics", code: "GATE_GG" },
  { name: "GATE MA – Mathematics", code: "GATE_MA" },
  { name: "GATE NM – Naval Architecture & Marine Engineering", code: "GATE_NM" },
  { name: "GATE PH – Physics", code: "GATE_PH" },
  { name: "GATE PI – Production & Industrial Engineering", code: "GATE_PI" },
  { name: "GATE ST – Statistics", code: "GATE_ST" },
  { name: "GATE TF – Textile Engineering & Fibre Science", code: "GATE_TF" },
  { name: "GATE XL – Life Sciences", code: "GATE_XL" },
  { name: "GATE XH – Humanities & Social Sciences", code: "GATE_XH" },

  { name: "CTET", code: "CTET_DEC_2024" },

  { name: "RRB NTPC Inter Level", code: "RRB_NTPC_INTER_2024" },
  { name: "JCI Various Posts", code: "JCI_VAR_2024" },
  { name: "NIACL AO Scale-I", code: "NIACL_AO_SCALE1_2024" },

  { name: "SSC GD Constable", code: "SSC_GD_2024" },
  { name: "Haryana Police Constable", code: "HSSC_HR_POLICE_CONST_2024" },
  { name: "Indian Navy SSR Medical Assistant", code: "NAVY_SSR_MED_ASSIST_2024" },
  { name: "RSMSSB CET 10+2 Level", code: "RSMSSB_CET_10_2_2024" },
  { name: "IRDAI Assistant Manager", code: "IRDAI_AM_2024" },
  { name: "RRB Paramedical", code: "RRB_PARAMEDICAL_2024" },
  { name: "MPESB ITI Training Officer", code: "MPESB_ITI_TRAINING_OFF_2024" },

  { name: "RSMSSB CET Graduate Level", code: "RSMSSB_CET_GRAD_2024" },
  { name: "HPSC Motor Vehicle Officer MVO", code: "HPSC_MVO_2024" },
  { name: "SSC JHT", code: "SSC_JHT_2024" },
  { name: "HPSC Assistant Professor", code: "HPSC_AST_PROF_2024" },
  { name: "JSSC Field Worker JFWCE", code: "JSSC_FIELD_WORKER_2024" },
  { name: "AIIMS NORCET 7 Nursing Officer", code: "AIIMS_NORCET_7_2024" },

  { name: "IBPS PO XIV", code: "IBPS_PO_XIV_2024" },
  { name: "IBPS SO XIV", code: "IBPS_SO_XIV_2024" },
  { name: "JPSC ACF / FRO", code: "JPSC_ACF_FRO_2024" },
  { name: "RRB JE", code: "RRB_JE_03_2024" },
  { name: "RRB Technician", code: "RRB_TECH_02_2024" },
  { name: "RRB ALP", code: "RRB_ALP_01_2024" },
  { name: "RPF Constable / SI", code: "RPF_CONST_SI_2024" },
  { name: "ITBP SI Hindi Translator", code: "ITBP_SI_HINDI_TR_2024" },
  { name: "NABARD Grade A", code: "NABARD_AM_GRADE_A_2024" },

  { name: "SSC Stenographer Grade C & D", code: "SSC_STENO_CD_2024" },
  { name: "HPSC PGT", code: "HPSC_PGT_2024" },
  { name: "RBI Grade B", code: "RBI_GRADE_B_2024" },
  { name: "UKPSC APS", code: "UPPSC_APS_2024" },
  { name: "ITBP HC Education & Stress Counselor", code: "ITBP_HC_EDU_STRESS_2024" },

  { name: "SSC CGL", code: "SSC_CGL_2024" },
  { name: "SSC MTS / Havaldar", code: "SSC_MTS_HAV_2024" },
  { name: "SSC CHSL", code: "SSC_CHSL_2024" },
  { name: "SSC GD", code: "SSC_GD_2023" },
  { name: "SSC CPO SI", code: "SSC_CPO_SI_2024" },
  { name: "SSC JE", code: "SSC_JE_2024" },
  { name: "SSC Phase-XII", code: "SSC_PHASE_12_2024" },

  { name: "IBPS Clerk XIV", code: "IBPS_CLERK_XIV_2024" },
  { name: "UPPSC PCS", code: "UPPSC_PCS_2024" },

  { name: "IBPS RRB XIII", code: "IBPS_RRB_13_2024" },
  { name: "SBI PO", code: "SPI_PO_2024" },
  { name: "SBI Clerk", code: "SBI_CLERK_2024" },
  { name: "JPSC CDPO", code: "JPSC_CDPO_2024" },
  { name: "BSEB Sakshamta Pariksha", code: "BSEB_SAKSHAMTA_2024" },

  { name: "UPSC IAS / IFS", code: "UPSC_IAS_IFS_2024" },
  { name: "UPSC Engineering Services", code: "UPSC_ENGG_SERVICES_2024" },
  { name: "UPSC CDS", code: "UPSC_CDS_2024" },
  { name: "UPSC CMS", code: "UPSC_CMS_2024" },
  { name: "UPSC EPFO PA", code: "UPSC_EPFO_PA_2024" },
  { name: "UPSC EPFO Nursing Officer", code: "UPSC_EPFO_NURSING_2024" },
  { name: "UPSC Geo-Scientist", code: "UPSC_GEO_SCI_2024" },
  { name: "UPSC NDA-II", code: "UPSC_NDA_2_2024" },

  { name: "BPSC Assistant Engineer", code: "BPSC_AE_2024" },
  { name: "BPSC Head Teacher / Head Master", code: "BPSC_HEAD_TEACHER_MASTER_2024" },
  { name: "BPSC School Teacher TRE-I", code: "BPSC_TRE_1_2024" },
  { name: "BPSC School Teacher TRE-2", code: "BPSC_TRE_2_2024" },
  { name: "BPSC School Teacher TRE-3", code: "BPSC_TRE_3_2024" },
  { name: "BPSC Vice Principal ITI", code: "BPSC_VP_ITI_2024" },
  { name: "BPSC SAV School Teacher", code: "BPSC_SAV_TEACHER_2024" },
  { name: "BPSC Assistant Architect", code: "BPSC_AST_ARCH_2024" },
  { name: "BPSC Block Horticulture Officer", code: "BPSC_BHO_2024" },
  { name: "BPSC Agriculture Department Various Posts", code: "BPSC_AGRI_DEPT_2024" },
  { name: "BPSC 69th Examination", code: "BPSC_69TH_2024" },
  { name: "BPSC Judicial Services", code: "BPSC_JUDICIAL_2024" },
  { name: "BPSSC SI", code: "BPSSC_SI_02_2023" },
  { name: "CSBC Bihar Police Constable", code: "CSBC_CONST_01_2023" },
  { name: "UP Police Constable", code: "UPP_CONST_01_2023" },
];

export default async function seedExams() {
  console.log(`Seeding ${EXAMS.length} exam categories...`);
  for (const exam of EXAMS) {
    try {
      const up = await prisma.examCategory.upsert({
        where: { code: exam.code },
        update: { name: exam.name, isActive: true },
        create: { name: exam.name, code: exam.code, isActive: true },
      });
      console.log("Upserted:", up.code);
      // small delay to reduce DB load
      await wait(50);
    } catch (err) {
      console.error("Failed to upsert", exam.code, err.message || err);
      throw err;
    }
  }
  console.log("Seeding complete.");
}
