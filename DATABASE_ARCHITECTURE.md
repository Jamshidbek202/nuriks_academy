# Nurik's Academy - Database Architecture

## Database: MongoDB (Scalable for 5000+ students, multiple branches)

---

## Collections Schema

### 1. users
```json
{
  "_id": ObjectId,
  "login": String (unique, indexed),
  "password_hash": String,
  "role": String ["super_admin", "manager", "teacher", "support", "parent", "student"],
  "email": String,
  "phone": String,
  "full_name": String,
  "is_active": Boolean,
  "two_factor_enabled": Boolean,
  "two_factor_secret": String,
  "created_by": ObjectId (ref: users),
  "created_at": DateTime,
  "updated_at": DateTime,
  "last_login": DateTime,
  "branch_id": ObjectId (ref: branches)
}
```

### 2. students
```json
{
  "_id": ObjectId,
  "student_id": String (unique, format: "NA-000001", indexed),
  "user_id": ObjectId (ref: users),
  "parent_id": ObjectId (ref: parents),
  "first_name": String,
  "last_name": String,
  "date_of_birth": DateTime,
  "phone": String,
  "email": String,
  "photo": String (base64),
  "address": String,
  "course_ids": [ObjectId] (ref: courses),
  "group_ids": [ObjectId] (ref: groups),
  "status": String ["active", "frozen", "graduated", "archived"],
  "enrollment_date": DateTime,
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 3. parents
```json
{
  "_id": ObjectId,
  "user_id": ObjectId (ref: users),
  "first_name": String,
  "last_name": String,
  "phone": String,
  "email": String,
  "student_ids": [ObjectId] (ref: students),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 4. teachers
```json
{
  "_id": ObjectId,
  "user_id": ObjectId (ref: users),
  "first_name": String,
  "last_name": String,
  "phone": String,
  "email": String,
  "photo": String (base64),
  "specialization": [String],
  "courses": [String],
  "group_ids": [ObjectId] (ref: groups),
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 5. support_staff
```json
{
  "_id": ObjectId,
  "user_id": ObjectId (ref: users),
  "first_name": String,
  "last_name": String,
  "phone": String,
  "email": String,
  "photo": String (base64),
  "available_hours": {
    "monday": [{"start": "09:00", "end": "18:00"}],
    "tuesday": [{"start": "09:00", "end": "18:00"}],
    ...
  },
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 6. courses
```json
{
  "_id": ObjectId,
  "name": String ["General English", "IELTS", "SAT", "CEFR", "Kids English"],
  "description": String,
  "duration_months": Number,
  "price_per_month": Number,
  "age_range": {"min": Number, "max": Number},
  "levels": [String],
  "is_active": Boolean,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 7. groups
```json
{
  "_id": ObjectId,
  "name": String,
  "course_id": ObjectId (ref: courses),
  "teacher_id": ObjectId (ref: teachers),
  "student_ids": [ObjectId] (ref: students),
  "schedule": [
    {
      "day": String,
      "start_time": String,
      "end_time": String,
      "room": String
    }
  ],
  "start_date": DateTime,
  "end_date": DateTime,
  "status": String ["active", "completed", "cancelled"],
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 8. attendance
```json
{
  "_id": ObjectId,
  "student_id": ObjectId (ref: students),
  "group_id": ObjectId (ref: groups),
  "teacher_id": ObjectId (ref: teachers),
  "date": DateTime,
  "status": String ["present", "absent", "late", "excused"],
  "notes": String,
  "marked_by": ObjectId (ref: users),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 9. teacher_journal
```json
{
  "_id": ObjectId,
  "group_id": ObjectId (ref: groups),
  "teacher_id": ObjectId (ref: teachers),
  "lesson_date": DateTime,
  "lesson_number": Number,
  "topic": String,
  "materials_covered": String,
  "homework_assigned": String,
  "student_performance": [
    {
      "student_id": ObjectId,
      "participation": Number (1-5),
      "notes": String
    }
  ],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 10. homework
```json
{
  "_id": ObjectId,
  "group_id": ObjectId (ref: groups),
  "teacher_id": ObjectId (ref: teachers),
  "title": String,
  "description": String,
  "attachments": [String] (base64),
  "due_date": DateTime,
  "assigned_date": DateTime,
  "submissions": [
    {
      "student_id": ObjectId,
      "submitted_at": DateTime,
      "content": String,
      "attachments": [String] (base64),
      "grade": Number,
      "feedback": String,
      "graded_at": DateTime
    }
  ],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 11. tests
```json
{
  "_id": ObjectId,
  "test_type": String ["mid_test", "end_of_course"],
  "group_id": ObjectId (ref: groups),
  "course_id": ObjectId (ref: courses),
  "teacher_id": ObjectId (ref: teachers),
  "title": String,
  "test_date": DateTime,
  "max_score": Number,
  "results": [
    {
      "student_id": ObjectId,
      "score": Number,
      "percentage": Number,
      "notes": String,
      "graded_at": DateTime
    }
  ],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 12. leads
```json
{
  "_id": ObjectId,
  "lead_id": String (unique, auto-generated),
  "first_name": String,
  "last_name": String,
  "phone": String (indexed),
  "age": Number,
  "parent_name": String,
  "interested_course": String,
  "source": String ["instagram", "telegram", "facebook", "tiktok", "referral", "banner", "walk_in", "website", "other"],
  "status": String ["new_lead", "contacted", "trial_scheduled", "trial_completed", "negotiation", "enrolled", "lost"],
  "notes": String,
  "assigned_to": ObjectId (ref: users),
  "trial_lesson_date": DateTime,
  "converted_to_student_id": ObjectId (ref: students),
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 13. payments
```json
{
  "_id": ObjectId,
  "payment_id": String (unique, auto-generated),
  "student_id": ObjectId (ref: students),
  "amount": Number,
  "payment_method": String ["cash", "click", "payme"],
  "payment_status": String ["pending", "completed", "failed", "refunded"],
  "payment_type": String ["monthly_fee", "registration", "certificate", "other"],
  "month": String ("YYYY-MM"),
  "transaction_id": String,
  "transaction_date": DateTime,
  "received_by": ObjectId (ref: users),
  "notes": String,
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 14. certificates
```json
{
  "_id": ObjectId,
  "certificate_id": String (unique),
  "student_id": ObjectId (ref: students),
  "course_id": ObjectId (ref: courses),
  "certificate_type": String,
  "issue_date": DateTime,
  "certificate_file": String (base64),
  "issued_by": ObjectId (ref: users),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 15. news
```json
{
  "_id": ObjectId,
  "title": String,
  "content": String,
  "image": String (base64),
  "author_id": ObjectId (ref: users),
  "published": Boolean,
  "published_date": DateTime,
  "target_audience": [String] ["all", "students", "parents", "teachers"],
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 16. chats
```json
{
  "_id": ObjectId,
  "chat_type": String ["direct", "group"],
  "participants": [ObjectId] (ref: users),
  "group_id": ObjectId (ref: groups, optional),
  "name": String,
  "last_message": String,
  "last_message_at": DateTime,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 17. messages
```json
{
  "_id": ObjectId,
  "chat_id": ObjectId (ref: chats),
  "sender_id": ObjectId (ref: users),
  "message": String,
  "attachments": [String] (base64),
  "is_read": Boolean,
  "read_by": [ObjectId],
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 18. support_bookings
```json
{
  "_id": ObjectId,
  "booking_id": String (unique),
  "student_id": ObjectId (ref: students),
  "support_staff_id": ObjectId (ref: support_staff),
  "booking_date": DateTime,
  "start_time": String,
  "end_time": String,
  "duration_minutes": Number,
  "status": String ["scheduled", "completed", "cancelled", "no_show"],
  "topic": String,
  "notes": String,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 19. schedules
```json
{
  "_id": ObjectId,
  "group_id": ObjectId (ref: groups),
  "teacher_id": ObjectId (ref: teachers),
  "date": DateTime,
  "start_time": String,
  "end_time": String,
  "room": String,
  "status": String ["scheduled", "completed", "cancelled", "rescheduled"],
  "cancellation_reason": String,
  "rescheduled_to": DateTime,
  "branch_id": ObjectId (ref: branches),
  "created_at": DateTime,
  "updated_at": DateTime
}
```

### 20. notifications
```json
{
  "_id": ObjectId,
  "user_id": ObjectId (ref: users),
  "title": String,
  "message": String,
  "type": String ["lesson_reminder", "support_reminder", "homework", "test_result", "news", "payment_reminder", "cancellation", "reschedule"],
  "data": Object,
  "is_read": Boolean,
  "sent_at": DateTime,
  "created_at": DateTime
}
```

### 21. audit_logs
```json
{
  "_id": ObjectId,
  "user_id": ObjectId (ref: users),
  "action": String ["create", "update", "delete", "login", "logout", "password_change", "permission_change"],
  "resource_type": String,
  "resource_id": ObjectId,
  "changes": Object,
  "ip_address": String,
  "timestamp": DateTime
}
```

### 22. backups
```json
{
  "_id": ObjectId,
  "backup_date": DateTime,
  "backup_file": String,
  "backup_size": Number,
  "collections_backed_up": [String],
  "status": String ["in_progress", "completed", "failed"],
  "created_by": ObjectId (ref: users),
  "created_at": DateTime
}
```

### 23. system_settings
```json
{
  "_id": ObjectId,
  "academy_name": String,
  "logo": String (base64),
  "phone": String,
  "email": String,
  "address": String,
  "payment_reminder_date": Number (day of month),
  "payment_reminder_time": String ("17:00"),
  "lesson_reminder_minutes": Number (20),
  "support_booking_duration": Number (minutes),
  "support_working_hours": {
    "start": String,
    "end": String
  },
  "updated_by": ObjectId (ref: users),
  "updated_at": DateTime
}
```

### 24. feature_flags
```json
{
  "_id": ObjectId,
  "feature_name": String,
  "is_enabled": Boolean,
  "updated_by": ObjectId (ref: users),
  "updated_at": DateTime
}
```

### 25. branches
```json
{
  "_id": ObjectId,
  "name": String,
  "address": String,
  "phone": String,
  "email": String,
  "is_active": Boolean,
  "created_at": DateTime,
  "updated_at": DateTime
}
```

---

## Indexes for Performance

### Critical Indexes:
- users: login (unique), role, branch_id
- students: student_id (unique), user_id, parent_id, status, branch_id
- attendance: student_id, group_id, date
- payments: student_id, month, payment_status
- leads: phone, status, source, branch_id
- notifications: user_id, is_read, sent_at
- audit_logs: user_id, timestamp, resource_type
- messages: chat_id, created_at
- support_bookings: student_id, support_staff_id, booking_date

---

## Relationships

- students → users (user_id)
- students → parents (parent_id)
- students → groups (group_ids)
- groups → courses (course_id)
- groups → teachers (teacher_id)
- attendance → students, groups, teachers
- payments → students
- leads → students (converted_to_student_id)
- All entities → branches (branch_id)

---

## Scalability Features

1. **Sharding**: By branch_id for multi-branch support
2. **Indexing**: All foreign keys and frequently queried fields
3. **Aggregation Pipelines**: For analytics and reports
4. **Connection Pooling**: For handling 5000+ concurrent users
5. **Document Validation**: Schema validation at MongoDB level
6. **TTL Indexes**: For automatic cleanup of old notifications (30 days)
7. **Backup Strategy**: Daily backups, 30-day retention
