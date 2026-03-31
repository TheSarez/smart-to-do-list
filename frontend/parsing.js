// ── Duration Parser ──────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str?.trim()) return "";
  const n = str.toLowerCase().trim();

  // ── Natural language shorthands ───────────────────────────────────────────
  if (/^half\s+(?:an?\s+)?hour$/.test(n))        return "30 minutes";
  if (/^an?\s+hour$/.test(n))                   return "1 hour";
  if (/^a\s+couple\s+(?:of\s+)?hours?$/.test(n)) return "2 hours";
  if (/^an?\s+hour\s+and\s+a\s+half$/.test(n))  return "90 minutes";
  if (/^a\s+(?:few|couple\s+of)\s+minutes?$/.test(n)) return "5 minutes";

  // ── Compound: "2h30m", "1h 30m", "2 hours 30 minutes", "1hr30" ───────────
  const compound = n.match(
    /(\d+(?:\.\d+)?)\s*(?:h|hr|hour)s?\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(?:m|min|minute)s?/i
  );
  if (compound) {
    const h = parseFloat(compound[1]), m = parseFloat(compound[2]);
    const total = h * 60 + m;
    return total === 60 ? "1 hour"
      : total % 60 === 0 ? `${total / 60} hours`
      : `${total} minutes`;
  }

  // ── Single-unit patterns — longest/most-specific first ───────────────────
  // Use word-boundary aware patterns to avoid "2h30m" matching just "h" or "m"
  const single = [
    // Years — must check before days ("y" would match "day" otherwise — no, different)
    { r: /^(\d+(?:\.\d+)?)\s*(?:yr?|year)s?$/,          u: "year"   },
    // Months — "mo" prefix before minutes
    { r: /^(\d+(?:\.\d+)?)\s*(?:mo(?:nth)?)s?$/,        u: "month"  },
    // Weeks
    { r: /^(\d+(?:\.\d+)?)\s*(?:w(?:k|ee?k)?)s?$/,      u: "week"   },
    // Days — "d" alone, not inside longer word
    { r: /^(\d+(?:\.\d+)?)\s*d(?:ay)?s?$/,              u: "day"    },
    // Hours — "h", "hr", "hour"
    { r: /^(\d+(?:\.\d+)?)\s*(?:h(?:r|our)?)s?$/,       u: "hour"   },
    // Minutes — "m", "min", "mins", "minute"
    { r: /^(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?)?)s?$/,  u: "minute" },
    // Seconds
    { r: /^(\d+(?:\.\d+)?)\s*(?:s(?:ec(?:ond)?)?)s?$/,  u: "second" },
  ];
  for (const { r, u } of single) {
    const m = n.match(r);
    if (m) {
      const v = parseFloat(m[1]);
      return `${v % 1 === 0 ? Math.floor(v) : v} ${u}${v !== 1 ? "s" : ""}`;
    }
  }

  // ── Loose match for inline context ("about 2 hours", "~30 min") ───────────
  const loose = [
    { r: /(\d+(?:\.\d+)?)\s*(?:h(?:r|our)?)s?\b/i,       u: "hour"   },
    { r: /(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?)?)s?\b/i,  u: "minute" },
    { r: /(\d+(?:\.\d+)?)\s*(?:s(?:ec(?:ond)?)?)s?\b/i,  u: "second" },
    { r: /(\d+(?:\.\d+)?)\s*(?:d(?:ay)?)s?\b/i,           u: "day"    },
    { r: /(\d+(?:\.\d+)?)\s*(?:w(?:(?:ee)?k)?)s?\b/i,    u: "week"   },
    { r: /(\d+(?:\.\d+)?)\s*(?:mo(?:nth)?)s?\b/i,         u: "month"  },
    { r: /(\d+(?:\.\d+)?)\s*(?:y(?:(?:ea)?r)?)s?\b/i,    u: "year"   },
  ];
  for (const { r, u } of loose) {
    const m = n.match(r);
    if (m) {
      const v = parseFloat(m[1]);
      return `${v % 1 === 0 ? Math.floor(v) : v} ${u}${v !== 1 ? "s" : ""}`;
    }
  }

  return str.trim();
}

function parseAndNormalizeDuration(input) {
  // Try to parse as duration shorthand, otherwise return as-is
  if (!input?.trim()) return "";
  
  const parsed = parseDuration(input);
  return parsed === input.trim() ? input.trim() : parsed;
}

