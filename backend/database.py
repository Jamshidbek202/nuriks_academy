"""
Database and helper utilities
Shared across all route modules
"""
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from bson import ObjectId
import os

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nurik_academy')]

def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    doc['id'] = str(doc['_id'])
    del doc['_id']
    # Convert ObjectId fields to strings
    for key, value in doc.items():
        if isinstance(value, ObjectId):
            doc[key] = str(value)
        elif isinstance(value, list):
            doc[key] = [str(v) if isinstance(v, ObjectId) else v for v in value]
        elif isinstance(value, datetime):
            doc[key] = value.isoformat()
    return doc

async def create_audit_log(user_id: str, action: str, resource_type: str, resource_id: str = None, changes: dict = None, ip: str = None):
    """Create an audit log entry"""
    audit_log = {
        "user_id": user_id,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "changes": changes,
        "ip_address": ip,
        "timestamp": datetime.utcnow()
    }
    await db.audit_logs.insert_one(audit_log)
