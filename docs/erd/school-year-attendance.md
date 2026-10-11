# School-Year Attendance ERD

This diagram documents the recommended attendance model. `school_year_config`
should be connected to `class_sessions`, not directly to every
`attendance_logs` row.

> **Status:** `school_year_config_id` on `class_sessions` is a proposed
> addition. Do not treat it as deployed until its migration has been reviewed
> and applied. The `attendance_logs → class_sessions` and
> `students → sections` relationships are already part of the integrity model.

```mermaid
erDiagram
    SCHOOL_YEAR_CONFIG {
        int id PK
        varchar school_year_label
        date start_date
        date end_date
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    SCHOOL_HOLIDAYS {
        int id PK
        int school_year_config_id FK
        date holiday_date
        varchar label
    }

    CLASS_SESSIONS {
        int id PK
        int school_year_config_id FK "PROPOSED"
        date session_date
        varchar session_type
        time scheduled_start
        time scheduled_end
        time late_after
        time absent_after
        varchar status
    }

    SECTIONS {
        varchar name PK
        varchar grade PK
        varchar class_session
    }

    STUDENTS {
        int id PK
        varchar student_id UK
        varchar grade FK
        varchar section FK
        timestamptz created_at
        date attendance_eligible_from "PROPOSED"
        varchar archive_status
    }

    ATTENDANCE_LOGS {
        int id PK
        int student_db_id
        varchar student_id
        date attendance_date FK
        varchar session_type FK
        time time_logged
        varchar type
        varchar status
        varchar via
    }

    SCHOOL_YEAR_CONFIG ||--o{ SCHOOL_HOLIDAYS : "id → school_year_config_id"
    SCHOOL_YEAR_CONFIG ||--o{ CLASS_SESSIONS : "id → school_year_config_id (proposed)"
    SECTIONS ||--o{ STUDENTS : "(name, grade) ← (section, grade)"
    CLASS_SESSIONS ||--o{ ATTENDANCE_LOGS : "(session_date, session_type) ← (attendance_date, session_type)"
    STUDENTS ||--o{ ATTENDANCE_LOGS : "student_db_id / student_id (logical owner)"
```

## Why this structure is recommended

1. A school year defines the allowed date range for all of its class sessions.
2. A class session defines the actual morning or afternoon schedule and the
   absence cutoff for one calendar day.
3. An attendance log belongs to that class session. It does **not** need a
   duplicate school-year ID because the year is already available through the
   session.
4. A student should become eligible for automated attendance only on
   `attendance_eligible_from` (proposed). This prevents an import or manual
   registration late in the day from producing an immediate absence.

## Required attendance rules

The application/automation must reject or skip automatic attendance when:

- there is no active school year;
- the date is before `start_date` or after `end_date`;
- the date is a weekend or configured school holiday;
- no class session exists, or its `absent_after` cutoff has not passed;
- `attendance_date` is before the student's `attendance_eligible_from`.

Foreign keys protect identity and ownership. The date-range and cutoff rules
must remain application or database-trigger logic because a foreign key alone
cannot enforce a date being inside a parent row's start/end range.
