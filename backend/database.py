"""
Database and helper utilities
Shared across all route modules
"""
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from bson import ObjectId
import os
import certifi
import re
from typing import Optional

SAFE_TEST_DATABASE_PATTERN = re.compile(r"(?:^|[_-])(test|qa|sandbox|shadow)(?:[_-]|$)", re.IGNORECASE)


def assert_disposable_database_name(database_name: str) -> None:
    """Refuse destructive/seeded QA work against a production-looking database."""
    if not SAFE_TEST_DATABASE_PATTERN.search(database_name):
        raise RuntimeError(
            "Finance QA requires a disposable database name containing "
            "test, qa, sandbox, or shadow"
        )


def create_mongo_client(mongo_url: Optional[str] = None) -> AsyncIOMotorClient:
    """Create a client without incorrectly forcing TLS on a local test replica set."""
    url = mongo_url or os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    options = {}
    if url.startswith('mongodb+srv://') or os.environ.get('MONGO_TLS') == '1':
        options['tlsCAFile'] = certifi.where()
    return AsyncIOMotorClient(url, **options)


# MongoDB connection. Motor connects lazily, so importing the application does
# not touch the database; all QA runners additionally enforce a disposable name.
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
database_name = os.environ.get('DB_NAME', 'nurik_academy')
if os.environ.get('APP_ENV') in {'test', 'qa', 'finance_qa', 'sandbox', 'shadow'}:
    assert_disposable_database_name(database_name)
client = create_mongo_client(mongo_url)
db = client[database_name]

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
