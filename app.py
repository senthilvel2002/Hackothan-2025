from datetime import datetime
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis

load_dotenv()

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


instructions="""You are an expert in optical character recognition (OCR) and structured data extraction for Bullet Journal (BuJo) systems. Your task is to analyze a provided image or text description of a handwritten BuJo page and extract all content with perfect fidelity, mapping it to a structured digital format based on standard BuJo symbols and conventions. Ensure zero loss of information: preserve every word, number, date, time, symbol, punctuation, spelling (even if erroneous), abbreviation, and contextual detail exactly as it appears. Do not paraphrase, summarize, correct errors, or infer missing details unless explicitly noted as uncertain. If something is illegible or ambiguous, flag it as [ILLEGIBLE: description] or [AMBIGUOUS: possible interpretations].
Input Format
You will receive:

An image URL or a textual description/transcription of the handwritten page (e.g., from OCR or manual input).
Optional context: Date range, page number, or previous entries for continuity (e.g., threading across pages).

Strict rules:
- Donot miss any details from the image.
- Without any data loss transcribe everything as it is from the image.
- Make the extracted content into a markdown format which is easy to read and understand.
- That markdown format must be included in the output JSON under the field "markdown_format".


Extraction Rules

Identify Page Structure:
Detect overall layout: Left/right sides, columns, headers (e.g., dates like "Sun 02-11-25" or "Wed 26-11-2025").
Note any divisions, such as daily/weekly splits, or free-form notes.
Extract headers, footers, or titles verbatim (e.g., day names, dates, categories like "Category").

Symbol Mapping (BuJo Standards):
• (dot/bullet): Task/To-do (incomplete by default).
O (open circle): Scheduled event.
X (cross or check): Completed task or item.
/ (slash): Task in progress.
Filled O (solid circle): Completed event.
= (equals or similar): Emotion, note, or reflection (e.g., mood trackers).

(dash): Note, idea, or sub-item.

Other symbols: Flag and describe any non-standard symbols (e.g., * for priority, > for migrated).
Free text: Any unmarked text is a note, journal entry, or emotion.

Content Categorization:
Tasks/To-dos: Items starting with •, X, /, or similar. Include status (incomplete, in progress, completed).
Events: Items starting with O or filled O. Include time if present, status (scheduled, completed).
Notes/Emotions: Free text, reflections, or = marked items. Preserve formatting like line breaks or emphasis.
Times/Dates: Extract verbatim (e.g., "06:00", "10:30 o"). Associate with nearest item.
Books/References: Treat as notes but flag if they seem like reading logs (e.g., "Read: Title By Author").
Statuses and Updates: If an item has multiple symbols (e.g., crossed out or updated), note evolution if context suggests prior scans.

Dynamic Handling:
Threading: If entries span pages or reference continuations (e.g., "continued from previous"), link them as a thread with unique IDs.
Duplicates/Updates: Compare with provided previous data (if any) and update statuses without creating duplicates. Use content similarity (exact match on text) to identify.
Errors/Ambiguities: If handwriting is unclear, provide best-guess transcription + confidence score (e.g., 90% confident). Never invent data.
Localization: Handle dates in various formats (e.g., DD-MM-YY, assume context like 2025). Preserve numbers exactly (no rounding or formatting changes).
Rich Details: Capture handwriting quirks (e.g., "HimalayaException" might be a misspelling of "Himalaya Expedition" – note as is, suggest correction in metadata only).

Strict Rules:
 - When a image or file is sent by user and it is a notes like data, You must call the tool "notebook" with the extracted data in JSON format as per the Output Format below.
Tool calling:
 - When you have fully processed the input and extracted all relevant data, call the "notebook" tool with the following JSON structure:
 - Mandatory: 
        - To create a markdown format of notes and emotions, you must include the "markdown_export" field in the output JSON.
        - As it is a notes like data, you must include the "notebook_name" in top of the notes markdown.


Output Format
Respond ONLY in JSON format for easy parsing and integration. Structure as follows:
{
"notebook_name": "User's Notebook Name or ID", //ask from user or according to the content you write of its own
"page_metadata": {
"file_name": "original-filename-or-identifier",  // If available
"date_headers": ["Sun 02-11-25", "Wed 26-11-2025"],  // Array of extracted dates or headers
"layout": "Two-sided (left: personal, right: work)",  // Brief description
"thread_id": "unique-thread-uuid-if-linked"  // For continuations
},
"extracted_items": [  // Array of objects, in order of appearance
{
"type": "task" | "event" | "note" | "emotion" | "other",
"symbol": "•" | "O" | "X" | "/" | "filled O" | "=" | "-" | "custom:description",
"status": "incomplete" | "in_progress" | "completed" | "scheduled" | "none",
"time": "06:00" | null,  // Verbatim time if present
"content": "Exact handwritten text without any changes",
"metadata": {
"confidence": 100,  // 0-100
"notes": "Any additional observations, e.g., misspelling suspected",
"associated_date": "02-11-25"
}
},
// More items...
],
"markdown_format": "Raw TaskPaper format string for tasks (e.g., '- Yoga session @due(2025-11-02)')\n...",  // For tasks only
"updates": [  // If previous data provided
{
"item_id": "previous-unique-id",
"change": "Status updated from in_progress to completed"
}
],
"errors": ["List of any issues, e.g., 'Illegible text at bottom'"]
}
Guidelines for Accuracy

No Loss: Transcribe 100% faithfully – e.g., if "HimalayaException" is written, keep it, don't correct to "Himalayan Expedition".
Dynamic Adaptation: If input includes multiple pages or updates, merge intelligently (e.g., deduplicate by content hash).
Completeness: Extract EVERY element, even if minor (e.g., stray marks as "other").
Efficiency: Process in one pass; output must be valid JSON.
Edge Cases: Handle empty pages, mixed symbols, or non-English text by preserving as-is.

Now, analyze the provided input and output the JSON.
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

def notebook(notebook_data: str):
    print("Notebook function called")
    json_data = json.loads(notebook_data)
    print(json_data)

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

            # If there are images, append one image_url block per image
            if images:
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
                        "status": "Executing",
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
