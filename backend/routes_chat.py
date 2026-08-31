"""
Routes for Chat System
Phase 5: Real-time messaging between Student, Teacher, and Support
WebSocket support for instant communication
"""
from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, Response
from bson import ObjectId
from typing import List, Optional, Dict
from datetime import datetime
from pydantic import BaseModel
import os
import uuid
import json
import asyncio
import logging

router = APIRouter(prefix="/chat", tags=["Chat"])
security = HTTPBearer()
logger = logging.getLogger(__name__)

# File upload configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.environ.get(
    "CHAT_UPLOAD_DIR",
    os.path.join(BASE_DIR, "uploads", "chat"),
)
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_DOC_SIZE = 20 * 1024 * 1024    # 20 MB
ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
ALLOWED_DOC_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}  # user_id -> websocket
        self.user_conversations: Dict[str, set] = {}  # user_id -> set of conversation_ids
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"WebSocket connected: user {user_id}")
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected: user {user_id}")
    
    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception as e:
                logger.error(f"Error sending message to {user_id}: {e}")
    
    async def broadcast_to_conversation(self, message: dict, conversation_id: str, exclude_user: str = None):
        """Send message to all users in a conversation"""
        from server import db
        conv = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
        if conv:
            for participant_id in conv.get("participants", []):
                if participant_id != exclude_user:
                    await self.send_personal_message(message, participant_id)

manager = ConnectionManager()

async def get_current_user_dep(credentials: HTTPAuthorizationCredentials = Depends(security)):
    from server import db
    from auth import get_current_user
    return await get_current_user(credentials, db)

async def mark_conversation_read(db, conversation_id: str, user_id: str):
    """Mark unread incoming messages in a conversation as read for this user."""
    read_at = datetime.utcnow()
    unread_messages = await db.messages.find({
        "conversation_id": conversation_id,
        "sender_id": {"$ne": user_id},
        "status": {"$ne": "read"}
    }).to_list(500)

    if not unread_messages:
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {f"unread_counts.{user_id}": 0}}
        )
        return []

    message_ids = [m["_id"] for m in unread_messages]
    await db.messages.update_many(
        {"_id": {"$in": message_ids}},
        {"$set": {"status": "read", "read_at": read_at}}
    )

    await db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {f"unread_counts.{user_id}": 0}}
    )

    for msg in unread_messages:
        await manager.send_personal_message({
            "type": "message_read",
            "message_id": str(msg["_id"]),
            "conversation_id": conversation_id,
            "read_by": user_id,
            "read_at": read_at.isoformat()
        }, msg.get("sender_id"))

    return unread_messages

# Models
class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"  # text, image, document
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None

class ConversationCreate(BaseModel):
    participant_id: str  # The other user to chat with

# ==================== CHAT ACCESS CONTROL ====================

async def get_primary_admin(db) -> Optional[dict]:
    """Return the first active super admin for help/support conversations."""
    return await db.users.find_one(
        {"role": "super_admin", "is_active": True},
        sort=[("created_at", 1), ("_id", 1)]
    )

