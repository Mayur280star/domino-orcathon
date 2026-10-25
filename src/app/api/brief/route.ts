import Anthropic from "@anthropic-ai/sdk";
import { ruleBrief, type BriefFacts } from "@/lib/sim/brief";

export const maxDuration = 60;

const SYSTEM = `You are the duty officer at a city emergency operations centre during a monsoon storm.
Write a briefing for the incident commander from the simulation facts you are given.

Rules:
- Use only numbers that appear in the facts. Do not invent places, numbers, or events.
- "Harm" means people at serious risk (expected value across simulated storms).
- Write large numbers with commas, e.g. 246,670.
- Plain, direct language a commander can act on in 30 seconds. No preamble, no sign-off.
- Under 200 words, in Markdown. Use exactly these five headings, word for word, in this order:
  ## Situation
  ## Most likely cascade
  ## Priority actions
  ## Why not the hazard-first plan
  ## Watch list
- Under "Priority actions", write a numbered list, most important first, saying what to send where and why.
- Under "Watch list", go hour by hour.`;

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
      // Free models only. They are all reasoning models: left on, reasoning eats the token budget and
      // the briefing comes back cut off, so it's switched off. If a model still returns a partial
      // briefing, move on to the next one.
      const primary = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
      const models = [
        primary,
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3.5-lightning:free",
        "google/gemma-4-31b-it:free",
      ].filter((m, i, a) => a.indexOf(m) === i);
      const deadline = Date.now() + 55_000;
      for (const model of models) {
        const left = deadline - Date.now();
        if (left < 5_000) break;
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
              "X-Title": "Domino",
            },
            body: JSON.stringify({
              model,
              max_tokens: 2000,
              reasoning: { enabled: false, exclude: true },
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: prompt },
              ],
            }),
            signal: AbortSignal.timeout(Math.min(left, 25_000)),
          });
          if (!r.ok) {
            console.error("brief: OpenRouter", model, r.status);
            continue;
          }
          const data = await r.json();
          const choice = data?.choices?.[0];
          if (choice?.finish_reason === "length") {
            console.error("brief: OpenRouter", model, "briefing cut off");
            continue;
          }
          const text = briefingOnly(choice?.message?.content ?? "");
          if (text) return Response.json({ text, source: "ai", model: data?.model ?? model });
        } catch (err) {
          console.error("brief: OpenRouter", model, err);
        }
      }
    }
  } catch (err) {
    console.error("brief: model call failed, using rule-based brief", err);
  }

  return Response.json({ text: ruleBrief(facts), source: "rules", model: null });
}

/** The briefing starts at its first section; anything before it is leaked reasoning. */
function briefingOnly(raw: string): string | null {
  const starts = [...raw.matchAll(/^## Situation/gm)];
  if (!starts.length) return null;
  const text = raw
    .slice(starts[starts.length - 1].index)
    .trim()
    // Some models copy the prompt's guidance into the heading, e.g. "## Priority actions (numbered, …)".
    .replace(/^(##\s+[^(\n]+?)\s*\(.*\)\s*$/gm, "$1");
  if (!/^## Watch list/m.test(text)) return null;
  return text.split(/\s+/).length >= 40 ? text : null;
}
