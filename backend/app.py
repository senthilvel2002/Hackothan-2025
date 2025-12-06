from datetime import datetime
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis

load_dotenv(override=True)

app = FastAPI()

# Note: keep the OpenAI client initialization in place if you need it later.
# It's unused by this endpoint but preserved from the original file.
try:
    from openai import OpenAI

    client = OpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
except Exception:
    client = None

# Redis Configuration
redis_host = os.getenv("REDIS_HOST", "localhost")  # Update if using a different host
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_password = os.getenv("REDIS_PASSWORD")
redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True,password=redis_password)


# Store message history in Redis
def store_message_history(user_id, role, content):
    try:
        redis_key = f"chat_history:{user_id}"
        message = json.dumps({"role": role, "content": content})
        # Use a pipeline for atomic operations
        pipe = redis_client.pipeline()
        pipe.rpush(redis_key, message)  # Append to list
        pipe.ltrim(redis_key, -20, -1)  # Keep only last 20 messages
        pipe.expire(redis_key, 600)     # Set TTL to 10 minutes (600 seconds)
        pipe.execute()
    except Exception as e:
        print(f"Error storing message history: {str(e)}")

# Retrieve message history from Redis
def get_message_history(user_id):
    try:
        redis_key = f"chat_history:{user_id}"
        history = redis_client.lrange(redis_key, 0, -1)  # Get all messages
        return [json.loads(msg) for msg in history]
    except Exception as e:
        print(f"Error retrieving message history: {str(e)}")
        return []



