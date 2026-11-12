# ParentConnect ERD Final-Defense Reporting Script

Use the paragraph that corresponds to the figure currently displayed. Replace **Figure X** with the final figure number in the manuscript. The speaker may shorten the technical entity names when presenting, but should retain the workflow and relationships described below.

## Important figure-use note

This folder contains master schemas, detailed role views, Thesis-Set copies, and one dbdiagram-compatible export. They are not all separate figures that must be discussed independently:

- `04-parent-full-schema-dbdiagram-compatible.dbml` is an export-compatible copy of the Parent Full Schema. Use the **Parent Full Schema** script for it; do not present it as another figure.
- The four diagrams under `Parent/Thesis-Set` are the recommended readable Parent figures. Their content consolidates the more detailed Parent diagrams.
- `05-guidance-operations`, `06-ict-operations`, and `07-principal-operations` are role-level master figures. Their lettered files are focused expansions. If both appear in the thesis, use the master script for the overview and the focused script for the detailed figure.

---

## Parent ERDs

### Figure X. Parent Full Schema Entity Relationship Diagram

> “This ERD presents the complete Parent-facing database structure of ParentConnect. The `parents` and `students` entities are central because they connect a guardian to the correct learner and to the services available for that learner. The schema combines linked learners, attendance history, excuse requests, reports, conversations, guidance escalation, announcements, notifications, account protection, and deletion notices. Related staff entities are included only where they are needed to show how parents receive information or communicate with authorized school personnel.”

### Figure X. Parent Operations Entity Relationship Diagram

> “This ERD focuses on the parent’s regular operational records. The `parents`, `students`, and `parent_student_links` entities identify the guardian and the learner being monitored. Attendance history, class sessions, excuse requests, household contacts, notification read records, and school-year settings are connected to provide parents with accurate learner information throughout the school year.”

### Figure X. Parent Identity and Linked Learners Entity Relationship Diagram

> “This ERD presents how ParentConnect connects guardians to their learners. The `parents` entity stores guardian account and contact information, while the `students` entity stores learner details. The `parent_student_links` entity supports parent-to-student relationships, `student_family_members` stores household contacts, and `sections` identifies the learner’s class placement.”

### Figure X. Parent Attendance and Notifications Entity Relationship Diagram

> “This ERD presents the parent-facing attendance and alert workflow. The `attendance_logs` entity stores learner attendance events and is connected to `class_sessions` for session context. Parent read receipts and the email and SMS job records show whether attendance alerts were prepared, sent, delivered, or encountered an error.”

### Figure X. Parent Reports, Guidance, and Announcements Entity Relationship Diagram

> “This ERD presents parent reporting, communication, guidance escalation, and announcement delivery. The `parent_adviser_reports` entity stores the concern and assignment, while `parent_adviser_report_messages` preserves the conversation connected to that report. The `parent_report_guidance_tickets` entity records guidance referrals, and `parent_announcement_notifications` records announcements delivered to the parent.”

### Figure X. Parent Account Security and Deletion Notices Entity Relationship Diagram

> “This ERD presents parent account protection and deletion-notice records. Verification and password-reset OTP entities support secure account recovery, while rate-limit and login-guard records reduce unauthorized attempts. The scheduled-deletion and parent-deletion-notification entities ensure that parents are informed when a related record enters the approved deletion lifecycle.”

### Detailed Parent Attendance History and Read-State ERD

> “This focused ERD shows how parents view attendance history. Attendance records are linked to the student and the scheduled class session, while `parent_attendance_notification_reads` records when a parent has viewed an attendance notice. This relationship provides both attendance transparency and notification accountability.”

### Detailed Parent Attendance Alert Delivery ERD

> “This ERD focuses on how attendance alerts are delivered. An attendance event creates related email or SMS delivery jobs, which store the intended recipient, message, sending attempts, provider information, delivery status, and errors. Parent notification preferences determine the appropriate delivery channel.”

### Detailed Parent Reports, Conversations, and Guidance ERD

> “This ERD presents the parent report workflow. Parent concerns are stored in `parent_adviser_reports`, messages are stored in `parent_adviser_report_messages`, and escalation to Guidance is stored in `parent_report_guidance_tickets`. The structure keeps the submitted concern, conversation history, assigned personnel, and escalation status connected to one case.”

### Detailed Parent Notifications and Announcement Delivery ERD

> “This ERD presents the parent notification inbox. `parent_announcement_notifications` records the announcements delivered to each parent, including the content, source, learner context, and read status. The source field identifies whether the announcement came from an Adviser, Guidance Counselor, Principal, or ICT Administrator.”