function parseStoredTime(str) {
  // Parse relative phrases, full dates, or times back to Date
  if (!str) return null;
  
  const now = new Date(ktmNow);
  const normalizedStr = str.toLowerCase().trim();
  
  try {
    // Try relative phrases first
    const relResult = parseRelativeDate(normalizedStr, now);
    if (relResult) return relResult;
    
    // Try full date format like "MMM D, YYYY, H:MM AM/PM"
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    // Try time-only like "9:00 AM" — assume today in KTM
    const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (m) {
      const base = new Date(ktmNow);
      let h = parseInt(m[1]);
      const min = parseInt(m[2]);
      const ap = m[3].toUpperCase();
      if (ap === "PM" && h !== 12) h += 12;
      if (ap === "AM" && h === 12) h = 0;
      base.setHours(h, min, 0, 0);
      return base;
    }
  } catch {}
  return null;
}

function extractPreposition(str) {
  // Extract preposition (at, on, at/on) if present at start
  const match = str.match(/^(at|on|at\/on)\s+(.+)$/i);
  if (match) {
    const prep = match[1].toLowerCase();
    const normalized = prep === "at/on" ? "at" : prep;
    return { preposition: normalized, rest: match[2] };
  }
  return { preposition: null, rest: str };
}

function extractTimeFromEnd(str) {
  // Extract time-of-day from end of string, with or without leading "at"
  // Patterns ordered most-specific first (HH:MM before bare hour)
  const timePatterns = [
    /(?:\s+at\s+|\s+@\s+|\s+)(\d{1,2}):(\d{2})\s*(am|pm)\s*$/i,  // "at 9:30am", "9:30pm"
    /(?:\s+at\s+|\s+@\s+|\s+)(\d{1,2})\s*(am|pm)\s*$/i,           // "at 3pm", "3pm"
    /\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*$/i,                     // leading "at" with no prior space
    /\bat\s+(\d{1,2})\s*(am|pm)\s*$/i,
  ];

  for (const pattern of timePatterns) {
    const match = str.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      const min  = match[2] && /^\d+$/.test(match[2]) ? parseInt(match[2]) : 0;
      const ap   = (match[match.length - 1] || "").toLowerCase();
      if (ap.includes("pm") && hour !== 12) hour += 12;
      if (ap.includes("am") && hour === 12) hour  = 0;
      const timeStr = `${String(hour % 12 || 12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
      const dateStr = str.slice(0, match.index).trim();
      return { dateStr, time: timeStr };
    }
  }

  return { dateStr: str, time: null };
}

function parseRelativeDate(str, baseDate) {
  const now   = new Date(baseDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Strip leading prepositions (possibly stacked: "due by", "by the") so callers don't have to
  const s = str.replace(/^(?:(?:by|before|due|on|at\/on|at)\s+)+/i, "").trim();

  // ── Keyword shortcuts ──────────────────────────────────────────────────────
  if (s === "today" || s === "tonight")          return new Date(today);
  if (s === "yesterday") {
    const d = new Date(today); d.setDate(d.getDate() - 1); return d;
  }
  if (s === "tomorrow") {
    const d = new Date(today); d.setDate(d.getDate() + 1); return d;
  }
  if (s === "next week") {
    const d = new Date(today); d.setDate(d.getDate() + 7); return d;
  }
  if (s === "next month") {
    const d = new Date(today); d.setMonth(d.getMonth() + 1); return d;
  }
  if (s === "next year") {
    const d = new Date(today); d.setFullYear(d.getFullYear() + 1); return d;
  }
  if (s === "this week" || s === "sometime this week") {
    const d = new Date(today); d.setDate(d.getDate() + 3); return d;
  }
  if (s === "this month") {
    const d = new Date(today); d.setDate(d.getDate() + 14); return d;
  }
  if (s === "end of week" || s === "eow" || s === "eoweek") {
    const d = new Date(today);
    d.setDate(d.getDate() + ((5 - now.getDay() + 7) % 7 || 7)); return d;
  }
  if (s === "end of month" || s === "eom" || s === "eomonth") {
    const d = new Date(today); d.setMonth(d.getMonth() + 1, 0); return d;
  }
  if (s === "end of year" || s === "eoy" || s === "eoyear") {
    const d = new Date(today); d.setMonth(11, 31); return d;
  }
  if (s === "asap" || s === "urgent" || s === "now") return new Date(now);

  // ── Relative offsets ───────────────────────────────────────────────────────
  // "in/after X days|weeks|months|hours"  /  "X days|weeks from now"
  const offsetMatch = s.match(/(?:in|after)\s+(\d+)\s+(hour|day|week|month)s?/i)
                   || s.match(/(\d+)\s+(hour|day|week|month)s?\s+(?:from now|later)/i);
  if (offsetMatch) {
    const n = parseInt(offsetMatch[1]), unit = offsetMatch[2].toLowerCase();
    const d = new Date(today);
    if (unit === "hour")  { d.setTime(now.getTime() + n * 3600000); }
    else if (unit === "day")   d.setDate(d.getDate() + n);
    else if (unit === "week")  d.setDate(d.getDate() + n * 7);
    else if (unit === "month") d.setMonth(d.getMonth() + n);
    return d;
  }

  // "X days/weeks ago"
  const agoMatch = s.match(/(\d+)\s+(day|week|month)s?\s+ago/i);
  if (agoMatch) {
    const n = parseInt(agoMatch[1]), unit = agoMatch[2].toLowerCase();
    const d = new Date(today);
    if (unit === "day")   d.setDate(d.getDate() - n);
    else if (unit === "week")  d.setDate(d.getDate() - n * 7);
    else if (unit === "month") d.setMonth(d.getMonth() - n);
    return d;
  }

  // ── Named weekdays ─────────────────────────────────────────────────────────
  const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

  // "next <weekday>"  — always the upcoming occurrence, minimum 1 day ahead
  const nextDayMatch = s.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (nextDayMatch) {
    const target = DAY_NAMES.indexOf(nextDayMatch[1].toLowerCase());
    const d = new Date(today);
    d.setDate(d.getDate() + ((target - now.getDay() + 7) % 7 || 7));
    return d;
  }

  // "this <weekday>"  — the coming occurrence this week (could be today)
  const thisDayMatch = s.match(/^this\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (thisDayMatch) {
    const target = DAY_NAMES.indexOf(thisDayMatch[1].toLowerCase());
    const d = new Date(today);
    const diff = (target - now.getDay() + 7) % 7;
    d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); // 0 → next week if already that day
    return d;
  }

  // Bare weekday name: "friday", "monday" — nearest upcoming
  const bareDayMatch = s.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i);
  if (bareDayMatch) {
    const target = DAY_NAMES.indexOf(bareDayMatch[1].toLowerCase());
    const d = new Date(today);
    const diff = (target - now.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  // ── Named month formats ────────────────────────────────────────────────────
  const MONTH_LONG  = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  const MONTH_SHORT = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

  function monthIdx(name) {
    const n = name.toLowerCase();
    const i = MONTH_LONG.indexOf(n);
    return i >= 0 ? i : MONTH_SHORT.indexOf(n);
  }

  const MONTH_PAT = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)";
  const ORD       = "(?:st|nd|rd|th)?";

  // "april 20", "apr 20", "april 20th", "april 20, 2026"  (month first)
  const mfMatch = s.match(new RegExp(`^(${MONTH_PAT})\\s+(\\d{1,2})${ORD},?\\s*(\\d{4})?$`, "i"));
  if (mfMatch) {
    const mi = monthIdx(mfMatch[1]), day = parseInt(mfMatch[2]);
    const year = mfMatch[3] ? parseInt(mfMatch[3]) : today.getFullYear();
    const d = new Date(year, mi, day);
    if (!mfMatch[3] && d < today) d.setFullYear(year + 1);
    return d;
  }

  // "20 april", "20th april", "20th of april", "20 apr", "20 april 2026"  (day first)
  const dfMatch = s.match(new RegExp(`^(\\d{1,2})${ORD}(?:\\s+of)?\\s+(${MONTH_PAT}),?\\s*(\\d{4})?$`, "i"));
  if (dfMatch) {
    const day = parseInt(dfMatch[1]), mi = monthIdx(dfMatch[2]);
    const year = dfMatch[3] ? parseInt(dfMatch[3]) : today.getFullYear();
    const d = new Date(year, mi, day);
    if (!dfMatch[3] && d < today) d.setFullYear(year + 1);
    return d;
  }

  // ── Numeric date formats ───────────────────────────────────────────────────
  // ISO: "2026-04-20"
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  // Numeric with separators — "20/4", "20/4/2026", "20-4-2026", "20.4.2026"
  // Disambiguate: if first number > 12 it must be day-first; otherwise assume DMY (Nepali convention)
  const numMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (numMatch) {
    let day, month;
    const a = parseInt(numMatch[1]), b = parseInt(numMatch[2]);
    const rawYear = numMatch[3];
    // If a > 12, must be DD/MM; if b > 12, must be MM/DD; else default to DD/MM
    if (a > 12)       { day = a; month = b; }
    else if (b > 12)  { day = b; month = a; }
    else              { day = a; month = b; }  // DD/MM default
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const fullYear = rawYear
      ? (rawYear.length === 2 ? 2000 + parseInt(rawYear) : parseInt(rawYear))
      : today.getFullYear();
    const d = new Date(fullYear, month - 1, day);
    if (!rawYear && d < today) d.setFullYear(fullYear + 1);
    return d;
  }

  return null;
}

function timeRemaining(timeStr) {
  const deadline = parseStoredTime(timeStr);
  if (!deadline) return null;
  const diff = deadline.getTime() - ktmNow.getTime();
  const abs = Math.abs(diff);
  const overdue = diff < 0;
  const totalMin = Math.floor(abs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs  = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  let str = "";
  if (days > 0)       str = `${days}d ${hrs}h`;
  else if (hrs > 0)   str = `${hrs}h ${mins}m`;
  else if (mins > 0)  str = `${mins}m`;
  else                str = "<1m";
  return { str, overdue };
}

function fd(d) {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const datePart = MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  const h = d.getHours(), m = d.getMinutes();
  if (h === 0 && m === 0) return datePart;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 || 12;
  const mm = String(m).padStart(2, "0");
  return `${datePart}, ${hh}:${mm} ${ampm}`;
}

// ── Local Task Parser ─────────────────────────────────────────────────────────
// Splits a raw "add" input into { task, time, duration, notes } entirely locally.
// Returns null only for genuinely ambiguous cases that need Groq.
//
// Strategy:
//   1. Strip a trailing "for <duration>" (unambiguous — always duration)
//   2. Find the earliest deadline anchor and split there
//   3. Pass the date fragment through parseTime(), duration through parseDuration()
//
// Groq fallback triggers when:
//   - "for" appears mid-sentence with no clear duration value after it
//     (e.g. "schedule meeting for tomorrow" — "for" here means purpose, not duration)
//   - no task words precede the first time marker (whole string is a time phrase)

// Deadline anchors — ordered most-specific first to avoid false matches
const _DEADLINE_ANCHORS = [
  // Explicit prepositions: "by friday", "before next week", "due tomorrow", "on april 10"
  /\b(by|before|due)\s+(today|tonight|tomorrow|next\s+\w+|this\s+\w+|end\s+of\s+\w+|eow|eom|eoy|asap|now|urgent|in\s+\d|after\s+\d|\d+\s+days?|\w+\s+\d{1,2})/i,
  /\b(by|before|due)\s+(\w+day)\b/i,                      // "by friday", "before monday"
  /\b(by|before|due|on)\s+\d{1,2}[\/\-\.]\d{1,2}/i,      // "by 20/4", "on 4-20"
  /\b(by|before|due|on)\s+\d{4}-\d{2}-\d{2}/i,            // "by 2026-04-20"
  /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bon\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d/i,
  /\bon\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)\b/i,                 // "at 3pm", "at 9:30am"
  // Bare relative keywords (must be preceded by at least one task word)
  /(?<=\S\s+)\b(today|tonight|tomorrow)\b/i,
  /(?<=\S\s+)\b(next\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  /(?<=\S\s+)\b(this\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  /(?<=\S\s+)\b(end\s+of\s+(week|month|year)|eow|eom|eoy)\b/i,
  /(?<=\S\s+)\b(asap|urgent|now)\b/i,
  /(?<=\S\s+)\b(in|after)\s+\d+\s+(hour|day|week|month)s?\b/i,
  // Bare month + day (both orders): "april 10", "10 april", "10th april", "10 apr"
  /(?<=\S\s+)\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
  /(?<=\S\s+)\b\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i,
  // Bare numeric date: "20/4", "20/4/2026", "4-20-2026"
  /(?<=\S\s+)\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/i,
  // Bare weekday: "friday", "monday" etc.
  /(?<=\S\s+)\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

// Duration unit words — used to confirm "for X" is a duration not a purpose
const _DUR_UNIT = /\b\d[\d\s]*\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|wk|week|mo|month|y|yr|year)s?\b|^(an?\s+hour|half\s+(?:an?\s+)?hour)$|\d+\s*(?:h|hr|hour)s?\s*\d+\s*(?:m|min)/i;

// "for <X>" where X starts with a purpose word → Groq handles it
const _FOR_PURPOSE_WORDS = /^(the|a(?!\s+\d)|an(?!\s+hour)|my|our|this|that|them|him|her|us|you|it|meeting|call|review|project|team|client|work|prep|presentation)\b/i;

// Duration anchors — match "for <amount>" anywhere, with optional trailing time phrase
// Capture group 1 = duration text, group 2 = any trailing time fragment
const _DUR_RE = /\bfor\s+([\w\s.]+?)(\s+(?:by|before|due|on|at|today|tonight|tomorrow|next|this|end|eow|eom|eoy|asap|now|urgent|in\s+\d|after\s+\d|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b.*)?$/i;

function localParseTask(raw) {
  if (!raw?.trim()) return { task: "", time: "", duration: "", notes: "" };
  let text = raw.trim();
  let durRaw = "", timeRaw = "";

  // ── Step 1: Extract "for <duration>" (with optional trailing time phrase) ─
  const durMatch = text.match(_DUR_RE);
  if (durMatch) {
    const candidate = durMatch[1].trim();
    const trailing  = durMatch[2]?.trim() ?? "";
    if (_FOR_PURPOSE_WORDS.test(candidate)) {
      return null; // "for the team", "for my review" etc. → Groq
    }
    if (_DUR_UNIT.test(candidate)) {
      durRaw = candidate;
      // Reconstruct text without the "for <duration>" part, keeping trailing time
      text = (text.slice(0, durMatch.index) + (trailing ? " " + trailing : "")).trim();
    }
  }

  // ── Step 2: Find earliest deadline anchor ────────────────────────────────
  let splitAt = -1;
  for (const pat of _DEADLINE_ANCHORS) {
    const m = text.match(pat);
    if (m && m.index !== undefined && m.index > 0) {
      if (splitAt === -1 || m.index < splitAt) splitAt = m.index;
    }
  }

  if (splitAt > 0) {
    timeRaw = text.slice(splitAt).trim();
    text    = text.slice(0, splitAt).trim();
  }

  // ── Step 3: Clean trailing prepositions left on task name ────────────────
  text = text.replace(/\s+(by|before|at|on|for|due|@)\s*$/i, "").trim();

  // ── Step 4: Sanity checks — fall back to Groq if something looks wrong ───
  if (!text) return null;                          // no task name extracted
  if (/^\d/.test(text)) return null;               // task starts with a number — odd
  if (timeRaw && !parseTime(timeRaw)) return null; // time fragment didn't parse

  return {
    task:     text,
    time:     timeRaw ? parseTime(timeRaw) : "",
    duration: durRaw  ? parseAndNormalizeDuration(durRaw) : "",
    notes:    "",
  };
}

// ── Chrono fallback ───────────────────────────────────────────────────────────
let _chrono = null, _chronoReady = false;
(function(){
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/chrono-node/2.7.6/chrono.min.js";
  s.onload = () => { _chrono = window.chrono; _chronoReady = true; };
  document.head.appendChild(s);
})();

function parseTime(raw) {
  if (!raw?.trim()) return "";
  
  const normalized = raw.toLowerCase().trim();
  
  // Extract preposition (at, on, at/on)
  const { preposition, rest } = extractPreposition(normalized);
  
  // Extract time if present (e.g., "april 10 at 3pm")
  const { dateStr, time } = extractTimeFromEnd(rest);
  
  // Try parsing the date part locally first
  let date = parseRelativeDate(dateStr, ktmNow);
  
  // If local parsing fails, try Chrono as fallback
  if (!date && _chronoReady && _chrono) {
    const chronoResult = _chrono.parseDate(dateStr, ktmNow, {forwardDate: true});
    if (chronoResult) date = chronoResult;
  }
  
  // If still no date, return as-is
  if (!date) return raw.trim();
  
  // Format the result with preposition
  let result = preposition ? preposition + " " : "";
  
  // If time was extracted, include it in the date format
  if (time) {
    // Set the time on the date object
    const [timePart, ampm] = time.split(" ");
    const [hours, mins] = timePart.split(":");
    let h = parseInt(hours);
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    date.setHours(h, parseInt(mins), 0, 0);
    result += fd(date);
  } else {
    // No time mentioned, format date without time of day
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const datePart = MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
    result += datePart;
  }
  
  return result;
}