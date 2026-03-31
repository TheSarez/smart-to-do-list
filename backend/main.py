# uvicorn main:app --reload --port 8000
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import pytz
import os
from dotenv import load_dotenv
from groq import Groq
import json

load_dotenv()

app = FastAPI(title="Task Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
KTM = pytz.timezone("Asia/Kathmandu")

groq_client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None


# ── Models ────────────────────────────────────────────────────────────────────

class AIRequest(BaseModel):
    prompt: str
    tasks: Optional[str] = ""

class ParseRequest(BaseModel):
    text: str

class Task(BaseModel):
    id: int
    text: str
    done: bool
    bucket: str
    time: str = ""
    duration: str = ""
    notes: str = ""

class TaskList(BaseModel):
    tasks: List[Task]


# ── Helpers ───────────────────────────────────────────────────────────────────

def ktm_now() -> datetime:
    return datetime.now(KTM)

def ktm_now_iso() -> str:
    return ktm_now().isoformat()


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/time")
def get_time():
    """Return current Kathmandu time."""
    now = ktm_now()
    return {
        "iso": now.isoformat(),
        "timestamp": now.timestamp(),
        "display": now.strftime("%b %d, %Y, %I:%M %p"),
        "timezone": "Asia/Kathmandu",
        "offset": "+05:45"
    }


@app.post("/api/ai/chat")
async def ai_chat(req: AIRequest):
    """AI terminal chat powered by Groq."""
    if not groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    now = ktm_now()
    system = (
        f"You are a task management assistant in a terminal. "
        f"Current time in Kathmandu: {now.strftime('%A, %B %d %Y %I:%M %p')} (NPT, UTC+5:45). "
        f"Plain text only. No markdown. Be concise and practical."
    )

    messages = []
    if req.tasks:
        messages.append({
            "role": "user",
            "content": f"Current tasks:\n{req.tasks}"
        })
        messages.append({
            "role": "assistant",
            "content": "Understood. I have the task list."
        })

    messages.append({"role": "user", "content": req.prompt})

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system}] + messages,
        max_tokens=600,
        temperature=0.7,
    )

    return {"response": response.choices[0].message.content}


@app.post("/api/ai/parse")
async def ai_parse(req: ParseRequest):
    """Parse natural language task input into structured fields using Groq."""
    if not groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

    now = ktm_now()
    system = (
        f"You parse natural language task descriptions into structured JSON. "
        f"Current time in Kathmandu: {now.strftime('%A, %B %d %Y %I:%M %p')} (NPT, UTC+5:45). "
        f"Return ONLY valid JSON, no markdown, no explanation. "
        f"Schema: {{\"task\": string, \"duration\": string, \"time\": string, \"notes\": string}}. "
        f"- task: the core task name only (no time/duration info). "
        f"- duration: estimated time to complete (e.g. '30m', '1h', '2h 30m'). Empty string if not mentioned. "
        f"- time: specific deadline/time as 'MMM D, YYYY, H:MM AM/PM' in Kathmandu time. Empty string if not mentioned. "
        f"- notes: any extra context. Empty string if none. "
        f"Examples: "
        f"Input: 'dentist appointment at 3pm tomorrow for 1 hour' "
        f"Output: {{\"task\": \"Dentist appointment\", \"duration\": \"1h\", \"time\": \"{(now).strftime('%b')} {now.day + 1}, {now.year}, 3:00 PM\", \"notes\": \"\"}} "
        f"Input: 'review report' "
        f"Output: {{\"task\": \"Review report\", \"duration\": \"\", \"time\": \"\", \"notes\": \"\"}}"
    )

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": req.text}
        ],
        max_tokens=200,
        temperature=0.1,
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown fences if present
    raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(raw)
        return parsed
    except Exception:
        return {"task": req.text, "duration": "", "time": "", "notes": ""}


# ── Task File Management ──────────────────────────────────────────────────────

TASKS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "tasks.json")

def load_tasks() -> List[dict]:
    """Load tasks from the JSON file."""
    try:
        if os.path.exists(TASKS_FILE):
            with open(TASKS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        return []
    except Exception as e:
        print(f"Error loading tasks: {e}")
        return []

def save_tasks(tasks: List[dict]) -> bool:
    """Save tasks to the JSON file."""
    try:
        with open(TASKS_FILE, "w", encoding="utf-8") as f:
            json.dump(tasks, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving tasks: {e}")
        return False

@app.get("/api/tasks")
def get_tasks():
    """Return all tasks from the JSON file."""
    tasks = load_tasks()
    return {"tasks": tasks}

@app.post("/api/tasks")
def update_tasks(data: TaskList):
    """Save the updated task list to the JSON file."""
    tasks_data = [task.dict() for task in data.tasks]
    if save_tasks(tasks_data):
        return {"status": "success", "tasks": tasks_data}
    else:
        raise HTTPException(status_code=500, detail="Failed to save tasks")


# Serve frontend
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