async def can_chat_with(current_user: dict, other_user_id: str, db) -> tuple[bool, str]:
    """
    Check if current user can chat with another user
    Returns (can_chat, reason)
    """
    current_role = current_user.get("role")
    current_id = str(current_user["_id"])
    
    # Get the other user
    other_user = await db.users.find_one({"_id": ObjectId(other_user_id)})
    if not other_user:
        return False, "User not found"
    
    other_role = other_user.get("role")
    
    # Admins can chat directly with active students, parents, teachers, support, and managers.
    if current_role == "super_admin":
        if other_user.get("is_active") and other_role in ["student", "parent", "teacher", "support", "manager"]:
            return True, "Admin can chat with academy users"
        return False, "Admin can only chat with active academy users"

    # Everyone can contact an admin from Help & Support. Parent/manager access is limited to this.
    if other_role == "super_admin" and other_user.get("is_active"):
        return True, "User can chat with admin"

    # Parent and Manager cannot use general chat.
    if current_role in ["parent", "manager"]:
        return False, "Chat access not allowed for your role"

    # Student can chat with:
    # 1. Their assigned teacher
    # 2. Support staff
    if current_role == "student":
        if other_role == "support":
            if other_user.get("branch_id") == current_user.get("branch_id"):
                return True, "Student can chat with support"
            return False, "You can only chat with support staff from your branch"
        
        if other_role == "teacher":
            # Check if teacher is assigned to student's groups
            student = await db.students.find_one({"user_id": current_id})
            if student:
                student_group_ids = student.get("group_ids", [])
                teacher = await db.teachers.find_one({"user_id": other_user_id})
                if teacher:
                    teacher_group_ids = teacher.get("group_ids", [])
                    # Check for any common groups
                    common_groups = set(student_group_ids) & set(teacher_group_ids)
                    if common_groups:
                        return True, "Student can chat with assigned teacher"
            return False, "You can only chat with your assigned teacher"
        
        return False, "Students can only chat with teachers and support"
    
    # Teacher can chat with:
    # 1. Their assigned students
    if current_role == "teacher":
        if other_role == "student":
            # Check if student is in teacher's groups
            teacher = await db.teachers.find_one({"user_id": current_id})
            if teacher:
                teacher_group_ids = teacher.get("group_ids", [])
                student = await db.students.find_one({"user_id": other_user_id})
                if student:
                    student_group_ids = student.get("group_ids", [])
                    common_groups = set(student_group_ids) & set(teacher_group_ids)
                    if common_groups:
                        return True, "Teacher can chat with assigned student"
            return False, "You can only chat with your assigned students"
        
        return False, "Teachers can only chat with their students"
    
    # Support can chat with:
    # 1. All students
    if current_role == "support":
        if other_role == "student":
            if other_user.get("branch_id") == current_user.get("branch_id"):
                return True, "Support can chat with students"
            return False, "You can only chat with students from your branch"
        return False, "Support can only chat with students"
    
    return False, "Chat access not allowed"

# ==================== GET AVAILABLE CHAT CONTACTS ====================

