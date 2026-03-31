// ── AI Command Prompts ────────────────────────────────────────────────────────
// Each command gets a specific, structured prompt instead of the raw word.
// The task list is always appended as context via callGroq's second argument.
const AI_PROMPTS = {
  suggest: (
    "You are a productivity assistant. Given the task list and current Kathmandu time, " +
    "recommend exactly 3 tasks the user should focus on RIGHT NOW (or fewer if fewer than 3 incomplete tasks exist). " +
    "Output ONLY a numbered list in this exact format:\n" +
    "1. [exact task name] - [why this task right now + one concrete next action]\n" +
    "2. [exact task name] - [why this task right now + one concrete next action]\n" +
    "3. [exact task name] - [why this task right now + one concrete next action]\n\n" +
    "Use the EXACT task names from the list. Factor in deadlines relative to current KTM time, urgency, and logical order. " +
    "Do not include done/completed tasks. Output ONLY the numbered list, nothing else."
  ),
  analyze: (
    "You are a task audit assistant. Analyze the following task list and report on: " +
    "1) Any overdue items (compare deadlines to current KTM time). " +
    "2) Tasks with no deadline or duration that may need more definition. " +
    "3) Workload balance across Today / Tomorrow / All buckets. " +
    "4) Any tasks that look vague or could be broken into smaller steps. " +
    "Be specific and direct. Plain text only. No markdown."
  ),
  prioritize: (
    "You are a prioritization assistant. Given the task list below, output ONLY a numbered list with reasoning in this exact format:\n" +
    "1. [exact task name] - [brief reason why this is priority]\n" +
    "2. [exact task name] - [brief reason why this is priority]\n" +
    "3. [exact task name] - [brief reason why this is priority]\n\n" +
    "Reorder ALL incomplete tasks by urgency and importance. " +
    "Use the EXACT task names from the list provided. " +
    "Factor in deadlines relative to current KTM time, estimated duration, and logical dependencies. " +
    "Keep reasons to 1-2 sentences. " +
    "Do not include done/completed tasks. Output ONLY the numbered list with reasons, nothing else."
  ),
};

// ── Parse Suggest Response ────────────────────────────────────────────────────
// Returns array of { task, reasoning } matched against currentTasks
function parseSuggestResponse(response, currentTasks) {
  const lines = response.split('\n').filter(l => l.trim());
  const suggested = [];
  const used = new Set();

  lines.forEach(line => {
    const match = line.match(/^[•\-\d]+[\.\)]\s*(.+?)(?:\s*-\s*(.+?))?(?:\s*[\[\(].*)?$/);
    if (!match) return;

    let taskName = match[1].trim().replace(/\s*[\[\(].*/, '').trim();
    const reasoning = match[2] ? match[2].trim() : null;

    // Exact case-insensitive match first
    let task = currentTasks.find(t => !used.has(t.id) && t.text.toLowerCase() === taskName.toLowerCase());

    // Fuzzy fallback: majority of task words appear in line
    if (!task) {
      task = currentTasks.find(t => {
        if (used.has(t.id)) return false;
        const taskWords = t.text.toLowerCase().split(/\s+/);
        const lineWords = line.toLowerCase().split(/\s+/);
        const matches = taskWords.filter(w => lineWords.some(lw => lw.includes(w) || w.includes(lw)));
        return matches.length >= Math.max(1, Math.floor(taskWords.length * 0.7));
      });
    }

    if (task) {
      suggested.push({ task, reasoning });
      used.add(task.id);
    }
  });

  return suggested;
}

// ── Parse Prioritize Response ─────────────────────────────────────────────────
function parsePrioritizeResponse(response, currentTasks) {
  const lines = response.split('\n').filter(l => l.trim());
  const ordered = [];
  const used = new Set();

  lines.forEach(line => {
    const match = line.match(/^[•\-\d]+[\.\)]\s*(.+?)(?:\s*-\s*(.+?))?(?:\s*[\[\(].*)?$/);
    if (match) {
      let taskName = match[1].trim();
      const reasoning = match[2] ? match[2].trim() : null;
      taskName = taskName.replace(/\s*[\[\(].*/, '').trim();

      let task = currentTasks.find(t => !used.has(t.id) && t.text.toLowerCase() === taskName.toLowerCase());

      if (!task) {
        task = currentTasks.find(t => {
          if (used.has(t.id)) return false;
          const taskWords = t.text.toLowerCase().split(/\s+/);
          const lineWords = line.toLowerCase().split(/\s+/);
          const matches = taskWords.filter(w => lineWords.some(lw => lw.includes(w) || w.includes(lw)));
          return matches.length >= Math.max(1, Math.floor(taskWords.length * 0.7));
        });
      }

      if (task) {
        ordered.push({ task, reasoning });
        used.add(task.id);
      }
    }
  });

  return ordered;
}