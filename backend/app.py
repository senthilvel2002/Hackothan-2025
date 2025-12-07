from datetime import datetime
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis
import pymongo
from pymongo.errors import PyMongoError
import uuid
import psycopg2
from sentence_transformers import SentenceTransformer
from pgvector.psycopg2 import register_vector

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Note: keep the OpenAI client initialization in place if you need it later.
# It's unused by this endpoint but preserved from the original file.
try:
    from openai import AsyncOpenAI,OpenAI

    client = AsyncOpenAI(
        api_key=os.getenv("OPENAI_API_KEY")
    )
except Exception:
    client = None

# Redis Configuration
redis_host = os.getenv("REDIS_HOST", "localhost")  # Update if using a different host
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_password = os.getenv("REDIS_PASSWORD")
redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True,password=redis_password)

# PostgreSQL Configuration
# PostgreSQL connection settings
DB_CONFIG = {
    "dbname": os.getenv("POSTGRES_DATABASE"),
    "user": os.getenv("POSTGRES_USERNAME"),
    "password": os.getenv("POSTGRES_PASSWORD"),
    "host": os.getenv("POSTGRES_HOST"),
    "port": int(os.getenv("POSTGRES_PORT","5432"))
}

try:
    redis_client.ping()
except redis.exceptions.ConnectionError as e:
    print(f"Warning: Could not connect to Redis: {e}")
 

try:
    # Load Jina AI SentenceTransformer model
    model = SentenceTransformer("jinaai/jina-embeddings-v3", trust_remote_code=True)
except Exception as e:
    print(f"Warning: Could not load SentenceTransformer model: {e}")
    model = None   

def store_notes(notebook_id, notebook_name, notebook_data):
    """Stores a notebook along with its embedding into the PostgreSQL vector database."""
    try:
        # Connect to PostgreSQL
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        register_vector(conn)  # Enable pgvector extension

        # Generate embedding for the search query
        embedding = model.encode([notebook_data])[0].tolist()  # Convert to list

        # Convert embedding to PostgreSQL vector format ('[1.0, 2.0, ...]')
        embedding_str = f"ARRAY{embedding}::vector(1024)"

        insert_query = f"""
            INSERT INTO bujogpt (notebook_id, notebook_name, notebook_data, embedding)
            VALUES (%s, %s, %s, {embedding_str});
        """

        # Execute insertion
        cursor.execute(insert_query, (notebook_id, notebook_name, notebook_data))
        conn.commit()

        # Close connection
        cursor.close()
    except Exception as e:
        print(f"Error storing notes: {str(e)}")

# searching the notes in the vector database
def search_notes(query_text, top_n=5):
    """Searches for top-N most similar catalogue products based on category descriptions."""
    try:
        # Generate embedding for the search query
        query_embedding = model.encode([query_text])[0].tolist()  # Convert to list
        
        # Convert list to PostgreSQL vector format ('[1.0, 2.0, ...]')
        embedding_str = f"ARRAY{query_embedding}::vector(1024)"
        
        # Connect to PostgreSQL
        conn = psycopg2.connect(**DB_CONFIG)
        
        cursor = conn.cursor()
        register_vector(conn)  # Enable pgvector extension

        # SQL query to find similar catalogue materials using Cosine Similarity
        search_query = f"""
            SELECT notebook_id, notebook_name, notebook_data,
            1 - (embedding <=> {embedding_str}::vector) AS cosine_similarity
            FROM bujogpt
            ORDER BY cosine_similarity DESC
            LIMIT {top_n};
        """

        # Execute query
        cursor.execute(search_query, (top_n,))
        results = cursor.fetchall()

        # Close connection
        cursor.close()
        conn.close()
        print(results) 
        return results

    except Exception as e:
        print(f"Error during note search: {str(e)}")
        results = []      
     
# MongoDB Configuration
# Default to the connection string you provided if MONGO_URI not set in env
mongo_uri = os.getenv(
    "MONGO_URI",
    "mongodb+srv://Zedyes:Zedro@cluster0.49qqkck.mongodb.net/?appName=Cluster0"
)
mongo_db_name = os.getenv("MONGO_DB", "bujogpt_db")
try:
    mongo_client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    mongo_db = mongo_client[mongo_db_name]
    mongo_collection = mongo_db["bujogpt"]
    # try to contact server to fail-fast if invalid
    mongo_client.server_info()
