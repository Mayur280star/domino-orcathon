import Anthropic from "@anthropic-ai/sdk";
import { ruleBrief, type BriefFacts } from "@/lib/sim/brief";

const SYSTEM = `You are the duty officer at a city emergency operations centre during a monsoon storm.
Write a briefing for the incident commander from the simulation facts you are given.

Rules:
- Use only numbers that appear in the facts. Do not invent places, numbers, or events.
- "Harm" means people at serious risk (expected value across simulated storms).
- Plain, direct language a commander can act on in 30 seconds. No preamble, no sign-off.
- Under 200 words. Markdown with these sections: "## Situation", "## Most likely cascade",
  "## Priority actions" (numbered, most important first, say what to send where and why),
  "## Why not the hazard-first plan", "## Watch list" (hour by hour).`;

export async function POST(req: Request) {
  let facts: BriefFacts;
  try {
    facts = (await req.json()) as BriefFacts;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = `Simulation facts (JSON):\n${JSON.stringify(facts)}`;

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic();
      const res = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      if (res.stop_reason !== "refusal" && text) return Response.json({ text, source: "ai", model: res.model });
    } else if (process.env.OPENROUTER_API_KEY) {
      const model = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "X-Title": "Domino",
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text: string | undefined = data?.choices?.[0]?.message?.content?.trim();
        if (text) return Response.json({ text, source: "ai", model });
      }
    }
  } catch (err) {
    console.error("brief: model call failed, using rule-based brief", err);
  }

  return Response.json({ text: ruleBrief(facts), source: "rules", model: null });
}
