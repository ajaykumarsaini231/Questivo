// import React, { useEffect, useState } from "react";
// // @import "tailwindcss";
// // import dotenv from "dotenv";

// // Load environment variables
// // dotenv.config();

// // Define the possible categories for Mediastack
// const categories = [
//   "business",
//   "entertainment",
//   "health",
//   "science",
//   "sports",
//   "technology",
//   "general",
// ] as const;
// type Category = (typeof categories)[number];

// // Mediastack Article Interface
// interface Article {
//   author: string | null;
//   title: string;
//   description: string | null;
//   url: string;
//   source: string;
//   image: string | null;
//   category: string;
//   language: string;
//   country: string;
//   published_at: string;
// }

// const News: React.FC = () => {
//   const [category, setCategory] = useState<Category>("general");
//   const [articles, setArticles] = useState<Article[]>([]);
//   const [loading, setLoading] = useState(false);

//   // Environment variable (make sure it's VITE_MEDIASTACK_API_KEY in .env)
//   const apiKey = process.env.API_KEY;
//   console.log("API Key:", apiKey);

//   useEffect(() => {
//     async function fetchNews() {
//       setLoading(true);
//       try {
//         const res = await fetch(
//           `http://api.mediastack.com/v1/news?access_key=${apiKey}&countries=in&categories=${category}`
//         );
//         const data = await res.json();

//         // ✅ Mediastack returns data in `data.data`
//         if (data.data) {
//           setArticles(data.data);
//         } else {
//           console.error("Mediastack error:", data);
//         }
//       } catch (err) {
//         console.error("Fetch error:", err);
//       }
//       setLoading(false);
//     }

//     fetchNews();
//   }, [category, apiKey]);

//   return (
//     <div className="p-4 max-w-3xl mx-auto">
//       <h1 className="text-2xl font-bold mb-4">
//         Top Headlines in India ({category})
//       </h1>

//       {/* Category Dropdown */}
//       <div className="mb-4">
//         <label htmlFor="category" className="mr-2 font-medium">
//           Choose Category:
//         </label>
//         <select
//           id="category"
//           value={category}
//           onChange={(e) => setCategory(e.target.value as Category)}
//           className="border rounded px-2 py-1"
//         >
//           {categories.map((cat) => (
//             <option value={cat} key={cat}>
//               {cat.charAt(0).toUpperCase() + cat.slice(1)}
//             </option>
//           ))}
//         </select>
//       </div>

//       {/* News List */}
//       {loading ? (
//         <p>Loading articles...</p>
//       ) : (
//         <div>
//           {articles.length === 0 ? (
//             <p>No articles found.</p>
//           ) : (
//             articles.map((a, i) => (
//               <div key={i} className="border-b py-3">
//                 <h2 className="text-xl font-semibold">{a.title}</h2>
//                 {a.description && <p>{a.description}</p>}
//                 <p className="text-sm text-gray-500">
//                   {a.source} • {new Date(a.published_at).toLocaleString()}
//                 </p>
//                 <a
//                   href={a.url}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   className="text-blue-600"
//                 >
//                   Read more
//                 </a>
//               </div>
//             ))
//           )}
//         </div>
//       )}
//     </div>
//   );
// };

// export default News;