### Detailed Parent Deletion Notices and Account State ERD

> “This ERD presents parent-facing deletion notices. A scheduled-deletion record contains the target, reason, approval status, and scheduled deletion date, while `parent_deletion_notifications` records the notice provided to the affected parent. ICT approval is shown because an approved deletion request controls the record’s lifecycle.”

### Detailed Parent Verification, Recovery, and Login Protection ERD

> “This ERD presents the security controls for Parent accounts. Verification OTPs support registration or account confirmation, while password-reset OTPs support recovery. The rate-limit and login-attempt guard entities use protected hashes instead of direct parent identifiers, helping prevent repeated unauthorized access attempts without exposing personal account data.”

---

## Adviser ERDs

### Figure X. Adviser Operations Entity Relationship Diagram

> “This ERD presents the Adviser’s daily learner-management operations. The `advisers` entity is connected to student, parent, class, attendance, excuse-request, family-context, student-remark, and school-year records. These relationships allow the Adviser to monitor assigned learners, review attendance-related information, manage class placement information, and maintain learner remarks.”

### Figure X. Adviser Attendance Delivery Jobs Entity Relationship Diagram

> “This ERD presents the delivery process for parent attendance alerts. The `attendance_logs` entity stores learner attendance events, while `attendance_email_jobs` and `attendance_sms_jobs` store the related email and SMS requests. These job records maintain recipient details, sending attempts, provider responses, delivery status, and errors for reliable notification tracking.”

### Figure X. Adviser Messages, Announcements, and Profile Entity Relationship Diagram

> “This ERD presents the Adviser’s account, communications, and notification records. The `advisers` entity stores profile and assignment information. Staff-message and adviser-principal message entities support communication with school personnel, while `adviser_notification_reads` records whether an Adviser has viewed a notification. Adviser-created announcements are stored separately for controlled distribution.”

### Figure X. Adviser Reports, Conversations, and Guidance Entity Relationship Diagram

> “This ERD presents the Adviser’s report-handling and escalation workflow. The `parent_adviser_reports` entity stores submitted concerns, learner details, adviser assignment, status, and escalation information. The `parent_adviser_report_messages` entity preserves the parent–Adviser conversation. If the concern requires further intervention, `parent_report_guidance_tickets` records its referral to Guidance, including the assigned counselor and decision status.”

### Figure X. Adviser Announcements and Parent Delivery Entity Relationship Diagram

> “This ERD presents how an Adviser creates announcements for a class and how ParentConnect delivers them to the correct parents. The `adviser_announcements` entity stores the announcement title, message, intended grade or section, and creation date. Parent, student, and parent-student-link records identify recipients, while `parent_announcement_notifications` records delivery and read status.”

### Figure X. Adviser Student Administration and Deletion Requests Entity Relationship Diagram

> “This ERD presents Adviser-related administrative changes and deletion requests. Adviser change requests, assignment history, and scheduled adviser transfers record changes to class assignments. Scheduled-deletion entities record the target, requester, reason, approval status, and scheduled deletion date, while ICT Administrators are shown because they review or approve the required administrative actions.”

---

## Guidance Counselor ERDs

### Figure X. Guidance Operations Entity Relationship Diagram

> “This ERD presents the overall Guidance Office workflow. The `guidance_counselors` entity is connected to reports, guidance tickets, saved reports, read-state records, profile-change requests, ICT messages, and parent-announcement delivery. Guidance Counselors review escalated concerns or direct parent tickets, communicate with parents, document case decisions, and escalate unresolved cases to the Principal.”

### Figure X. Guidance Reports, Tickets, and Read-State Entity Relationship Diagram

> “This ERD focuses on the Guidance case queue. Reports and parent–Adviser conversation records provide the case history, while guidance tickets record the referral, assigned counselor, decision, and status. Favorite and read-state records help each counselor organize and monitor their assigned cases without altering the original case record.”

### Figure X. Guidance Profile, Messages, and Incoming Announcements Entity Relationship Diagram

> “This ERD presents Guidance account updates, communication with ICT, notification read state, and incoming announcements. The profile-change request records proposed account updates, while staff-message records support authorized communication with ICT personnel. Notification-read and incoming-announcement records allow Guidance Counselors to view relevant updates from the Principal and ICT Office.”

### Figure X. Guidance Announcements and Parent Delivery Entity Relationship Diagram

