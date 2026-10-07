# Graph Report - C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect  (2026-09-21)

## Corpus Check
- 238 files · ~299,410 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2211 nodes · 4113 edges · 49 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 494 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]

## God Nodes (most connected - your core abstractions)
1. `POST()` - 189 edges
2. `GET()` - 149 edges
3. `PATCH()` - 100 edges
4. `json` - 99 edges
5. `map` - 95 edges
6. `from` - 68 edges
7. `errorMessage()` - 36 edges
8. `SECRET` - 28 edges
9. `[loading,   setLoading]` - 28 edges
10. `DELETE()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `makeStudents()` --calls--> `from`  [INFERRED]
  C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\test-export.mjs → C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\ict\StudentProfiles\page.tsx
- `POST()` --calls--> `fullName`  [INFERRED]
  C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\students\transfer-standby\route.ts → C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\components\student-parent-registration\StudentParentRegistration.tsx
- `GET()` --calls--> `studentName()`  [INFERRED]
  C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\students\standby\route.ts → C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\components\student-parent-registration\StudentParentRegistration.tsx
- `PATCH()` --calls--> `statusFromAdviser()`  [INFERRED]
  C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\api\students\[id]\route.ts → C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\api\reports\parent-adviser\_lib.ts
- `sendAnnouncement()` --calls--> `json`  [INFERRED]
  C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\notifications\page.tsx → C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\transfer-level\page.tsx

## Communities

### Community 0 - "Community 0"

Cohesion: 0.01
Nodes (224): getActiveAdviser(), getActiveIct(), logAudit(), logSecurityAlert(), redactAuditData(), SENSITIVE_KEY, archiveExpiredAuditLogs(), AUDIT_ARCHIVE_FILTERS (+216 more)

### Community 1 - "Community 1"

Cohesion: 0.01
Nodes (276): [actionError, setActionError], activeIdx, activeLevel, activeReports, adminMessageKey(), adminMessagesRef, [adminMsgs, setAdminMsgs], adminWasNearBottomRef (+268 more)

### Community 2 - "Community 2"

Cohesion: 0.01
Nodes (223): AUDIT_ACTION_OPTIONS, AUDIT_ROLE_OPTIONS, auditActionDatabaseValues(), auditRoleDatabaseValues(), databaseValuesFor(), matchesAuditActionFilter(), matchesAuditRoleFilter(), normalizeAuditAction() (+215 more)

### Community 3 - "Community 3"

Cohesion: 0.01
Nodes (199): colLetter(), [absentStudents, setAbsent], ACCENT, [activeSection, setActiveSection], [activeTopAction, setActiveTopAction], [adviser, setAdviser], adviserName, allStudents (+191 more)

### Community 4 - "Community 4"

Cohesion: 0.02
Nodes (123): activeAnnouncements, [activeFilter, setActiveFilter], [activeTab, setActiveTab], announcementsFromPayload(), {
    applyServerResult,
    captchaRequired,
    captchaResetSignal,
    captchaToken,
    isLocked,
    lockoutMessage,
    setCaptchaToken,
  }, channel, CHAR_LIMIT, client (+115 more)

### Community 5 - "Community 5"

Cohesion: 0.02
Nodes (113): DEFAULT_ATTEMPTS, fetchJsonWithRetry(), RETRY_DELAY_MS, wait(), analyze(), blocked, [busy, setBusy], [errors, setErrors] (+105 more)

### Community 6 - "Community 6"

Cohesion: 0.02
Nodes (106): [activePanel, setActivePanel], advisoryClass, allSections, [approvalErr, setApprovalErr], [approvalMsg, setApprovalMsg], [approvalPassword, setApprovalPassword], [approvalSent, setApprovalSent], [approvalUnlocked, setApprovalUnlocked] (+98 more)

### Community 7 - "Community 7"

Cohesion: 0.03
Nodes (71): [accountType, setAccountType], [addingNew,       setAddingNew], [addingSection, setAddingSection], availableAdditional, BLANK, blankFamilyMembers(), capitalize(), cfg (+63 more)

### Community 8 - "Community 8"

Cohesion: 0.04
Nodes (65): BREVO_SEND_URL, getBrevoConfig(), sendWithBrevo(), [activeDeletionIds, setActiveDeletionIds], allChecked, availableStudents, [error, setError], filteredStudents (+57 more)

### Community 9 - "Community 9"

Cohesion: 0.03
Nodes (59): ACCEPTED_ATTACHMENT_TYPES, [accepted, setAccepted], [attachmentError, setAttachmentError], attempts, blankForm, captchaContainerRef, captchaWidgetIdRef, currentMonth (+51 more)

### Community 10 - "Community 10"

Cohesion: 0.1
Nodes (53): async(), [attachments, setAttachments], canSend, [conversations, setConversations], disposed, [error,     setError], fallbackRefresh, filesToAttachments() (+45 more)

### Community 11 - "Community 11"

Cohesion: 0.05
Nodes (39): refresh(), GuidanceNotifContext, INITIAL_UNREAD_NOTIFICATIONS, INITIAL_UNREAD_REPORTS, NotifContext, NotificationContext, NotificationProvider(), useNotifContext() (+31 more)

### Community 12 - "Community 12"

Cohesion: 0.05
Nodes (36): active, [apiError,       setApiError], AVATAR_COLORS, count, [current,        setCurrent], done, fetchStandby, getInitials() (+28 more)

### Community 13 - "Community 13"

Cohesion: 0.05
Nodes (37): ALL_DAY_COLS, buildDayColMap(), clr(), COMBINED, dayColMap, __dirname, dow, DOW_MAP (+29 more)

### Community 14 - "Community 14"

Cohesion: 0.05
Nodes (36): activeDeletionKeys, activeParentEmails, activeStudentLrns, [authorization, setAuthorization], [authorizationError, setAuthorizationError], [authorizationPassword, setAuthorizationPassword], batchId, [busy, setBusy] (+28 more)

### Community 15 - "Community 15"

Cohesion: 0.11
Nodes (21): claimJob(), DEFAULT_ATTENDANCE_SMS_BATCH_SIZE, DEFAULT_ATTENDANCE_SMS_CONCURRENCY, errorMessage(), errorResponse(), MAX_SMS_ATTEMPTS, positiveInt(), processAttendanceSmsJobs() (+13 more)

### Community 16 - "Community 16"

Cohesion: 0.16
Nodes (24): config(), RECAPTCHA_VERIFY_URL, verifyGoogleRecaptcha(), callGuard(), checkLoginProtection(), clearLoginFailures(), failedLoginResult(), getClientIp() (+16 more)

### Community 17 - "Community 17"

Cohesion: 0.14
Nodes (14): attempts, containerRef, [error, setError], initialize(), lastResetSignalRef, [loaded, setLoaded], notifyTokenChange, onTokenChangeRef (+6 more)

### Community 18 - "Community 18"

Cohesion: 0.25
Nodes (13): getVerifiedSubjectTeacher(), hashesMatch(), isAllowedSubjectTeacherEmail(), isDepEdEmail(), isLocalTestEmail(), normalizeDepEdEmail(), otpHash(), secret() (+5 more)

### Community 19 - "Community 19"

Cohesion: 0.15
Nodes (10): computeConcernLevel(), CONCERN_PERCENTAGES, DEFAULT_CATEGORIES, INITIAL_NOTIFICATIONS, INITIAL_NOTIFICATIONS_BADGE, INITIAL_REPORTS, INITIAL_UNREAD_NOTIFICATIONS, INITIAL_UNREAD_REPORTS (+2 more)

### Community 20 - "Community 20"

Cohesion: 0.35
Nodes (10): cleanNamePart(), normalizeMiddleNameForMatch(), normalizeNamePart(), sameFamilyName(), isSuffix(), normalizeMiddleName(), normalizeSf1Name(), normalizeSuffix() (+2 more)

### Community 21 - "Community 21"

Cohesion: 0.22
Nodes (8): d, __dirname, m, merges, r, v, wb, ws

### Community 22 - "Community 22"

Cohesion: 0.43
Nodes (7): buildAttendanceSmsMessage(), enqueueAttendanceSms(), formatAttendanceSmsDate(), formatAttendanceSmsTime(), MONTHS, normalizePhilippineMobile(), registeredParent()

### Community 23 - "Community 23"

Cohesion: 0.39
Nodes (6): findAssignedAdviser(), normalize(), normalizeCategory(), toAdviserStudentReport(), toDbStatus(), toUiStatus()

### Community 24 - "Community 24"

Cohesion: 0.4
Nodes (3): FEATURES, HOW_IT_WORKS, ROLES

### Community 25 - "Community 25"

Cohesion: 0.5
Nodes (3): supabase, supabaseKey, supabaseUrl

### Community 26 - "Community 26"

Cohesion: 0.5
Nodes (3): supabaseAnonKey, supabaseBrowser, supabaseUrl

### Community 27 - "Community 27"

Cohesion: 0.67
Nodes (1): metadata

### Community 28 - "Community 28"

Cohesion: 0.67
Nodes (2): initialParentCases, initialStudentCases

### Community 29 - "Community 29"

Cohesion: 0.67
Nodes (1): SITE_KEY

### Community 30 - "Community 30"

Cohesion: 1.0
Nodes (1): eslintConfig

### Community 31 - "Community 31"

Cohesion: 1.0
Nodes (1): nextConfig

### Community 32 - "Community 32"

Cohesion: 1.0
Nodes (1): config

### Community 33 - "Community 33"

Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"

Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"

Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"

Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"

Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"

Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"

Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"

Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"

Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"

Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"

Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"

Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"

Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"

Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"

Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"

Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **918 isolated node(s):** `eslintConfig`, `__dirname`, `wb`, `ws`, `r` (+913 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 30`** (2 nodes): `eslint.config.mjs`, `eslintConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `next.config.ts`, `nextConfig`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `postcss.config.mjs`, `config`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `layout.tsx`, `AdviserLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `page.tsx`, `AddStudentPage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `layout.tsx`, `GuidanceLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `layout.tsx`, `ICTLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `layout.tsx`, `ParentLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `layout.tsx`, `PrincipalLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `HeroSection.tsx`, `HeroSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `LoginCard.tsx`, `LoginCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `LogoutButton.tsx`, `LogoutButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `ReportAudienceChooser.tsx`, `ReportAudienceChooser()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `useReportMessagesRealtime.ts`, `useReportMessagesRealtime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `useStaffMessagesRealtime.ts`, `useStaffMessagesRealtime()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `studentAge.ts`, `getStudentAge()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `globals.css.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `ResolveConfirmationModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.