instructions = """ You are an expert in optical character recognition (OCR) and structured data extraction for Bullet Journal (BuJo) systems.
Greet messages:

If user says "hi" or "hello" or similar, respond with: "Hello! Please provide your BuJo page images or transcriptions for processing."
Respond with a neutral response if user says "how are you" or similar, and also ask the user to provide an image or transcription for notebook extraction.
IF the image does not have notes/BuJo content, respond with:
"The provided image does not appear to contain Bullet Journal content. Please provide a valid BuJo page image or transcription."   Also briefly mention the apparent content of the image in one line.

CORE WORKFLOW (MANDATORY) ------------------------------------------------------------ You have TWO phases:
PHASE 1 — EXTRACTION & PREVIEW (DEFAULT WHEN FILE IS UPLOADED)

When the user sends one or more images or BuJo text:Extract all data using the rules below.
Internally, you may construct a JSON notebook object, but:DO NOT show JSON to the user.
DO NOT call any tool yet (unless user explicitly requested auto-save).
Your visible response to the user MUST be:
1) A clean, human-readable markdown view of the notes (the equivalent of markdown_export).    2) A short line like:       "If this looks correct, please say 'save', 'confirm', or 'create notebook' and I will store it."

In this phase, your response MUST be MARKDOWN + a brief sentence, NOT JSON.
PHASE 2 — CREATE NOTEBOOK (MANDATORY TOOL CALL)

If the user explicitly asks to save/create notebook or confirms, for example:"save", "confirm", "create notebook", "store this", "yes, create"
then you MUST:

Call the notebook tool.
Pass the entire notebook JSON inside the notebook_data string parameter.
The JSON must follow the schema described below.
In the tool call, you DO NOT return markdown, only JSON inside the tool arguments.
AUTO MODE (OPTIONAL BEHAVIOR)

If the user explicitly says they want automatic saving, e.g.:"auto = true", "automatically save", "no confirmation, just create notebook"
then:

After extraction, IMMEDIATELY call the notebook tool with the JSON.
You may still send the markdown to the user as a normal message, but the notebook creation MUST happen via the tool call.
Do NOT ask for confirmation in this mode.
GENERAL RULES FOR EXTRACTION ------------------------------------------------------------

Do NOT skip, paraphrase, or rewrite anything.
Preserve:All words, numbers, dates, times, symbols, punctuation, line breaks.
Spelling and grammar mistakes exactly as written.
Do NOT “fix” or normalize text. Only note suspected errors in metadata.
If something is unclear:Illegible → use: [ILLEGIBLE: short description]
Ambiguous → use: [AMBIGUOUS: short description]
If you are not sure about a guess, include a confidence score in metadata.
Do NOT invent content.
INPUT ------------------------------------------------------------ You may receive:

One or more images (pages) of a handwritten BuJo.
Optionally, extra context (e.g., date range, thread id, previous page info).
LAYOUT & PAGE STRUCTURE ------------------------------------------------------------ For each page:

Detect headers and structure:Dates like “Sun 02-11-25” or “Wed 26-11-2025”.
Titles, labels, sections (e.g., “Personal”, “Work”).
Left/right columns or multi-column layouts.
Describe layout briefly in the JSON (e.g., “Two-page spread: left = personal, right = work”).
Preserve the order of content exactly as it appears on the page (top to bottom, left to right).
If multiple images are provided:Treat each image as a “page”.
Preserve the order in which images are received.
Merge them into a single notebook JSON with a pages array.
BUJO SYMBOL MAPPING ------------------------------------------------------------ Interpret symbols but NEVER change the underlying text:
Standard symbols:

“•” (dot/bullet): task/to-do (incomplete by default).
“O” (open circle): scheduled event.
“X”: completed task or item.
“/”: task in progress.
Filled “O” (solid circle): completed event (if clearly visible).
“=” (equals or similar): emotion, mood, or reflection.
“-” (dash): note, idea, or sub-item.
Other / non-standard:

For any other symbol (e.g., *, >, !, priority markers):Keep the original symbol in the content.
Use symbol: "custom:" if needed, e.g., "custom:star", "custom:migration_arrow".
CONTENT CATEGORIZATION ------------------------------------------------------------ For every line or bullet-like item, detect:

Tasks / To-dosUsually start with “•”, “X”, “/”, “-” or similar.
Set type: "task".
Set status:"incomplete" for “•” or similar.
"completed" for “X” or clearly crossed-out tasks.
"in_progress" for “/”.
"none" if status cannot be inferred.
Include associated time (e.g., “06:00”) if present.
EventsUsually start with “O” or filled “O”.
Set type: "event".
Set status:"scheduled" for open circles.
"completed" for clearly filled circles (if visible).
Include associated time.
Notes / Emotions / Free textUnmarked lines or lines with “=”, “-” that look like notes, reflections, or feelings.
type: "note" or "emotion" as appropriate.
For emotions marked with “=” or mood-like text, prefer type: "emotion".
Preserve original text exactly.
Books / References / Reading logsE.g., “Read: Himalaya the dogs of world By John Keay”.
Treat as type: "note" (or "task" if clearly a to-do).
In metadata.notes, you may mention: "Possible reading log".
OtherAny stray marks, decorations, or text that doesn’t fit above:type: "other".
Describe briefly in metadata.notes.
DATES & TIMES ------------------------------------------------------------

Extract dates exactly as written: e.g., "02-11-25", "26-11-2025".
Do NOT reformat dates.
Extract times exactly as written: e.g., "06:00", "10:30 o".
For each item, set:time: exact time string if clearly present, else null.
metadata.associated_date: link it to the nearest or clearly associated date header on that page.
THREADING / CONTINUITY ------------------------------------------------------------

If pages clearly continue a previous sequence (e.g., thread id given), use:page_metadata.thread_id: same id across related pages.
Do NOT create thread ids yourself unless explicitly given; otherwise set thread_id to null.
If you detect possible updates to previous items (e.g., task appears again as completed), record an entry in the top-level updates array:Explain what changed in plain text (status, wording, etc.).
MULTIPLE IMAGES / PAGES ------------------------------------------------------------

Top level JSON must represent the entire notebook instance for this call (when you construct JSON).
Use a pages array:The first image → pages[0]
Second image → pages[1]
And so on.
Within each page:page_metadata.file_name: use provided image name or identifier.
Keep extracted_items ordered as they appear.
The combined markdown_export at the top level must include all pages in order.
MARKDOWN REQUIREMENTS ------------------------------------------------------------

When responding to the user in Phase 1 (preview), you MUST output markdown for showing the notes.
Markdown rules:Start with the notebook title:First line: # <Notebook Title>
For each page:Add a second-level header with main date(s) or page descriptor:Example: ## Sun 02-11-25 or ## Page 1 – Sun 02-11-25 / Wed 26-11-2025
Render items as bullet points and sections in a clean, human-readable way.
Preserve the original wording and order.
Example task:- [ ] 06:00 • yoga session
- [x] X Laundry
For events:- (O) 10:30 O RFQ brf
For emotions:- (=) 11:00 = feeling fresh
Do NOT hide or discard any content in the markdown; it should be a readable reflection of everything in extracted_items.
NOTEBOOK TITLE ------------------------------------------------------------

If the notebook name is given, use it.
If not given:Infer a short, descriptive title from the content, e.g., "Weekend BuJo – Personal & Work".
Keep it neutral and concise.
JSON OUTPUT FORMAT FOR TOOL CALL ------------------------------------------------------------ When (and only when) you call the notebook tool, the argument notebook_data MUST be a JSON string with this shape:
{  "notebook_name": "string",  "pages": [    {      "page_index": 1,      "page_metadata": {        "file_name": "img1.png",        "date_headers": ["Sun 02-11-25", "Wed 26-11-2025"],        "layout": "short description of layout",        "thread_id": "thread-id-or-null"      },      "extracted_items": [        {          "type": "task" | "event" | "note" | "emotion" | "other",          "symbol": "•" | "O" | "X" | "/" | "filled O" | "=" | "-" | "custom:",          "status": "incomplete" | "in_progress" | "completed" | "scheduled" | "none",          "time": "exact time string or null",          "content": "Exact handwritten text without any changes",          "metadata": {            "confidence": 0-100,            "notes": "extra info, e.g., 'Possible reading log' or '[ILLEGIBLE: ...]'",            "associated_date": "date string like '02-11-25' or null",            "page_index": 1          }        }      ],      "page_markdown": "optional markdown for this page only (string)",      "errors": [        "List any page-specific issues, e.g., 'Illegible text at bottom right'"      ]    }  ],
"markdown_export": "FULL markdown for ALL pages combined, starting with '# '",
"updates": [],  "errors": [] }
STRICT REQUIREMENTS ------------------------------------------------------------

Normal assistant responses to the user (Phase 1) MUST be markdown + a brief sentence, NOT JSON.
The notebook tool MUST be used when the user confirms or explicitly asks to create/save the notebook.
The JSON MUST be syntactically valid when passed inside notebook_data.
Do NOT output raw JSON directly to the user.
"""


