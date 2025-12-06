import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

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

instructions="""You are an expert in optical character recognition (OCR) and structured data extraction for Bullet Journal (BuJo) systems. Your task is to analyze a provided image or text description of a handwritten BuJo page and extract all content with perfect fidelity, mapping it to a structured digital format based on standard BuJo symbols and conventions. Ensure zero loss of information: preserve every word, number, date, time, symbol, punctuation, spelling (even if erroneous), abbreviation, and contextual detail exactly as it appears. Do not paraphrase, summarize, correct errors, or infer missing details unless explicitly noted as uncertain. If something is illegible or ambiguous, flag it as [ILLEGIBLE: description] or [AMBIGUOUS: possible interpretations].
Input Format
You will receive:

An image URL or a textual description/transcription of the handwritten page (e.g., from OCR or manual input).
Optional context: Date range, page number, or previous entries for continuity (e.g., threading across pages).

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
"taskpaper_export": "Raw TaskPaper format string for tasks (e.g., '- Yoga session @due(2025-11-02)')\n...",  // For tasks only
"markdown_export": "# Notes and Emotions\n\n- Feeling fresh\n...",  // For notes/emotions
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
        "name": "notebook",
        "description": "Extract and structure Bullet Journal data from handwritten page images or descriptions.",
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
        "strict": True,
    },
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
    """
    WebSocket endpoint that expects JSON messages of the form:
    {
      "userid": "<string or int>",
      "message": "<string>",
      "images": [
        {"filename": "name.png", "base64": "<base64 string>"},
        ...
      ]
    }

    The handler performs lightweight validation and sends back a JSON ack:
    {
      "status": "received",
      "userid": ...,
      "message": ...,
      "images_received": <n>
    }
    """
    await websocket.accept()
    try:
        while True:
            # receive text frames (expecting JSON)
            text = await websocket.receive_text()
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json({"status": "error", "error": "invalid_json"})
                continue

            userid = payload.get("userid")
            message = payload.get("message")
            images = payload.get("images", [])

            # Basic validation
            if userid is None or message is None:
                await websocket.send_json({"status": "error", "error": "missing_userid_or_message"})
                continue
            
            content = [
                        { "type": "input_text", "text": message },
                    ]
            # Validate images
            if images is not None :
                for img in images:
                    content[0]["text"] += f"\n[Image: {img.get('filename', 'unnamed')}]"
                    content.append(
                        {
                            "type": "input_image",
                            "image_url": f"data:image/jpeg;base64,{img['base64']}",
                            "detail": "high"
                        }
                    )

            
            response = client.responses.create(
                    model="gpt-4o",
                    instructions=instructions,
                    input=[
                        {
                            "role": "user",
                            "content": content
                        }
                    ],
                    tools=tools,
                    stream=True,
                )
            for event in response:
                # best-effort extraction of event type / payload
                evt_type = getattr(event, "type", None) or (event.get("type") if isinstance(event, dict) else None)
                # item metadata can indicate 'reasoning' kinds
                item = getattr(event, "item", None) or (event.get("item") if isinstance(event, dict) else None)
                # delta text (for text streaming)
                delta = getattr(event, "delta", None) or (event.get("delta") if isinstance(event, dict) else None)
                # some SDKs put text in .text or .output_text
                if delta is None:
                    delta = getattr(event, "text", None) or (event.get("text") if isinstance(event, dict) else None)
                    if delta is None:
                        delta = getattr(event, "output_text", None) or (event.get("output_text") if isinstance(event, dict) else None)

                # Map events -> statuses
                # 1) If a reasoning item appears, indicate thinking
                item_type = None
                if item:
                    try:
                        item_type = getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else None)
                    except Exception:
                        item_type = None

                if evt_type in ("response.created",):
                    last_status = "searching"
                    await websocket.send_json({"type": "status", "status": last_status})
                    continue

                if evt_type in ("response.in_progress",):
                    # still searching (may be retrieving tools, etc.)
                    last_status = "searching"
                    await websocket.send_json({"type": "status", "status": last_status})
                    continue

                if item_type == "reasoning":
                    # Start of reasoning - indicate thinking
                    if last_status != "thinking":
                        last_status = "thinking"
                        await websocket.send_json({"type": "status", "status": last_status})
                    # continue, reasoning may not contain text deltas
                    continue
                
                if event.type == "response.function_call_arguments.done":
                    print(event)
                    print(f"Tool Name: {event.name}")
                    print(f"Tool Arguments: {event.arguments}")
                    # Call the tool function here
                    result = event.name(**json.loads(event.arguments))
                    print(f"Tool Result: {result}")
                    continue

                if event.type == "response.output_text.delta":
                    await websocket.send_json({
                        "type": "stream",
                        "userid": userid,
                        "message_delta": event.delta,
                    })
                    continue

                if evt_type in ("response.output_text.done",):
                    print(event)
                    # completed
                    # Simple acknowledgement — you can expand this to call other services
                    await websocket.send_json({
                        "type": "done", 
                    })
                    break
            

    except WebSocketDisconnect:
        # Client disconnected — nothing else required for this minimal endpoint
        return