from datetime import datetime
import os
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import redis
import pymongo
from pymongo.errors import PyMongoError
import uuid
import psycopg2
from psycopg2.extras import Json

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
    from openai import AsyncOpenAI

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


# PostgreSQL Configuration
postgres_host = os.getenv("POSTGRES_HOST", "localhost")
postgres_port = int(os.getenv("POSTGRES_PORT", 5432))
postgres_db = os.getenv("POSTGRES_DB", "bujogpt_db")
postgres_user = os.getenv("POSTGRES_USER", "postgres")
postgres_password = os.getenv("POSTGRES_PASSWORD", "")

DB_CONFIG = {
    "host": postgres_host,
    "port": postgres_port,
    "database": postgres_db,
    "user": postgres_user,
    "password": postgres_password
}


def register_vector(conn):
    """Register pgvector extension if available."""
    try:
        cursor = conn.cursor()
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"Warning: Could not register vector extension: {e}")


def log_error(user_id, function_name, error_message, timestamp):
    """Log errors to console or external service."""
    print(f"[ERROR] {timestamp} | User: {user_id} | Function: {function_name} | Error: {error_message}")


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


def insert_notebook_to_postgres(notebook_id, notebook_name, notebook_data, embedding):
    """
    Inserts or updates a notebook into PostgreSQL table 'bujogpt'.

    - If table does NOT exist → create it.
    - If notebook_id exists → update it.
    - Otherwise → insert new record.
    """
    conn = None
    cursor = None

    try:
        if not notebook_id or not notebook_name:
            raise ValueError("notebook_id and notebook_name are required")

        if embedding is None or len(embedding) == 0:
            raise ValueError("embedding must be a non-empty list/vector")

        embedding_dim = len(embedding)

        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        register_vector(conn)

        # Check if table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'bujogpt'
            );
        """)
        table_exists = cursor.fetchone()[0]

        # Create table only if not exists
        if not table_exists:
            create_table_sql = f"""
                CREATE TABLE bujogpt (
                    notebook_id   TEXT PRIMARY KEY,
                    notebook_name TEXT NOT NULL,
                    notebook_data JSONB NOT NULL,
                    embedding     VECTOR(1024)
                );
            """
            cursor.execute(create_table_sql)

        # Check if notebook_id already exists
        cursor.execute("SELECT notebook_id FROM bujogpt WHERE notebook_id = %s;", (notebook_id,))
        exists = cursor.fetchone()

        if exists:
            # UPDATE
            update_sql = """
                UPDATE bujogpt
                SET notebook_name = %s,
                    notebook_data = %s,
                    embedding     = %s
                WHERE notebook_id = %s;
            """
            cursor.execute(update_sql, (
                notebook_name,
                Json(notebook_data),
                embedding,
                notebook_id
            ))
            action = "updated"
        else:
            # INSERT
            insert_sql = """
                INSERT INTO bujogpt (notebook_id, notebook_name, notebook_data, embedding)
                VALUES (%s, %s, %s, %s);
            """
            cursor.execute(insert_sql, (
                notebook_id,
                notebook_name,
                Json(notebook_data),
                embedding
            ))
            action = "inserted"

        conn.commit()

        return {
            "status": True,
            "statusCode": 200,
            "message": f"Notebook successfully {action}.",
            "notebook_id": notebook_id
        }

    except Exception as e:
        try:
            log_error("system", "insert_notebook_to_postgres", str(e), datetime.now())
        except Exception:
            pass

        if conn:
            conn.rollback()

        return {
            "status": False,
            "statusCode": 500,
            "error": f"Error inserting/updating notebook: {str(e)}"
        }

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


instructions = """
You are an expert in OCR and Bullet Journal (BuJo) structured data extraction.

GREETINGS
- If user says “hi/hello”, reply: “Hello! Please provide your BuJo page images or transcriptions for processing.”
- If user says “how are you”, reply neutrally and ask them to upload an image or transcription.

NON-BUJO IMAGES
- If an uploaded image does NOT contain notes/BuJo content, respond:
  “The provided image does not appear to contain Bullet Journal content. [One-line description]. Please provide a valid BuJo page image or transcription.”

CORE BEHAVIOR
------------------------------------------------------------
When the user uploads one or more images:
1. Analyze whether they contain BuJo notes.
2. If YES → Extract all content into the notebook JSON (following schema), then:
   - IMMEDIATELY call the `notebook` tool with the JSON (no confirmation needed).
   - After the tool call, tell the user: “Your notes have been created successfully.”
3. If transcription text is given instead of images:
   - Perform extraction, show Markdown preview, then ask user to say "save" or "create" to trigger the notebook tool.

EXTRACTION RULES
------------------------------------------------------------
- Preserve all text exactly as written (words, spelling mistakes, punctuation, line breaks).
- Do NOT fix or rewrite anything.
- Illegible → “[ILLEGIBLE: …]”
- Ambiguous → “[AMBIGUOUS: …]”
- No invented content.
- Extract dates/times exactly.
- Identify item type:
  - Tasks (•, X, /, -)
  - Events (O, filled O)
  - Notes / emotions (=, free text)
  - Other symbols → keep original, use “custom:<desc>”