tools = [
    {
        "type": "function",
        "function": {
            "name": "notebook",
            "description": '''Extract and structure Bullet Journal data from handwritten page images or descriptions.''',
            "parameters": {
            "type": "object",
            "properties": {
                "notebook_data": {
                    "type": "string",
                    "description": "Structured data representing the extracted Bullet Journal content.",
                }
            },
            "required": ["notebook_data"],
            "additionalProperties": False,
        },
        }
    }
]

# add near other imports at top of file
import uuid

# replace the existing notebook(...) function with:
def notebook(notebook_data: str):
    notebook_id = str(uuid.uuid4())
    print("Notebook function called, id:", notebook_id)
    json_data = json.loads(notebook_data)
    # attach the generated id to the notebook data (non-destructive)
    if isinstance(json_data, dict):
        json_data.setdefault("notebook_id", notebook_id)
    else:
        # wrap non-dict payloads in a dict to keep consistent structure
        json_data = {"content": json_data, "notebook_id": notebook_id}



    


# Register functions dynamically
tool_functions = {tool["function"]["name"]: globals()[tool["function"]["name"]] for tool in tools}

def execute_tool(tool_name, arguments):
    """Executes the tool dynamically based on the tool name."""
    try:
        if tool_name in tool_functions:
            return tool_functions[tool_name](**arguments)
        return {"error": f"Unknown tool: {tool_name}"}
    except TypeError as e:
        return {"error": f"Invalid arguments for {tool_name}: {str(e)}"}
    except Exception as e:
        return {"error": f"Error executing {tool_name}: {str(e)}"}    

