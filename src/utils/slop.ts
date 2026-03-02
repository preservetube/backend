import redis from '@/utils/redis';

async function analyseSlop(id: string, title: string, description: string) {
  const llmResponse = await (await fetch('https://nano-gpt.com/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.NANOGPT_API,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gemini-2.5-flash-lite',
      messages: [
        { role: 'user', content: `Role: You are "The Slop Detector." Analyze video titles and rate them 0-5 on the "Slop Score." Slop is derivative content using popular movie/TV footage + trendy audio + basic editing.

### SLOP SCORE (0-5)
- **0:** Original, complex, artistic. No slop signals.
- **1:** Fan edit with unique perspective, non-obvious choices.
- **2:** Well-made but predictable, adds nothing new.
- **3:** Some slop signals present, minimal effort visible.
- **4:** Textbook slop — popular character + overused/slowed song + 4K tag + "Edit."
- **5:** Maximum slop density — every possible signal stacked.

### SLOP SIGNALS
Use these as intuition guides, not a checklist. Weight them by how many stack together.

- **Emoji in title** — strong signal, especially 😂🤣😎😍🥺. Multiple emoji = very strong.
- **Title is entirely hashtags** — near-instant slop.
- **Unicode styled text** (𝐋𝐢𝐤𝐞 𝐓𝐡𝐢𝐬) — common in character edits.
- **Pipe separators** (|) splitting title into: caption | source | song — classic slop structure.
- **4K / [4K] tag** — almost always slop when paired with anything else.
- **"Edit" / "OneShot" / "Morphosis"** suffix or delimiter usage (║ Edit ║, 「Edit」).
- **Slowed / Reverb / Slowed+Reverb / MONTAGEM** — audio slop markers.
- **Known slop franchises:** Johnny English, Mr. Bean, Breaking Bad, Peaky Blinders, American Psycho, Patrick Bateman, The Boys, Homelander, Dexter, Joe Goldberg, Squid Game, Rick Grimes, Thomas Shelby, John Wick, Kingsman, and similar.
- **Song name explicitly in title** — especially if slowed/remixed.
- **Description** — if it contains hashtag spam, "subscribe," "no copyright," or music credits it reinforces slop signals from the title.
- **Tutorials and how-to videos** — score 0, always.
- **Scenes or cut fragments from shows or movies** — only applies when the title explicitly states it is a scene or clip from a specific, named and widely-known show or movie. Score 4. Fan animations or original artwork inspired by a franchise do not trigger this.

### EXCEPTIONS
- If the content is "lost" or an archived version, the score is always 0, regardless of other signals.

### OUTPUT
Valid JSON only. No other text. Reasoning max one sentence, and brief.

{"score": 0, "reasoning": "..."}

User Title: ${title}
User Description: ${description.slice(0,100)}` }
      ]
    })
  })).json() 

  let parsedResponse: {score: number, reasoning: string} 
    = { score: 0, reasoning: 'failed to parse' }
  
  try {
    parsedResponse = JSON.parse(llmResponse.choices[0].message.content.replace(/```json|```/g, '').trim())
    console.log(`parsed ${id} - ${JSON.stringify(parsedResponse)}`)
  } catch (e) {
    console.log(`failed to parse ${id} - ${llmResponse.choices[0].message.content}`)
  }

  return parsedResponse
}

async function parseSlop(id: string, title: string, description: string): Promise<number> {
  const cachedSlop = await redis.get(`slop:${id}`)
  if (cachedSlop) return parseInt(cachedSlop)

  const { score, reasoning } = await analyseSlop(id , title, description)
  if (reasoning != 'failed to parse') await redis.set(`slop:${id}`, score, 'EX', 60 * 60 * 24 * 7)

  return score
}

export { parseSlop }