@router.get("/contacts")
async def get_chat_contacts(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get list of users the current user can chat with"""
    from server import db, serialize_doc
    
    role = current_user.get("role")
    user_id = str(current_user["_id"])
    contacts = []
    
    if role in ["parent", "manager"]:
        return []
    
    # Super Admin can start conversations with all active non-admin users
    if role == "super_admin":
        users = await db.users.find({
            "is_active": True,
            "role": {"$in": ["student", "parent", "teacher", "support", "manager"]}
        }).to_list(500)
        
        for u in users:
            contacts.append({
                "id": str(u["_id"]),
                "name": u.get("full_name", "Unknown"),
                "role": u.get("role"),
                "is_online": str(u["_id"]) in manager.active_connections
            })
        return contacts
    
    # Student: Get assigned teachers + support staff
    if role == "student":
        student = await db.students.find_one({"user_id": user_id})
        if student:
            group_ids = student.get("group_ids", [])
            
            # Get teachers from student's groups
            if group_ids:
                teachers = await db.teachers.find({
                    "group_ids": {"$in": group_ids}
                }).to_list(100)
                
                for t in teachers:
                    teacher_user = await db.users.find_one({"_id": ObjectId(t["user_id"])})
                    if teacher_user and teacher_user.get("is_active"):
                        contacts.append({
                            "id": t["user_id"],
                            "name": f"{t.get('first_name', '')} {t.get('last_name', '')}".strip() or teacher_user.get("full_name", "Teacher"),
                            "role": "teacher",
                            "subject": t.get("subject"),
                            "is_online": t["user_id"] in manager.active_connections
                        })
        
        # Get all support staff
        support_users = await db.users.find({
            "role": "support",
            "is_active": True,
            "branch_id": current_user.get("branch_id"),
        }).to_list(100)
        
        for s in support_users:
            contacts.append({
                "id": str(s["_id"]),
                "name": s.get("full_name", "Support"),
                "role": "support",
                "is_online": str(s["_id"]) in manager.active_connections
            })
        
        return contacts
    
    # Teacher: Get assigned students
    if role == "teacher":
        teacher = await db.teachers.find_one({"user_id": user_id})
        if teacher:
            group_ids = teacher.get("group_ids", [])
            
            if group_ids:
                students = await db.students.find({
                    "group_ids": {"$in": group_ids},
                    "status": "active"
                }).to_list(500)
                
                for s in students:
                    student_user = await db.users.find_one({"_id": ObjectId(s["user_id"])})
                    if student_user and student_user.get("is_active"):
                        contacts.append({
                            "id": s["user_id"],
                            "name": f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
                            "role": "student",
                            "student_id": s.get("student_id"),
                            "is_online": s["user_id"] in manager.active_connections
                        })
        
        return contacts
    
    # Support: Get all students
    if role == "support":
        students = await db.students.find({
            "status": "active",
            "branch_id": current_user.get("branch_id"),
        }).to_list(500)
        
        for s in students:
            student_user = await db.users.find_one({"_id": ObjectId(s["user_id"])})
            if student_user and student_user.get("is_active"):
                contacts.append({
                    "id": s["user_id"],
                    "name": f"{s.get('first_name', '')} {s.get('last_name', '')}".strip(),
                    "role": "student",
                    "student_id": s.get("student_id"),
                    "is_online": s["user_id"] in manager.active_connections
                })
        
        return contacts
    
    return contacts

# ==================== GET/CREATE CONVERSATION ====================

@router.post("/conversations")
async def create_or_get_conversation(
    data: ConversationCreate,
    current_user: dict = Depends(get_current_user_dep)
):
    """Create or get existing conversation between two users"""
    from server import db, serialize_doc
    
    user_id = str(current_user["_id"])
    other_id = data.participant_id
    
    # Check if can chat
    can_chat, reason = await can_chat_with(current_user, other_id, db)
    if not can_chat:
        raise HTTPException(status_code=403, detail=reason)
    
    # Check for existing conversation
    existing = await db.conversations.find_one({
        "participants": {"$all": [user_id, other_id]},
        "type": "direct"
    })
    
    if existing:
        return serialize_doc(existing)
    
    # Get other user info
    other_user = await db.users.find_one({"_id": ObjectId(other_id)})
    
    # Create new conversation
    conversation = {
        "type": "direct",
        "participants": [user_id, other_id],
        "participant_names": {
            user_id: current_user.get("full_name", "Unknown"),
            other_id: other_user.get("full_name", "Unknown") if other_user else "Unknown"
        },
        "participant_roles": {
            user_id: current_user.get("role"),
            other_id: other_user.get("role") if other_user else None
        },
        "last_message": None,
        "last_message_at": None,
        "unread_counts": {user_id: 0, other_id: 0},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        # Future compatibility
        "video_call_enabled": True,
        "screen_share_enabled": True,
        "active_call": None
    }
    
    result = await db.conversations.insert_one(conversation)
    conversation["id"] = str(result.inserted_id)
    
    return serialize_doc(conversation)

@router.post("/conversations/admin")
async def create_or_get_admin_conversation(
    current_user: dict = Depends(get_current_user_dep)
):
    """Create or get the Help & Support conversation with the primary admin."""
    from server import db, serialize_doc

    user_id = str(current_user["_id"])
    role = current_user.get("role")

    if role == "super_admin":
        raise HTTPException(status_code=400, detail="Admin should start conversations from the chat contacts list")

    admin_user = await get_primary_admin(db)
    if not admin_user:
        raise HTTPException(status_code=404, detail="No admin is available for chat")

    admin_id = str(admin_user["_id"])

    existing = await db.conversations.find_one({
        "participants": {"$all": [user_id, admin_id]},
        "type": "direct"
    })

    if existing:
        return serialize_doc(existing)

    conversation = {
        "type": "direct",
        "participants": [user_id, admin_id],
        "participant_names": {
            user_id: current_user.get("full_name", "Unknown"),
            admin_id: admin_user.get("full_name", "Admin")
        },
        "participant_roles": {
            user_id: role,
            admin_id: "super_admin"
        },
        "last_message": None,
        "last_message_at": None,
        "unread_counts": {user_id: 0, admin_id: 0},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "source": "help_support",
        "video_call_enabled": True,
        "screen_share_enabled": True,
        "active_call": None
    }

    result = await db.conversations.insert_one(conversation)
    conversation["_id"] = result.inserted_id

    return serialize_doc(conversation)

@router.get("/conversations")
async def get_conversations(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get all conversations for current user"""
    from server import db, serialize_doc
    
    user_id = str(current_user["_id"])
    role = current_user.get("role")
    
    conversations = await db.conversations.find({
        "participants": user_id
    }).sort("last_message_at", -1).to_list(500 if role == "super_admin" else 100)
    
    result = []
    for conv in conversations:
        conv_data = serialize_doc(conv)
        
        # Get unread count for current user
        conv_data["unread_count"] = conv.get("unread_counts", {}).get(user_id, 0)
        
        # Get other participant info
        other_id = next((p for p in conv.get("participants", []) if p != user_id), None)
        if other_id:
            conv_data["other_participant"] = {
                "id": other_id,
                "name": conv.get("participant_names", {}).get(other_id, "Unknown"),
                "role": conv.get("participant_roles", {}).get(other_id),
                "is_online": other_id in manager.active_connections
            }
        
        result.append(conv_data)
    
    return result

@router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get a specific conversation"""
    from server import db, serialize_doc
    
    user_id = str(current_user["_id"])
    role = current_user.get("role")
    
    conversation = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Check access
    if user_id not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    conv_data = serialize_doc(conversation)
    conv_data["unread_count"] = conversation.get("unread_counts", {}).get(user_id, 0)
    
    return conv_data

# ==================== MESSAGES ====================

@router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user_dep)
):
    """Get messages in a conversation"""
    from server import db, serialize_doc
    
    user_id = str(current_user["_id"])
    role = current_user.get("role")
    
    # Check conversation access
    conversation = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if user_id not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Build query
    query = {"conversation_id": conversation_id}
    
    if search:
        query["content"] = {"$regex": search, "$options": "i"}
    
    # Mark messages as read before returning them so local state matches the database.
    await mark_conversation_read(db, conversation_id, user_id)

    # Get messages
    messages = await db.messages.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)

    # Reverse to show oldest first
    messages.reverse()
    
    return [serialize_doc(m) for m in messages]

@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    message_data: MessageCreate,
    current_user: dict = Depends(get_current_user_dep)
):
    """Send a message in a conversation"""
    from server import db, serialize_doc
    
    user_id = str(current_user["_id"])
    role = current_user.get("role")
    
    # Check conversation access
    conversation = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if user_id not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Create message
    message = {
        "conversation_id": conversation_id,
        "sender_id": user_id,
        "sender_name": current_user.get("full_name", "Unknown"),
        "sender_role": role,
        "content": message_data.content,
        "message_type": message_data.message_type,
        "file_url": message_data.file_url,
        "file_name": message_data.file_name,
        "file_size": message_data.file_size,
        "status": "sent",
        "created_at": datetime.utcnow(),
        "delivered_at": None,
        "read_at": None
    }
    
    result = await db.messages.insert_one(message)
    message["_id"] = result.inserted_id
    
    # Update conversation
    other_id = next((p for p in conversation.get("participants", []) if p != user_id), None)
    
    update_data = {
        "last_message": message_data.content[:100],
        "last_message_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    # Increment unread count for other participant
    if other_id:
        update_data[f"unread_counts.{other_id}"] = conversation.get("unread_counts", {}).get(other_id, 0) + 1
    
    await db.conversations.update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": update_data}
    )
    
    # Send real-time notification to other participant
    if other_id:
        # Check if other user is online
        if other_id in manager.active_connections:
            # Update status to delivered
            await db.messages.update_one(
                {"_id": result.inserted_id},
                {"$set": {"status": "delivered", "delivered_at": datetime.utcnow()}}
            )
            message["status"] = "delivered"
        
        # Send via WebSocket
        message_copy = message.copy()
        message_copy["_id"] = result.inserted_id
        await manager.send_personal_message({
            "type": "new_message",
            "message": serialize_doc(message_copy),
            "conversation_id": conversation_id
        }, other_id)
        
        # Always add the recipient's inbox item; only push when they are offline.
        try:
            from notification_helpers import notify_chat_message
            sender_name = current_user.get("full_name", "Someone")
            await notify_chat_message(
                db,
                sender_id=user_id,
                recipient_id=other_id,
                sender_name=sender_name,
                message_preview=message_data.content,
                conversation_id=conversation_id,
                send_push=other_id not in manager.active_connections,
            )
        except Exception as e:
            logger.error(f"Error sending chat notification: {e}")
    
    return serialize_doc(message)

# ==================== FILE UPLOAD ====================

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_dep)
):
    """Upload a file for chat"""
    from server import db
    
    # Validate file type
    content_type = file.content_type or ""
    is_image = content_type in ALLOWED_IMAGE_TYPES
    is_document = content_type in ALLOWED_DOC_TYPES
    
    # Check by extension as fallback
    if not is_image and not is_document:
        ext = file.filename.lower().split('.')[-1] if file.filename else ""
        if ext in ['jpg', 'jpeg', 'png']:
            is_image = True
        elif ext in ['pdf', 'doc', 'docx', 'xls', 'xlsx']:
            is_document = True
    
    if not is_image and not is_document:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: JPG, JPEG, PNG, PDF, DOC, DOCX, XLS, XLSX"
        )
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Check file size
    if is_image and file_size > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail=f"Image size exceeds {MAX_IMAGE_SIZE // (1024*1024)}MB limit")
    
    if is_document and file_size > MAX_DOC_SIZE:
        raise HTTPException(status_code=400, detail=f"Document size exceeds {MAX_DOC_SIZE // (1024*1024)}MB limit")
    
    # Persist chat media in MongoDB GridFS. Render's service filesystem is
    # ephemeral, so disk-only uploads disappear after a deploy.
    ext = file.filename.split('.')[-1] if file.filename else 'bin'
    unique_filename = f"{uuid.uuid4()}.{ext}"
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="chat_files")
    file_id = await bucket.upload_from_stream(
        unique_filename,
        content,
        metadata={
            "original_name": file.filename,
            "content_type": content_type or "application/octet-stream",
            "uploaded_by": str(current_user["_id"]),
            "uploaded_at": datetime.utcnow(),
        },
    )
    
    return {
        "file_url": f"/api/chat/files/{file_id}",
        "file_name": file.filename,
        "file_size": file_size,
        "file_type": "image" if is_image else "document"
    }

@router.get("/files/{filename}")
async def get_file(
    filename: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Download a chat file"""
    from server import db
    user_id = str(current_user["_id"])

    async def require_message_access(file_url: str, uploaded_by: Optional[str] = None) -> None:
        if uploaded_by == user_id:
            return
        message = await db.messages.find_one({"file_url": file_url})
        if not message:
            raise HTTPException(status_code=403, detail="File access denied")
        conversation_id = message.get("conversation_id")
        if not conversation_id or not ObjectId.is_valid(str(conversation_id)):
            raise HTTPException(status_code=403, detail="File access denied")
        conversation = await db.conversations.find_one({"_id": ObjectId(str(conversation_id))})
        if not conversation or user_id not in conversation.get("participants", []):
            raise HTTPException(status_code=403, detail="File access denied")

    if ObjectId.is_valid(filename):
        from motor.motor_asyncio import AsyncIOMotorGridFSBucket
        from gridfs.errors import NoFile

        bucket = AsyncIOMotorGridFSBucket(db, bucket_name="chat_files")
        try:
            stored = await bucket.open_download_stream(ObjectId(filename))
        except NoFile as error:
            raise HTTPException(status_code=404, detail="File not found") from error
        metadata = stored.metadata or {}
        await require_message_access(
            f"/api/chat/files/{filename}",
            str(metadata.get("uploaded_by")) if metadata.get("uploaded_by") else None,
        )
        payload = await stored.read()
        return Response(
            content=payload,
            media_type=metadata.get("content_type") or "application/octet-stream",
            headers={
                "Content-Disposition": f'inline; filename="{metadata.get("original_name") or stored.filename}"',
                "Cache-Control": "private, max-age=3600",
            },
        )

    # Backward-compatible access to files uploaded before GridFS migration.
    file_path = os.path.join(UPLOAD_DIR, os.path.basename(filename))
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    await require_message_access(f"/api/chat/files/{os.path.basename(filename)}")
    return FileResponse(file_path)

# ==================== UNREAD COUNT ====================

@router.get("/unread-count")
async def get_total_unread_count(
    current_user: dict = Depends(get_current_user_dep)
):
    """Get total unread message count for current user"""
    from server import db
    
    user_id = str(current_user["_id"])
    # Sum up unread counts from all conversations
    pipeline = [
        {"$match": {"participants": user_id}},
        {"$project": {"unread": f"$unread_counts.{user_id}"}},
        {"$group": {"_id": None, "total": {"$sum": "$unread"}}}
    ]
    
    result = await db.conversations.aggregate(pipeline).to_list(1)
    total = result[0]["total"] if result else 0
    
    return {"total_unread": total}

# ==================== MESSAGE STATUS UPDATE ====================

@router.patch("/messages/{message_id}/status")
async def update_message_status(
    message_id: str,
    status: str,
    current_user: dict = Depends(get_current_user_dep)
):
    """Update message status (delivered/read)"""
    from server import db
    
    if status not in ["delivered", "read"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    message = await db.messages.find_one({"_id": ObjectId(message_id)})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    user_id = str(current_user["_id"])
    conversation_id = message.get("conversation_id")
    conversation = await db.conversations.find_one({"_id": ObjectId(conversation_id)})
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if user_id not in conversation.get("participants", []):
        raise HTTPException(status_code=403, detail="Access denied")

    if message.get("sender_id") == user_id:
        raise HTTPException(status_code=403, detail="Only the recipient can update message status")

    if status == "read" and message.get("status") == "read":
        return {"status": "updated"}

    update_data = {"status": status}
    if status == "delivered":
        update_data["delivered_at"] = datetime.utcnow()
    elif status == "read":
        update_data["read_at"] = datetime.utcnow()
    
    await db.messages.update_one(
        {"_id": ObjectId(message_id)},
        {"$set": update_data}
    )

    if status == "read":
        remaining_unread = await db.messages.count_documents({
            "conversation_id": conversation_id,
            "sender_id": {"$ne": user_id},
            "status": {"$ne": "read"}
        })
        await db.conversations.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": {f"unread_counts.{user_id}": remaining_unread}}
        )

    # Notify sender
    await manager.send_personal_message({
        "type": f"message_{status}",
        "message_id": message_id,
        "conversation_id": conversation_id,
        f"{status}_by": user_id,
        f"{status}_at": update_data.get(f"{status}_at", datetime.utcnow()).isoformat()
    }, message.get("sender_id"))
    
    return {"status": "updated"}

# ==================== WEBSOCKET ENDPOINT ====================

@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for real-time messaging"""
    from server import db
    from auth import verify_token
    
    try:
        # Verify token
        payload = verify_token(token)
        if not payload:
            await websocket.close(code=4001)
            return
        
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
        
        # Get user
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user or not user.get("is_active"):
            await websocket.close(code=4001)
            return
        
        # Connect
        await manager.connect(websocket, user_id)
        
        # Mark user as online and notify their contacts
        # Update any pending messages to delivered
        user_conversations = await db.conversations.find(
            {"participants": user_id},
            {"_id": 1}
        ).to_list(500)
        user_conversation_ids = [str(conv["_id"]) for conv in user_conversations]
        await db.messages.update_many(
            {
                "conversation_id": {"$in": user_conversation_ids},
                "sender_id": {"$ne": user_id},
                "status": "sent"
            },
            {"$set": {"status": "delivered", "delivered_at": datetime.utcnow()}}
        )
        
        try:
            while True:
                # Receive messages from client
                data = await websocket.receive_json()
                
                # Handle different message types
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
                elif data.get("type") == "typing":
                    # Broadcast typing indicator
                    conversation_id = data.get("conversation_id")
                    if conversation_id:
                        await manager.broadcast_to_conversation({
                            "type": "typing",
                            "user_id": user_id,
                            "conversation_id": conversation_id
                        }, conversation_id, exclude_user=user_id)
                
                elif data.get("type") == "stop_typing":
                    conversation_id = data.get("conversation_id")
                    if conversation_id:
                        await manager.broadcast_to_conversation({
                            "type": "stop_typing",
                            "user_id": user_id,
                            "conversation_id": conversation_id
                        }, conversation_id, exclude_user=user_id)
                
        except WebSocketDisconnect:
            manager.disconnect(user_id)
            
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close(code=4000)
        except Exception:
            pass