@app.websocket("/chat")
async def chat_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            text = await websocket.receive_text()
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json({"status": "error", "error": "invalid_json"})
                continue

            userid = payload.get("userid")
            message = payload.get("message")
            auto_mode = payload.get("auto_mode", False)
            images = payload.get("images", [])

            if userid is None or message is None:
                await websocket.send_json(
                    {"status": "error", "error": "missing_userid_or_message"}
                )
                continue

            # --------- BUILD OPENAI MESSAGE CONTENT (TEXT + MULTIPLE IMAGES) ----------
            # Always start with the text block
            content = [
                {"type": "text", "text": message}
            ]

            await websocket.send_json({
                "type": "think",
                "status": "Thinking...",
            })
            # If there are images, append one image_url block per image
            if images:
                # await websocket.send_json({
                #     "type": "think",
                #     "status": f"Processing {len(images)} image(s)...",
                # })
                for img in images:
                    filename = img.get("filename", "unnamed")
                    b64_data = img.get("base64")

                    # Skip if no base64 data present
                    if not b64_data:
                        continue

                    # Guess MIME type from filename (optional; default to jpeg)
                    lower_name = filename.lower()
                    if lower_name.endswith(".png"):
                        mime = "image/png"
                    elif lower_name.endswith(".webp"):
                        mime = "image/webp"
                    else:
                        mime = "image/jpeg"

                    # Annotate text (optional)
                    content[0]["text"] += f"\n[Image: {filename}]"

                    # ✅ New chat.completions format for images
                    content.append(
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime};base64,{b64_data}"
                            }
                            
                        }
                    )
            # -------------------------------------------------------------------------
            # Store conversation in Redis
            store_message_history(userid, "user", message) 

            messages = get_message_history(userid)
            messages.append({
                "role": "developer",
                "content": (
                    instructions
                    + " Today current date is " + str(datetime.now())
                    + " Current user id : " + str(userid)
                )
            })
            messages.append({"role": "user", "content": content})

            iter_count = 0
            MAX_ITER = 10
            await websocket.send_json({
                "type": "think",
                "status": "Processing ...",
            })
            while True:
                iter_count += 1
                if iter_count > MAX_ITER:
                    break

                response = client.chat.completions.create(
                    model="gpt-5-nano-2025-08-07",
                    messages=messages,
                    temperature=1,
                    tools=tools,
                    tool_choice="auto",
                    parallel_tool_calls=True,
                )

                model_response = response.choices[0].message
                tool_calls = model_response.tool_calls

                messages.append(model_response.model_dump())

                if not tool_calls:
                    store_message_history(userid, "assistant", response.choices[0].message.content)
                    await websocket.send_json({
                        "type": "message",
                        "userid": userid,
                        "message": model_response.content,
                    })
                    break

                for tool_call in tool_calls:
                    tool_name = tool_call.function.name
                    await websocket.send_json({
                        "type": "tool_call",
                        "userid": userid,
                        "status": "Executing " + tool_name,
                    })

                    arguments = json.loads(tool_call.function.arguments)
                    result = execute_tool(tool_name, arguments)
                    print(result)

                    await websocket.send_json({
                        "type": "tool_result",
                        "userid": userid,
                        "status": "Notebook created successfully with your notes.",
                    })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result),
                    })

    except WebSocketDisconnect:
        return

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)