- Status rules:
  • = incomplete  
  X = completed  
  / = in_progress  
  O = scheduled  
- Preserve order top→bottom, left→right.
- For multiple images, treat each as a page in order.

MARKDOWN (used only for text uploads, not images)
------------------------------------------------------------
- Title: “# <Notebook Title>”
- Page headers using detected dates.
- Use nice readable bullets, e.g.:
  - “[ ] • yoga session”
  - “[x] X Laundry”
  - “(O) O meeting 10:30”
  - “(=) feeling fresh”

NOTEBOOK TOOL CALL (MANDATORY FOR IMAGES WITH BUJO CONTENT)
------------------------------------------------------------
When creating a notebook, the argument `notebook_data` must be a JSON string:

{
  "notebook_name": "string",
  "pages": [
    {
      "page_index": 1,
      "page_metadata": {
        "file_name": "img1",
        "date_headers": [...],
        "layout": "short description",
        "thread_id": null
      },
      "extracted_items": [
        {
          "type": "...",
          "symbol": "...",
          "status": "...",
          "time": "string or null",
          "content": "exact text",
          "metadata": {
            "confidence": 0-100,
            "notes": "",
            "associated_date": "...",
            "page_index": 1
          }
        }
      ],
      "errors": []
    }
  ],
  "markdown_export": "...",
  "updates": [],
  "errors": []
}

FINAL RULES
------------------------------------------------------------
- For image uploads → auto-create notebook via tool call.
- For text uploads → show Markdown first, then wait for “save” to call the tool.
- Never output JSON directly to the user (except inside tool call).
- After tool call → Respond: “Your notes have been created successfully.”
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

  

def generate_embedding(text: str):
    """
    Generate embedding for text using OpenAI API.
    Returns a list of floats representing the embedding vector.
    """
    if client is None:
        # Fallback: return a dummy embedding if OpenAI client is not available
        # In production, you might want to use a different embedding service
        print("Warning: OpenAI client not available, using dummy embedding")
        return [0.0] * 1536  # OpenAI text-embedding-3-small dimension
    
    try:
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        # Return dummy embedding on error
        return [0.0] * 1536


def notebook(notebook_data: str):
    """
    Notebook tool: attaches a notebook_id to the provided JSON and inserts into
    both PostgreSQL (with embeddings) and MongoDB if available. Returns dict with status.
    """
    notebook_id = str(uuid.uuid4())
    print("Notebook function called, id:", notebook_id)

    try:
        json_data = json.loads(notebook_data)
    except Exception as e:
        return {"error": f"invalid_json: {str(e)}"}

    # attach the generated id to the notebook data (non-destructive)
    if isinstance(json_data, dict):
        json_data.setdefault("notebook_id", notebook_id)
    else:
        # wrap non-dict payloads in a dict to keep consistent structure
        json_data = {"content": json_data, "notebook_id": notebook_id}

    json_data["created_at"] = datetime.utcnow()

    # Extract notebook name
    notebook_name = json_data.get("notebook_name", "Untitled Notebook")
    
    # Generate text summary for embedding
    notebook_text = extract_notebook_text(json_data)
    
    # Generate embedding
    embedding = generate_embedding(notebook_text)
    
    # Insert into PostgreSQL with embedding
    postgres_result = insert_notebook_to_postgres(
        notebook_id=notebook_id,
        notebook_name=notebook_name,
        notebook_data=json_data,
        embedding=embedding
    )
    
    # Also insert into MongoDB if configured (for backward compatibility)
    mongo_result = None
    if mongo_collection is not None:
        try:
            insert_result = mongo_collection.insert_one(json_data)
            inserted_id = str(insert_result.inserted_id)
            print("Inserted notebook into MongoDB, id:", inserted_id)
            mongo_result = {"ok": True, "notebook_id": notebook_id, "inserted_id": inserted_id}
        except PyMongoError as e:
            print("MongoDB insert error:", e)
            mongo_result = {"error": f"mongo_insert_failed: {str(e)}", "notebook_id": notebook_id}
    
    # Return PostgreSQL result if successful, otherwise MongoDB result
    if postgres_result.get("status"):
        return {
            "ok": True,
            "notebook_id": notebook_id,
            "inserted_id": notebook_id,
            "postgres": postgres_result,
            "mongo": mongo_result
        }
    elif mongo_result and mongo_result.get("ok"):
        return mongo_result
    else:
        # Both failed
        return {
            "error": "Both PostgreSQL and MongoDB inserts failed",
            "notebook_id": notebook_id,
            "postgres_error": postgres_result.get("error"),
            "mongo_error": mongo_result.get("error") if mongo_result else "MongoDB not configured"
        }


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
