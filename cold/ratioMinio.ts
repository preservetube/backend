import { readFile } from "node:fs/promises";
import { db } from '@/utils/database'

const INPUT_FILE = "s3.txt";
const AMSTERDAM_TIMEZONE = "Europe/Amsterdam";
const MIN_SIZE_BYTES = 75 * 1024 ** 2; // 75 MiB

const coldFiles = await db.selectFrom('files')
  .select(['filename'])
  .execute()

const SIZE_MULTIPLIERS: Record<string, number> = {
  KiB: 1024,
  MiB: 1024 ** 2,
  GiB: 1024 ** 3,
};

type ParsedEntry = {
  timestamp: string;
  filename: string;
  sizeText: string;
  sizeBytes: number;
  ageDays: number;
  ratio: number;
};

const linePattern =
  /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (UTC|CET|CEST)\]\s+([0-9.]+)(KiB|MiB|GiB)\s+\S+\s+(.+)$/;

function parseTimestamp(dateTime: string, zone: string): Date {
  const [datePart, timePart] = dateTime.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second] = timePart.split(":").map(Number);

  if (zone === "UTC") {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  if (zone === "CET" || zone === "CEST") {
    const utcOffsetHours = zone === "CEST" ? 2 : 1;
    return new Date(Date.UTC(year, month - 1, day, hour - utcOffsetHours, minute, second));
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(utcGuess);
  const localYear = Number(parts.find((part) => part.type === "year")?.value);
  const localMonth = Number(parts.find((part) => part.type === "month")?.value);
  const localDay = Number(parts.find((part) => part.type === "day")?.value);
  const localHour = Number(parts.find((part) => part.type === "hour")?.value);
  const localMinute = Number(parts.find((part) => part.type === "minute")?.value);
  const localSecond = Number(parts.find((part) => part.type === "second")?.value);

  const desiredUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const displayedUtcMs = Date.UTC(
    localYear,
    localMonth - 1,
    localDay,
    localHour,
    localMinute,
    localSecond,
  );

  return new Date(utcGuess.getTime() - (displayedUtcMs - desiredUtcMs));
}

function formatReferenceTime(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: AMSTERDAM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}

async function main(): Promise<void> {
  const input = await readFile(INPUT_FILE, "utf8");
  const now = new Date();
  const entries: ParsedEntry[] = [];

  for (const line of input.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, timestampWithoutZone, zone, sizeValueText, sizeUnit, filename] = match;
    const timestamp = `${timestampWithoutZone} ${zone}`;
    const sizeValue = Number(sizeValueText);
    const sizeBytes = sizeValue * SIZE_MULTIPLIERS[sizeUnit];
    const createdAt = parseTimestamp(timestampWithoutZone, zone);
    const ageDays = Math.max(now.getTime() - createdAt.getTime(), 0) / 86_400_000;

    entries.push({
      timestamp,
      filename,
      sizeText: `${sizeValueText}${sizeUnit}`,
      sizeBytes,
      ageDays,
      ratio: sizeBytes * ageDays,
    });
  }

  entries.sort(
    (left, right) =>
      right.ratio - left.ratio ||
      right.sizeBytes - left.sizeBytes ||
      right.ageDays - left.ageDays ||
      left.filename.localeCompare(right.filename),
  );

  const lines = [
    `Reference time: ${formatReferenceTime(now)}`,
    "Ratio formula: size_bytes * age_days",
    "Sorted from biggest ratio to lowest ratio.",
    "",
    "Rank\tRatio\tAge(days)\tSize(bytes)\tSize\tTimestamp\tFilename",
    ...entries
      .filter(e => e.sizeBytes >= MIN_SIZE_BYTES && !coldFiles.find(c => c.filename == e.filename))
      .map((entry, index) =>
      [
        String(index + 1),
        entry.ratio.toFixed(2),
        entry.ageDays.toFixed(2),
        String(Math.round(entry.sizeBytes)),
        entry.sizeText,
        entry.timestamp,
        entry.filename,
      ].join("\t"),
    ),
  ];

  console.log(lines.join("\n"));
}

await main();
