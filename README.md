# 🎓 Questivo - AI-Powered Mock Test Platform

🌐 **Live Demo:** https://questivo.vercel.app/

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-v20%2B-green.svg)
![React](https://img.shields.io/badge/react-v19-blue.svg)

**Questivo** is a full-stack "Agentic AI" examination platform designed to generate high-quality, competitive-level mock tests (UPSC, GATE, JEE, CAT) dynamically. Unlike standard generators, it utilizes **Groq (Llama 3.3 70B)** to create deep, multi-step reasoning questions, Statement Analysis, and Assertion-Reasoning types specifically tuned for high-difficulty exams.

---
## Home Page
<img width="1364" height="636" alt="image" src="https://github.com/user-attachments/assets/3d111a50-dc69-4bf4-bbbd-a128e00fc0df" />

## Profile page 
<img width="1248" height="638" alt="image" src="https://github.com/user-attachments/assets/cb8543ee-1b4b-4f6f-b9a2-38f84f1b2489" />


## Test Generation 
<img width="1021" height="636" alt="image" src="https://github.com/user-attachments/assets/38517749-3c82-4458-9475-8440c9c1d074" />

## Test Window 
<img width="1191" height="638" alt="image" src="https://github.com/user-attachments/assets/201372db-f7b9-45e7-8efa-6b71fe29df78" />



## 🚀 Tech Stack

### **Frontend (Client)**
* **Framework:** React 19 (Vite)
* **Language:** TypeScript
* **Styling:** Tailwind CSS v4
* **Animations:** Framer Motion
* **Icons:** Lucide React, React Icons
* **State/Network:** Axios, React Router DOM v7
* **Notifications:** React Hot Toast

### **Backend (Server)**
* **Runtime:** Node.js & Express.js
* **Database:** PostgreSQL (via Prisma ORM)
* **AI Engine:** Groq SDK (`llama-3.3-70b-versatile`)
* **Authentication:** JWT (JSON Web Tokens) & HTTP-Only Cookies
* **Validation:** Joi
* **Security:** Bcryptjs, CORS, Express Rate Limit

---

## 📂 Project Structure

The project is organized as a monorepo-style structure:

```text
questivo/
├── questivo/         # Frontend (Vite/React/TS)
├── server-questivo/         # Backend (Express/Prisma/Groq)
└── README.md
```
---


# Questivo – AI Powered Mock Test Platform 🚀

Questivo is a full-stack mock test platform designed for competitive exam preparation (GATE, JEE, SSC, UPSC, etc.), powered by Agentic AI (Llama 3.3 70B via Groq) for high-quality question generation.

---

## 🛠️ Installation & Setup

### 📌 Prerequisites
- Node.js (v18 or higher)
- PostgreSQL Database
- Groq API Key (for AI generation)

---

## 1️⃣ Backend Setup (Server)

Navigate to the server directory and install dependencies:

```bash
cd server-questivo
npm install
```

### 🔐 Environment Configuration

Create a `.env` file in the `server` directory:

```env
PORT=4000
FRONTEND_URL="http://localhost:5173"

DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"

JWT_SECRET="your_super_complex_secret_key"

GROQ_API_KEY="gsk_..."

EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-app-password"
```

### 🗄️ Database Initialization

```bash
npx prisma generate
npx prisma db push
```

### ▶️ Start the Server

```bash
npm start
```

Server runs on:
http://localhost:4000

---

## 2️⃣ Frontend Setup (Client)

```bash
cd questivo
npm install
```

### 🌐 Environment Configuration

Create `.env` inside `client` directory:

```env
VITE_API_URL="http://localhost:4000/api"
```

### ▶️ Start the Client

```bash
npm run dev
```

Frontend runs on:
http://localhost:5173

---

## ✨ Key Features

### 🧠 Agentic AI Generation
- Deep reasoning with Llama 3.3 70B
- Scenario-based & statement-analysis questions
- Hard / Very Hard difficulty enforcement
- Token-optimized batching (≈15 questions/batch)

### 🔒 Secure Authentication
- HTTP-only cookies for JWT
- Protected routes

### 🎨 Modern UI
- Tailwind CSS v4
- Framer Motion animations
- Responsive design

---

## 🔌 API Endpoints

### 🔑 Auth (`/api/auth`)
- POST /register
- POST /login
- POST /logout

### 🧪 Tests (`/api`)
- POST /test/generate
- GET /test/:id

### 📚 Resources
- GET /api/category
- GET /api/cate_topics

---

## ⚠️ Troubleshooting

### Groq Rate Limits (429)
Set:
MAX_BATCH_SIZE ≤ 15
in:
src/agentic-mock-test/questionGenerator.js

### CORS Issues
Ensure backend `.env`:
FRONTEND_URL="http://localhost:5173"

---

## 📜 License
MIT License