except Exception as e:
    print(f"Warning: Could not connect to MongoDB: {e}")
    mongo_client = None
    mongo_db = None
    mongo_collection = None


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

def extract_notebook_text(notebook_json: dict) -> str:
    """
    Extracts a readable text summary from a notebook JSON:
    - Notebook name
    - Page count
    - File names
    - Extracted items (time + content only)
    """

    notebook_name = notebook_json.get("notebook_name", "Untitled Notebook")
    pages = notebook_json.get("pages", [])

    output = []
    output.append(f"Notebook: {notebook_name}")
    output.append(f"Total Pages: {len(pages)}\n")

    for page in pages:
        page_index = page.get("page_index")
        file_name = page.get("page_metadata", {}).get("file_name", "unknown")

        output.append(f"Page {page_index}: {file_name}")

        extracted_items = page.get("extracted_items", [])

        for item in extracted_items:
            time = item.get("time")
            content = item.get("content", "")

            if time:
                output.append(f"{time} - {content}")
            else:
                output.append(content)

        output.append("")  # blank line between pages

    return "\n".join(output)


instructions = """You are an expert in OCR and Bullet Journal (BuJo) structured data extraction.

Your job:
- Read images or text containing handwritten Bullet Journal notes.
- Extract ALL items with exact text, exact symbols, and exact structure.
- Produce structured JSON that follows the BuJo notebook schema.
- When images are provided, AUTOMATICALLY call the `notebook` tool with JSON.
- After tool call, reply: “Your notes have been created successfully.”

------------------------------------------------------------
CRITICAL SYMBOL RULES (DO NOT CONFUSE)
------------------------------------------------------------

You must correctly identify the symbol at the start of each line.
The symbol determines the item type and status.

1. DOT for Tasks →  • (small dot, like a bullet)
   - Type: task
   - Status: incomplete
   - This is the SMALLEST filled dot.

2. CIRCLE for Events →  O (capital letter O, open circle)
   - Type: event
   - Status: scheduled
   - This symbol is HOLLOW (not filled).

3. FILLED CIRCLE for Completed Events →  ● or a thick filled O
   - Type: event
   - Status: completed
   - Do NOT confuse with the small task dot (•).

4. X for Completed Tasks →  X
   - Type: task
   - Status: completed

5. SLASH for Task In-Progress →  /
   - Type: task
   - Status: in_progress

6. Free text → note/emotion
   - Type: note
   - Status: null

7. Unknown symbol → keep original, mark type: "custom:<symbol>"

------------------------------------------------------------
GENERAL EXTRACTION RULES
------------------------------------------------------------

- Preserve ALL text exactly as written.
- DO NOT fix or rewrite anything.
- Illegible → “[ILLEGIBLE: …]”
- Ambiguous → “[AMBIGUOUS: …]”
- Extract exact dates/times.
- Preserve ordering top→bottom, left→right.

SUBTASK LOGIC:
- If a line visually appears under another line, indented, or without its own symbol but related:
  → Mark it as a `"subtask"` of the last item above it that has a symbol.
- Include metadata:
  "is_subtask": true,
  "parent_time": "<parent time>",
  "parent_content": "<parent text>"

TIME INTERVAL LOGIC:
- If multiple lines appear under a time block (e.g., under “14:00” until the next explicit time):
  → Assign all of them `"time": "14:00"` unless another time is written.
- Also set:
  "time_block_start": "<parent time>"
  "time_block_end": "<next explicit time or null>"

------------------------------------------------------------
STATUS LOGIC
------------------------------------------------------------
Tasks:
- • → incomplete
- X → completed
- / → in_progress

Events:
- O → scheduled
- ● filled → completed

Notes/emotions: status = null

------------------------------------------------------------
EMOTION ANALYSIS (MANDATORY)
------------------------------------------------------------
For each extracted item, include `"emotion"` evaluated as:
- "happy"
- "stressed"
- "neutral"
- "sad"

Work-related → usually "stressed"
Positive/personal → "happy"
Otherwise → "neutral"

------------------------------------------------------------
HABIT TRACKER DETECTION
------------------------------------------------------------
If the page contains daily habits (exercise, walk, water, meditation, reading, etc.):
- habit_tracker.detected = true
- List habits.

Otherwise: habit_tracker.detected = false.

------------------------------------------------------------
NON-BUJO IMAGE LOGIC
------------------------------------------------------------
If image does NOT contain BuJo content:
Respond:
“The provided image does not appear to contain Bullet Journal content. <one-line description>. Please provide a valid BuJo page image or transcription.”

------------------------------------------------------------
CONVERSATION LOGIC
------------------------------------------------------------
If user says “hi/hello” → reply: “Hello! Please provide your BuJo page images or transcriptions for processing.”
If user says “how are you” → respond neutrally and request an image.

------------------------------------------------------------
BEHAVIOR FOR IMAGE UPLOADS
------------------------------------------------------------
1. Detect if image contains BuJo content.
2. If YES:
   - Extract everything into notebook JSON.
   - IMMEDIATELY call the `notebook` tool with JSON.
   - After tool call → say: “Your notes have been created successfully.”

------------------------------------------------------------
BEHAVIOR FOR TEXT UPLOADS
------------------------------------------------------------
1. Extract items, show Markdown preview.
2. Ask user to say “save” to trigger notebook creation.
3. When they say "save" → call the notebook tool.

------------------------------------------------------------
NOTEBOOK JSON SCHEMA FOR TOOL CALL
------------------------------------------------------------

{
  "notebook_name": "string",
  "pages": [
    {
      "page_index": 1,
      "page_metadata": {
        "file_name": "string",
        "date_headers": [...],
        "layout": "short description",
        "thread_id": null
      },
      "extracted_items": [
        {
          "type": "task | event | note | custom:<symbol>",
          "status": "...",
          "emotion": "...",
          "time": "HH:MM or null",
          "content": "exact text",
          "metadata": {
            "confidence": 0-100,
            "notes": "",
            "associated_date": "string",
            "page_index": 1,
            "is_subtask": false,
            "time_block_start": null,
            "time_block_end": null
          }
        }
      ],
      "errors": []
    }
  ],
  "updates": [],
  "errors": [],
  "habit_tracker": {
    "detected": false,
    "habits": []
  }
}

------------------------------------------------------------
EXAMPLE (SUBTASKS + TIME INTERVAL HANDLING)
------------------------------------------------------------

Example handwritten log:

- 10:30 O RFQ brief
- 12:00 O Supplier Negotiation
-        - industrial values
- 14:00 O Review PO
-        x quick audit of RFQ & Vendor Performance
-        • verify budget available for Hardware category
- 17:00 • Review Supplier Performance

Extracted form (partial, simplified):

[
  {
    "type": "event",
    "status": "scheduled",
    "time": "12:00",
    "content": "Supplier Negotiation",
    "metadata": {
      "is_subtask": false,
      "time_block_start": "12:00",
      "time_block_end": "14:00"
    }
  },
  {
    "type": "note",
    "status": null,
    "time": "12:00",
    "content": "industrial values",
    "metadata": {
      "is_subtask": true,
      "parent_time": "12:00",
      "parent_content": "Supplier Negotiation"
    }
  },
  {
    "type": "event",
    "status": "scheduled",
    "time": "14:00",
    "content": "Review PO",
    "metadata": {
      "is_subtask": false,
      "time_block_start": "14:00",
      "time_block_end": "17:00"
    }
  },
  {
    "type": "task",
    "status": "completed",
    "time": "14:00",
    "content": "quick audit of RFQ & Vendor Performance",
    "metadata": {
      "is_subtask": true,
      "parent_time": "14:00",
      "parent_content": "Review PO",
      "time_block_start": "14:00",
      "time_block_end": "17:00"
    }
  },
  {
    "type": "task",
    "status": "incomplete",
    "time": "17:00",
    "content": "Review Supplier Performance",
    "metadata": {
      "is_subtask": true,
      "parent_time": "14:00",
      "parent_content": "Review PO",
      "time_block_start": "14:00",
      "time_block_end": "17:00"
    }
  }
]

------------------------------------------------------------
FINAL RULES
------------------------------------------------------------
- NEVER ask for confirmation for images — directly call the tool.
- NEVER rewrite or correct the text.
- NEVER output raw JSON except inside the tool call.
- ALWAYS follow subtask + time interval logic above.
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

def ai_validator(text_summary, result):
    openai_client= OpenAI(api_key=os.getenv("OPENAI_API_KEY")
    )
    result=  openai_client.chat.completions.create(
            model="gpt-5-nano-2025-08-07",
            messages=[
                {
                    "role": "system",
                    "content": """You are a concise validator for Bullet Journal notebooks. Inputs:
