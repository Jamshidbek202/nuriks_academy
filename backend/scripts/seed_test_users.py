"""Legacy disposable-QA fixture generator.

This script intentionally uses shared test passwords and must never target the
live academy database. Production accounts are provisioned by phone invite.
"""
import asyncio
import os
import sys
from datetime import datetime
from bson import ObjectId

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from auth import get_password_hash

load_dotenv()

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'nurik_academy')]

async def get_next_student_id():
    """Get next student ID using atomic counter"""
    result = await db.counters.find_one_and_update(
        {"_id": "student_id"},
        {"$inc": {"seq": 1}},
        return_document=True
    )
    if not result:
        await db.counters.insert_one({"_id": "student_id", "seq": 1})
        return "NA-000001"
    return f"NA-{result['seq']:06d}"

async def seed_test_users():
    """Create test users for all 6 roles"""
    environment = os.environ.get("APP_ENV", "").strip().lower()
    database_name = os.environ.get("DB_NAME", "")
    if environment not in {"test", "qa", "app_qa", "finance_qa", "sandbox"} or not any(
        marker in database_name.lower() for marker in ("test", "qa", "sandbox")
    ):
        raise RuntimeError(
            "Refusing to seed shared-password fixtures outside an explicitly named disposable QA database"
        )
    
    # Get branch (should exist from init)
    branch = await db.branches.find_one()
    branch_id = str(branch["_id"]) if branch else None
    
    print("Creating test users...")
    
    created_users = {}
    
    # 1. Super Admin (should already exist from init)
    existing_admin = await db.users.find_one({"role": "super_admin"})
    if existing_admin:
        print(f"✓ Super Admin already exists: admin / Admin@2025")
        created_users["super_admin"] = {
            "login": "admin",
            "password": "Admin@2025",
            "name": existing_admin["full_name"],
            "id": str(existing_admin["_id"])
        }
    else:
        admin_user = {
            "login": "admin",
            "password_hash": get_password_hash("Admin@2025"),
            "email": "admin@nuriksacademy.uz",
            "phone": "+998901234567",
            "full_name": "Super Administrator",
            "role": "super_admin",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        result = await db.users.insert_one(admin_user)
        print(f"✓ Created Super Admin: admin / Admin@2025")
        created_users["super_admin"] = {
            "login": "admin",
            "password": "Admin@2025",
            "name": "Super Administrator",
            "id": str(result.inserted_id)
        }
    
    # 2. Manager
    existing_manager = await db.users.find_one({"role": "manager"})
    if existing_manager:
        print(f"✓ Manager already exists")
        created_users["manager"] = {
            "login": existing_manager["login"],
            "password": "Manager@2025",
            "name": existing_manager["full_name"],
            "id": str(existing_manager["_id"])
        }
    else:
        manager_user = {
            "login": "manager_+998901001001",
            "password_hash": get_password_hash("Manager@2025"),
            "email": "manager@nuriksacademy.uz",
            "phone": "+998901001001",
            "full_name": "Maria Manager",
            "role": "manager",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        result = await db.users.insert_one(manager_user)
        print(f"✓ Created Manager: manager_+998901001001 / Manager@2025")
        created_users["manager"] = {
            "login": "manager_+998901001001",
            "password": "Manager@2025",
            "name": "Maria Manager",
            "id": str(result.inserted_id)
        }
    
    # 3. Teacher
    existing_teacher = await db.teachers.find_one()
    if existing_teacher:
        teacher_user = await db.users.find_one({"_id": ObjectId(existing_teacher["user_id"])})
        if teacher_user:
            print(f"✓ Teacher already exists: {teacher_user['login']}")
            created_users["teacher"] = {
                "login": teacher_user["login"],
                "password": "Teacher@2025",
                "name": teacher_user["full_name"],
                "id": str(teacher_user["_id"]),
                "profile_id": str(existing_teacher["_id"])
            }
    
    if "teacher" not in created_users:
        teacher_user = {
            "login": "teacher_+998901112233",
            "password_hash": get_password_hash("Teacher@2025"),
            "email": "john.smith@nuriksacademy.uz",
            "phone": "+998901112233",
            "full_name": "John Smith",
            "role": "teacher",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        user_result = await db.users.insert_one(teacher_user)
        
        teacher_profile = {
            "user_id": str(user_result.inserted_id),
            "first_name": "John",
            "last_name": "Smith",
            "phone": "+998901112233",
            "email": "john.smith@nuriksacademy.uz",
            "photo": None,
            "specialization": ["IELTS", "General English"],
            "courses": [],
            "group_ids": [],
            "branch_id": branch_id,
            "created_at": datetime.utcnow()
        }
        profile_result = await db.teachers.insert_one(teacher_profile)
        print(f"✓ Created Teacher: teacher_+998901112233 / Teacher@2025")
        created_users["teacher"] = {
            "login": "teacher_+998901112233",
            "password": "Teacher@2025",
            "name": "John Smith",
            "id": str(user_result.inserted_id),
            "profile_id": str(profile_result.inserted_id)
        }
    
    # 4. Support Staff
    existing_support = await db.support_staff.find_one()
    if existing_support:
        support_user = await db.users.find_one({"_id": ObjectId(existing_support["user_id"])})
        if support_user:
            print(f"✓ Support already exists: {support_user['login']}")
            created_users["support"] = {
                "login": support_user["login"],
                "password": "Support@2025",
                "name": support_user["full_name"],
                "id": str(support_user["_id"]),
                "profile_id": str(existing_support["_id"])
            }
    
    if "support" not in created_users:
        support_user = {
            "login": "support_+998902223344",
            "password_hash": get_password_hash("Support@2025"),
            "email": "sarah.support@nuriksacademy.uz",
            "phone": "+998902223344",
            "full_name": "Sarah Support",
            "role": "support",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        user_result = await db.users.insert_one(support_user)
        
        support_profile = {
            "user_id": str(user_result.inserted_id),
            "first_name": "Sarah",
            "last_name": "Support",
            "phone": "+998902223344",
            "email": "sarah.support@nuriksacademy.uz",
            "photo": None,
            "available_hours": {"start": "09:00", "end": "18:00"},
            "branch_id": branch_id,
            "created_at": datetime.utcnow()
        }
        profile_result = await db.support_staff.insert_one(support_profile)
        print(f"✓ Created Support: support_+998902223344 / Support@2025")
        created_users["support"] = {
            "login": "support_+998902223344",
            "password": "Support@2025",
            "name": "Sarah Support",
            "id": str(user_result.inserted_id),
            "profile_id": str(profile_result.inserted_id)
        }
    
    # 5. Student (create with parent)
    existing_student = await db.students.find_one()
    if existing_student:
        student_user = await db.users.find_one({"_id": ObjectId(existing_student["user_id"])})
        if student_user:
            print(f"✓ Student already exists: {student_user['login']}")
            # Update login to use student_id format for easier testing
            student_login = existing_student["student_id"].lower()
            await db.users.update_one(
                {"_id": student_user["_id"]},
                {"$set": {"login": student_login}}
            )
            created_users["student"] = {
                "login": student_login,
                "password": "Student@2025",
                "name": student_user["full_name"],
                "id": str(student_user["_id"]),
                "profile_id": str(existing_student["_id"]),
                "student_id": existing_student["student_id"]
            }
    
    if "student" not in created_users:
        # Generate student ID
        student_id = await get_next_student_id()
        
        # Create parent first
        parent_user = {
            "login": "parent_+998903334455",
            "password_hash": get_password_hash("Parent@2025"),
            "email": "parent@example.com",
            "phone": "+998903334455",
            "full_name": "Peter Parent",
            "role": "parent",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        parent_user_result = await db.users.insert_one(parent_user)
        
        parent_profile = {
            "user_id": str(parent_user_result.inserted_id),
            "first_name": "Peter",
            "last_name": "Parent",
            "phone": "+998903334455",
            "email": "parent@example.com",
            "student_ids": [],
            "created_at": datetime.utcnow()
        }
        parent_result = await db.parents.insert_one(parent_profile)
        parent_id = str(parent_result.inserted_id)
        
        # Create student
        student_user = {
            "login": student_id.lower(),
            "password_hash": get_password_hash("Student@2025"),
            "email": "student@example.com",
            "phone": "+998904445566",
            "full_name": "Alex Student",
            "role": "student",
            "is_active": True,
            "two_factor_enabled": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "branch_id": branch_id
        }
        student_user_result = await db.users.insert_one(student_user)
        
        student_profile = {
            "student_id": student_id,
            "user_id": str(student_user_result.inserted_id),
            "parent_id": parent_id,
            "first_name": "Alex",
            "last_name": "Student",
            "date_of_birth": datetime(2005, 5, 15),
            "phone": "+998904445566",
            "email": "student@example.com",
            "photo": None,
            "address": "Tashkent, Uzbekistan",
            "course_ids": [],
            "group_ids": [],
            "status": "active",
            "enrollment_date": datetime.utcnow(),
            "branch_id": branch_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        student_result = await db.students.insert_one(student_profile)
        
        # Update parent with student ID
        await db.parents.update_one(
            {"_id": ObjectId(parent_id)},
            {"$push": {"student_ids": str(student_result.inserted_id)}}
        )
        
        print(f"✓ Created Student: {student_id.lower()} / Student@2025")
        created_users["student"] = {
            "login": student_id.lower(),
            "password": "Student@2025",
            "name": "Alex Student",
            "id": str(student_user_result.inserted_id),
            "profile_id": str(student_result.inserted_id),
            "student_id": student_id
        }
        
        print(f"✓ Created Parent: parent_+998903334455 / Parent@2025")
        created_users["parent"] = {
            "login": "parent_+998903334455",
            "password": "Parent@2025",
            "name": "Peter Parent",
            "id": str(parent_user_result.inserted_id),
            "profile_id": parent_id
        }
    else:
        # Check if parent exists for the student
        existing_student_doc = await db.students.find_one()
        if existing_student_doc and existing_student_doc.get("parent_id"):
            parent_profile = await db.parents.find_one({"_id": ObjectId(existing_student_doc["parent_id"])})
            if parent_profile:
                parent_user = await db.users.find_one({"_id": ObjectId(parent_profile["user_id"])})
                if parent_user:
                    print(f"✓ Parent already exists: {parent_user['login']}")
                    created_users["parent"] = {
                        "login": parent_user["login"],
                        "password": "Parent@2025",
                        "name": parent_user["full_name"],
                        "id": str(parent_user["_id"]),
                        "profile_id": str(parent_profile["_id"])
                    }
        
        if "parent" not in created_users:
            # Create parent if not exists
            parent_user = {
                "login": "parent_+998903334455",
                "password_hash": get_password_hash("Parent@2025"),
                "email": "parent@example.com",
                "phone": "+998903334455",
                "full_name": "Peter Parent",
                "role": "parent",
                "is_active": True,
                "two_factor_enabled": False,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "branch_id": branch_id
            }
            parent_user_result = await db.users.insert_one(parent_user)
            
            parent_profile = {
                "user_id": str(parent_user_result.inserted_id),
                "first_name": "Peter",
                "last_name": "Parent",
                "phone": "+998903334455",
                "email": "parent@example.com",
                "student_ids": [created_users["student"]["profile_id"]] if created_users.get("student") else [],
                "created_at": datetime.utcnow()
            }
            parent_result = await db.parents.insert_one(parent_profile)
            
            # Update student with parent_id
            if created_users.get("student"):
                await db.students.update_one(
                    {"_id": ObjectId(created_users["student"]["profile_id"])},
                    {"$set": {"parent_id": str(parent_result.inserted_id)}}
                )
            
            print(f"✓ Created Parent: parent_+998903334455 / Parent@2025")
            created_users["parent"] = {
                "login": "parent_+998903334455",
                "password": "Parent@2025",
                "name": "Peter Parent",
                "id": str(parent_user_result.inserted_id),
                "profile_id": str(parent_result.inserted_id)
            }
    
    # Assign teacher to a group if group exists
    group = await db.groups.find_one()
    if group and created_users.get("teacher"):
        # Update group with teacher
        await db.groups.update_one(
            {"_id": group["_id"]},
            {"$set": {"teacher_id": created_users["teacher"]["profile_id"]}}
        )
        # Update teacher with group
        await db.teachers.update_one(
            {"_id": ObjectId(created_users["teacher"]["profile_id"])},
            {"$addToSet": {"group_ids": str(group["_id"])}}
        )
        
        # Add student to group if exists
        if created_users.get("student"):
            await db.groups.update_one(
                {"_id": group["_id"]},
                {"$addToSet": {"student_ids": created_users["student"]["profile_id"]}}
            )
            await db.students.update_one(
                {"_id": ObjectId(created_users["student"]["profile_id"])},
                {"$addToSet": {"group_ids": str(group["_id"])}}
            )
        
        print(f"✓ Assigned teacher and student to group: {group['name']}")
    
    print("\n" + "="*60)
    print("TEST CREDENTIALS SUMMARY")
    print("="*60)
    
    for role, info in created_users.items():
        print(f"\n{role.upper()}:")
        print(f"  Login: {info['login']}")
        print(f"  Password: {info['password']}")
        print(f"  Name: {info['name']}")
    
    print("\n" + "="*60)
    
    return created_users

if __name__ == "__main__":
    asyncio.run(seed_test_users())
