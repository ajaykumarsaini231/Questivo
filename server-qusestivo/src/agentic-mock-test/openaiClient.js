// openaiClient.js
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

export const perplexity = axios.create({
  baseURL: "https://api.perplexity.ai",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
  },
});