> “This ERD presents announcements authored by the Guidance Office. The `guidance_announcements` entity stores the announcement content, intended audience, status, and schedule. The parent-notification records identify the parent recipients and retain delivery and read information, allowing the Guidance Office to communicate authorized school guidance information to families.”

---

## ICT Administrator ERDs

### Figure X. ICT Operations Entity Relationship Diagram

> “This ERD presents the ICT Administrator’s overall operational responsibilities. The `ict_admins` entity is linked to audit records, announcement delivery, attendance-notification settings, email and SMS jobs, SMS provider events, scheduled deletions, deletion-email jobs, and the staff employee-ID registry. These relationships support system configuration, account administration, delivery monitoring, approval workflows, and accountability.”

### Figure X. ICT User Management and Approvals Entity Relationship Diagram

> “This ERD presents ICT-managed user and staff administration. Staff account profiles are connected to the employee-ID registry to maintain unique role assignments. Adviser change requests, assignment history, and transfer records show how ICT reviews, approves, and records updates to staff assignments.”

### Figure X. ICT Deletion Workflow Entity Relationship Diagram

> “This ERD presents the controlled deletion workflow. The `scheduled_deletions` entity stores the requested target, reason, request date, status, approval information, and deletion schedule. Requester and target entities identify who made the request and which records are affected, while deletion-email jobs document the notifications sent before deletion occurs.”

### Figure X. ICT Attendance Notifications and Delivery Entity Relationship Diagram

> “This ERD presents the ICT configuration and monitoring of attendance alerts. Attendance-notification settings define whether email and SMS channels are enabled. Attendance events generate email and SMS jobs, and SMS provider-event records preserve provider responses, delivery updates, and reconciliation information for monitoring and troubleshooting.”

### Figure X. ICT Announcements, Notifications, and Audit Entity Relationship Diagram

> “This ERD presents ICT announcements, staff-message threads, notification read state, incoming Principal announcements, and audit records. The audit log records important system and user actions, helping ICT maintain accountability. The announcement and messaging entities support authorized communication across school roles.”

---

## Principal ERDs

### Figure X. Principal Operations Entity Relationship Diagram

> “This ERD presents the Principal’s overall monitoring and resolution role. The `principals` entity is connected to escalated reports, guidance tickets, staff correspondence, announcements, notification-read records, attendance context, and student reports. These relationships allow the Principal to monitor school information and provide final decisions for concerns that remain unresolved after Adviser and Guidance intervention.”

### Figure X. Principal Reports, Guidance, and Resolution Entity Relationship Diagram

> “This ERD focuses on the final stage of the report escalation workflow. Escalated parent reports, Adviser conversations, Guidance tickets, and Adviser-created student reports provide the Principal with the required case context. The Principal uses this information to review the unresolved concern, communicate a decision when needed, and provide the final resolution.”

### Figure X. Principal Messages, Announcements, and Notifications Entity Relationship Diagram

> “This ERD presents the Principal’s communications and announcements. Principal announcements are stored with their intended audience and scheduling information. Notification-read records show which updates the Principal has viewed, while staff correspondence records document communication between the Principal and Advisers.”

### Figure X. Principal Attendance and Student Summary Entity Relationship Diagram

> “This ERD presents the information used by the Principal to monitor attendance and learner summaries. Attendance logs are connected to class sessions, student profiles, linked parents, and school-year configuration. This structure provides the Principal with a school-level view of attendance patterns and learner information for monitoring and decision-making.”

---

## Reporting and Escalation Script for Oral Defense

Use this after showing the Adviser Reports, Guidance Reports, or Principal Reports figure:

> “The reporting module is built around the `parent_adviser_reports` entity, which stores the submitted concern, involved learner, assigned Adviser, status, and escalation information. The `parent_adviser_report_messages` entity stores the complete conversation associated with each report. The Adviser is the first level of review and may resolve the concern or escalate it to Guidance. Guidance receives the referral through `parent_report_guidance_tickets`, where the assigned counselor records the ticket decision and case status. If the concern remains unresolved, it is escalated to the Principal for final resolution. This structure ensures that every report maintains its history, assigned personnel, escalation path, and final outcome for accountability.”

## Closing Statement for All ERD Figures

> “The ERDs are separated by user role and workflow to make the database structure readable. They are connected through shared entities such as students, parents, attendance records, reports, notifications, and staff accounts. Together, the ERDs represent the complete ParentConnect data structure and support traceable workflows from data entry to notification and final case resolution.”
