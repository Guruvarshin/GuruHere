import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { systemPrompt } from "@/lib/prompt";
import curated from "@/public/answers.json" assert { type: "json" };

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || ""
});

const MODEL = "gemini-2.5-flash"; 


function fuzzyMatch(question) {
  const q = String(question || "").toLowerCase();
  for (const [key, value] of Object.entries(curated)) {
    const triggers = [key, ...(value.triggers || [])];
    if (triggers.some(t => q.includes(String(t).toLowerCase()))) {
      return value.answer;
    }
  }
  return null;
}

export async function POST(req) {
  try {
    const { question } = await req.json();
    const q = String(question || "").trim();
    if (!q) return NextResponse.json({ answer: "" });

    // 1) local fallback (never breaks demo)
    const local = fuzzyMatch(q);
    if (local) return NextResponse.json({ answer: local, source: "local" });

    // 2) LLM
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        answer:
          "I’m set up for voice, but my AI key isn’t configured on the server yet. Please try one of the example questions.",
        source: "no-key",
      });
    }

    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [`${systemPrompt}\n\nQuestion: "${q}"`],
      config: { temperature: 0.6 }
    });
    console.log(res.text);
    const text = (res && (res.text || (res.response && res.response.text))) || "";
    const safe = String(text).replace(/^[\"'\s]+|[\"'\s]+$/g, "").slice(0, 1200);

    return NextResponse.json({ answer: safe, source: "gemini" });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      answer: "I hit a snag answering that. Please try again or rephrase.",
      source: "error",
    });
  }
}
