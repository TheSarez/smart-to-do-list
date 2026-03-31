# Task Manager — Win98 Edition

## Stack
- **Backend**: Python / FastAPI
- **AI**: Groq (`llama-3.3-70b-versatile`)
- **Time**: Kathmandu (Asia/Kathmandu, UTC+5:45)
- **Frontend**: Vanilla HTML/CSS/JS (single file)

## Setup

### 1. Clone / place files
```
taskmanager/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .env          ← create from .env.example
└── frontend/
    └── index.html
```

### 2. Install dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env and add your Groq API key:
# GROQ_API_KEY=gsk_...
```
Get a free key at https://console.groq.com

### 4. Run
```bash
cd backend
uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000` in your browser.

## Features

### Time
- Live Kathmandu clock in the titlebar and status bar
- Syncs with backend every 30s, ticks locally every 1s
- Task deadline shown as entered time by default
- **Hover** over a task → shows time remaining (e.g. `2h 30m left`)
- **Overdue tasks** show "Overdue" in red

### Task display
- Task name followed by duration in faint font: `Walk dog  (30m)  10:00 AM`

### AI (Groq)
- **Smart add**: Type natural language like `"dentist at 3pm tomorrow for 1 hour"` → auto-fills task name, duration, time, notes
- **Terminal commands**: `suggest`, `analyze`, `prioritize` — powered by Groq with full task context + current KTM time

### Terminal commands
```
help          — show commands
list          — list all tasks by bucket
add <text>    — add task (AI-parsed)
done          — toggle done on selected
delete        — delete selected
cleardone     — remove all completed tasks
move today|tomorrow|all  — move selected tasks
clear         — clear terminal output
suggest       — AI task suggestions
analyze       — AI priority analysis
prioritize    — AI prioritization advice
```