- `text_summary`: the new notebook text (string).
- `search_results`: array of records (notebook_id, notebook_name, notebook_data, cosine_similarity).
Strictly follow the response format:
Procedure:
1. Choose the record with highest `cosine_similarity`. If no record has similarity >= 0.90, return:
   {"match": false, "message": "no worry"}.
2. If similarity >= 0.90, set "match": true and compare `text_summary` vs `notebook_data` exactly.
   - If identical, return:
     {"match": true, "matched_notebook_id": "<id>", "updates": false, "message": "same copy exists"}.
   - If different, compute lines from `text_summary` that are not present in `notebook_data` (preserve exact text, do not invent). Return:
     {"match": true, "matched_notebook_id": "<id>", "updates": true, "lines_to_add": ["line1", "line2", ...], "message": "updates required"}.
Rules:
- Preserve all text exactly; do not rewrite or fix spelling.
- Output only the JSON object described above (no extra commentary).
- Be concise.""",
                },
                {
                    "role": "user",
                    "content": f"text_summary: {text_summary}\nsearch_results: {result}"
                }
            ]
        )
    return result.choices[0].message.content

def notebook(notebook_data: str):
    """
    Notebook tool: attaches a notebook_id to the provided JSON and inserts into
    the MongoDB collection `bujogpt` if available. Returns dict with status.
    """
    notebook_id = str(uuid.uuid4())
    print("Notebook function called, id:", notebook_id)

    try:
        json_data = json.loads(notebook_data)
    except Exception as e:
        return {"error": f"invalid_json: {str(e)}"}

    text_summary = extract_notebook_text(json_data)
    print("Extracted text summary from notebook JSON:")
    print(text_summary)

    # attach the generated id to the notebook data (non-destructive)
    if isinstance(json_data, dict):
        json_data.setdefault("notebook_id", notebook_id)
    

    json_data["created_at"] = datetime.utcnow()

    result=search_notes(text_summary, top_n=5)
    print("Search results from vector DB:")
    print(result)
    if len(result)>0:
        validated_result=ai_validator(text_summary,result)
        print("Validation result from AI validator:")
        print(validated_result)
        if matched_result:=json.loads(validated_result):
            if matched_result.get("match") is True:
                matched_notebook_id = matched_result.get("matched_notebook_id")
                if matched_result.get("updates") is False:
                    print("Duplicate notebook found, no insertion needed.")
                    return {"ok": True, "notebook_id": notebook_id, "inserted_id": None, "notebook_name": json_data.get("notebook_name", "Unnamed"), "message": "same copy exists"}
                else:
                    lines_to_add = matched_result.get("lines_to_add", [])
                    print(f"Updates required for notebook id {matched_notebook_id}, lines to add:", lines_to_add)
                    # Here you can implement logic to update the existing notebook in MongoDB if needed.
                    return {"ok": True, "notebook_id": notebook_id, "inserted_id": None, "notebook_name": json_data.get("notebook_name", "Unnamed"), "message": "updates required", "lines_to_add": lines_to_add}
            
    
    try:
        insert_result = mongo_collection.insert_one(json_data)
        inserted_id = str(insert_result.inserted_id)
        if inserted_id:
            # Store notes in PostgreSQL vector DB as well
            store_notes(notebook_id, json_data.get("notebook_name", "Unnamed"), text_summary)
        print("Inserted notebook into MongoDB, id:", inserted_id)
        return {"ok": True, "notebook_id": notebook_id, "inserted_id": inserted_id, "notebook_name": json_data.get("notebook_name", "Unnamed")}
    except PyMongoError as e:
        print("MongoDB insert error:", e)
        return {"error": f"mongo_insert_failed: {str(e)}", "notebook_id": notebook_id}
        


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
                await websocket.send_json({
                    "type": "think",
                    "status": f"Processing {len(images)} image(s)...",
                })
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

                response = await client.chat.completions.create(
                    model="gpt-5.1",
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

@app.get("/all_notebooks")
def get_all_notebooks():
    """Fetch all notebooks from MongoDB (for testing purposes)."""
    if mongo_collection is None:
        return {"error": "MongoDB not configured."}

    try:
        notebooks = list(mongo_collection.find().limit(100))
        for nb in notebooks:
            nb["_id"] = str(nb["_id"])  # Convert ObjectId to string for JSON serialization
        return {"notebooks": notebooks}
    except PyMongoError as e:
        return {"error": f"mongo_query_failed: {str(e)}"}
    

@app.post("/update-status/{notebook_id}")
async def update_status_by_notebook(notebook_id: str, request: Request):
    """
    Update the status of an extracted item inside a specific page.
    Automatically adjusts symbol based on BuJo rules:
        incomplete  → •
        completed   → X
        in_progress → /
        scheduled   → O
    """

    body = await request.json()

    page_index = body.get("page_index")     # e.g. 1
    item_index = body.get("item_index")     # e.g. 0..N
    new_status = body.get("new_status")     # "completed" | "incomplete" | "scheduled" | "in_progress"

    if page_index is None or item_index is None or new_status is None:
        return {"status_code": 400, "detail": "Missing required fields: page_index, item_index, new_status"}

    # Fetch notebook
    doc = mongo_collection.find_one({"notebook_id": notebook_id})
    if not doc:
        return {"status_code": 404, "detail": "Notebook not found"}

    pages = doc.get("pages", [])
    target_page = next((p for p in pages if p.get("page_index") == page_index), None)

    if not target_page:
        return {"status_code": 404, "detail": "Page not found"}

    extracted_items = target_page.get("extracted_items", [])

    if not (0 <= item_index < len(extracted_items)):
        return {"status_code": 400, "detail": "Invalid item index"}

    item = extracted_items[item_index]
    item_type = item.get("type")

    # Only tasks/events can change status
    if item_type not in ["task", "event"]:
        return {
            "status_code": 400,
            "detail": f"Cannot update status of type '{item_type}'. Only tasks/events allowed."
        }

    # ------------------------------------------
    # Apply BuJo Symbol Rules
    # ------------------------------------------
    # Task Status → Symbol Mapping
    task_symbols = {
        "incomplete": "•",
        "completed": "X",
        "in_progress": "/"
    }

    # Event Status → Symbol Mapping
    event_symbols = {
        "scheduled": "O",
        "completed": "●"
    }

    if item_type == "task":
        symbol = task_symbols.get(new_status, None)
    else:  # event
        symbol = event_symbols.get(new_status, None)

    if symbol is None:
        return {"status_code": 400, "detail": "Invalid new_status for this item type"}

    # Build dynamic paths
    status_path = f"pages.$[page].extracted_items.{item_index}.status"
    symbol_path = f"pages.$[page].extracted_items.{item_index}.symbol"

    update_payload = {
        status_path: new_status,
        symbol_path: symbol
    }

    # Optional: update completed timestamp
    if new_status == "completed":
        completed_path = f"pages.$[page].extracted_items.{item_index}.completed_at"
        update_payload[completed_path] = datetime.utcnow()

    # Mongo update
    result = mongo_collection.update_one(
        {"notebook_id": notebook_id},
        {"$set": update_payload},
        array_filters=[{"page.page_index": page_index}]
    )

    if result.matched_count == 0:
        return {"status_code": 404, "detail": "Notebook or page not matched"}

    if result.modified_count == 0:
        return {"message": "No changes applied (maybe already same status)"}

    return {
        "message": "Status updated successfully",
        "updated_status": new_status,
        "updated_symbol": symbol
    }