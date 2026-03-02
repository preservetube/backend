import redis from '@/utils/redis';

const channelBlacklist = [
  'UCR7d_LMsADXorkUF5fkcEHQ',
  'UCgcX8KN9tjesfSg1KYW8JMA',
  'UCRbV62Z7jv5j9WHdjCQT4BQ',
  'UCErCs-HgXDfj_79jbWO8SqA',
  'UClt1wsBuiIJS8_RoAFlkSlQ',
  'UCviJ2KzLw4W7zRNzPv6FLbA',
  'UCUQmW2YLzhEmMTqO0RAPlOw',
  'UCtmnjVU-u1B7vX-XDhuvExA',
  'UCgcX8KN9tjesfSg1KYW8JMA',
  'UCh8VpxMSRm-JoogNpCFHbMw',
  'UCUQmW2YLzhEmMTqO0RAPlOw',
  'UC4Anp9y2TU-d5blFUf7wCqw',
  'UC-TaLb_bURExFdLFXkJ3Adg',
  'UC1XgosSxwK9xtrMLsRzCbHw'
]

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
- **Pipe separators** (|) splitting title into the classic pattern of caption | source | song — only a signal when used to stack multiple slop elements (e.g. character | show | slowed song). A single pipe for emphasis or listing does not count.
- **4K / [4K] tag** — almost always slop when paired with anything else.
- **"Edit" / "OneShot" / "Morphosis"** suffix or delimiter usage (║ Edit ║, 「Edit」).
- **Slowed / Reverb / Slowed+Reverb / MONTAGEM** — only counts when stacked with others
- **Known slop franchises:** This list is definitive, not illustrative. Only the following qualify: Johnny English, Mr. Bean, Breaking Bad, Peaky Blinders, American Psycho, Patrick Bateman, The Boys, Homelander, Dexter, Joe Goldberg, Squid Game, Rick Grimes, Thomas Shelby, John Wick, Kingsman. They must be explicitly named, no interpretation from your side.
- **Song name explicitly in title** — especially if slowed/remixed.
- **Description** — if it contains hashtag spam, or music credits it reinforces slop signals from the title.
- **Clickbait** is its own category and does not affect the slop score.

### EXCEPTIONS
- Tutorials, news, commentary, politics — score 0 automatically
- Lost/archived content — score 0 automatically
- Fan animations/original franchise-inspired art — do not trigger slop
- Direct movie/TV clips or scenes uploaded without transformative editing — score 4 automatically

### OUTPUT
Valid JSON only. No other text. One sentence reasoning max, be brief. Use your judgment — if multiple signals stack logically toward slop, score accordingly. Do not assume content type beyond what title explicitly states.

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

async function parseSlop(id: string, title: string, description: string, channelId: string): Promise<number> {
  if (channelBlacklist.includes(channelId)) return 5;

  const cachedSlop = await redis.get(`slop:${id}`)
  if (cachedSlop) return parseInt(cachedSlop)

  const { score, reasoning } = await analyseSlop(id , title, description)
  if (reasoning != 'failed to parse') await redis.set(`slop:${id}`, score, 'EX', 60 * 60 * 24 * 7)

  return score
}

export { parseSlop }