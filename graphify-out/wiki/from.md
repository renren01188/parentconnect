# from

> God node · 68 connections · [C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\ict\StudentProfiles\page.tsx](file:///C:/Users/RENREN/Documents/Parentconnect/ParentConnect/parentconnect/src/app/dashboard/ict/StudentProfiles/page.tsx#L895)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as from
    participant P1 as POST()
    participant P2 as GET()
    participant P3 as PATCH()
    participant P4 as json
    participant P5 as map
    participant P6 as errorMessage()
    participant P7 as DELETE()
    participant P8 as fullName()
    participant P9 as all
    participant P10 as set()
    participant P11 as createParentReport()
    participant P12 as PUT()
    participant P13 as getToday()
    participant P14 as isTransientConnectionError()
    participant P15 as isWeekend()
    participant P16 as getCurrentMinutes()
    participant P17 as currentSession()
    participant P18 as sendGuidanceToParent()
    participant P19 as roleLabel()
    participant P20 as requireIct()
    participant P21 as isMissingTableError()
    participant P22 as getPrincipalSession()
    participant P23 as buildFullName()
    participant P24 as getIctFromToken()
    participant P25 as getActiveIct()
    participant P26 as listMessages()
    participant P27 as recipientsFor()
    participant P28 as formatDate()
    participant P29 as resolveStaffByRole()
    participant P30 as staffRecipients()
    participant P31 as getGuidanceSession()
    participant P32 as printMonthlyAttendance()
    participant P33 as attachmentsFromRow()
    participant P34 as getStudentApiActor()
    participant P35 as middleware()
    participant P36 as getParentSession()
    participant P37 as groupParentDeletionEmails()
    participant P38 as getVerifiedSubjectTeacher()
    participant P39 as getErrorMessage()
    participant P40 as getTodayLogs()
    participant P41 as getIctSession()
    participant P42 as collapseAnnouncementNotifications()
    participant P43 as getParentIds()
    participant P44 as resolveParentIdentities()
    participant P45 as currentStaff()
    participant P46 as unauthorizedStudentApi()
    participant P47 as getRememberedLoginGuard()
    participant P48 as listGuidanceTickets()
    participant P49 as getScheduledStudentLrns()
    participant P50 as isSchoolHoliday()
    participant P51 as ensureSessionRow()
    participant P52 as retrySupabase()
    participant P53 as getFullName()
    participant P54 as parseRole()
    participant P55 as formatTime()
    participant P56 as auditActionDatabaseValues()
    participant P57 as auditRoleDatabaseValues()
    participant P58 as getAdviserSession()
    participant P59 as getArchivedStudentLrns()
    participant P60 as logSecurityAlert()
    participant P61 as getClientIp()
    participant P62 as getDaysInMonth()
    participant P63 as getWeekdaysInMonth()
    participant P64 as isRetryableNetworkError()
    participant P65 as isMissingSchemaError()
    participant P66 as getParentSession()
    participant P67 as announcementKey()
    participant P68 as getPhilippineDateParts()
    participant P69 as getWeekRange()
    participant P70 as buildUnifiedStaffConversations()
    participant P71 as isUpstreamUnavailable()
    participant P72 as parentRecipients()
    participant P73 as getScheduledAttendanceLogs()
    participant P74 as getSchedulesForDates()
    participant P75 as notificationRetentionStart()
    participant P76 as getActiveAdviser()
    participant P77 as clientSubject()
    participant P78 as getPrincipalSession()
    participant P79 as initials()
    participant P80 as handleAddSection()
    participant P81 as toAttendanceStatus()
    participant P82 as isMissingColumnError()
    participant P83 as requirePrincipal()
    participant P84 as toDateString()
    participant P85 as adviserRecipientMatch()
    participant P86 as studentName()
    participant P87 as archiveExpiredAuditLogs()
    participant P88 as parseAuditArchiveFilter()
    participant P89 as cleanAttachments()
    participant P90 as isMissingAttachmentsColumn()
    participant P91 as logAudit()
    participant P92 as now
    participant P93 as timeToMinutes()
    participant P94 as sendToParent()
    participant P95 as toAdviserReport()
    participant P96 as sendToStaff()
    participant P97 as parseSheet()
    participant P98 as toParentReport()
    participant P99 as generateTempPassword()
    participant P100 as createPrincipalMessage()
    participant P101 as insertMessage()
    participant P102 as replyToUnifiedStaffConversation()
    participant P103 as checkLoginProtection()
    participant P104 as failedLoginResult()
    participant P105 as cleanNamePart()
    participant P106 as deliverPrincipalAnnouncement()
    participant P107 as findRecipient()
    participant P108 as getScheduledSessionStatus()
    participant P109 as studentFromRelation()
    participant P110 as sendUnifiedStaffMessage()
    participant P111 as latestAdviserReplyIdForStaffConversation()
    participant P112 as rememberLoginGuard()
    participant P113 as normalizePrincipalAnnouncementAudience()
    participant P114 as normalizeDepEdEmail()
    participant P115 as rootIdFromConversationId()
    participant P116 as isParticipant()
    participant P117 as getNowTime()
    participant P118 as notifyRecipients()
    participant P119 as fanOutIctAnnouncement()
    participant P120 as replyToParentConversation()
    participant P121 as clearLoginFailures()
    participant P122 as verifyGoogleRecaptcha()
    participant P123 as processAttendanceSmsJobs()
    participant P124 as mapWithConcurrency()
    participant P125 as suspendDeletionTarget()
    participant P126 as archiveTarget()
    participant P127 as isAllowedSubjectTeacherEmail()
    participant P128 as getScheduleStatus()
    participant P129 as queueSmsAfterAttendance()
    participant P130 as consumeEnrollmentAttempt()
    participant P131 as isMissingColumn()
    participant P132 as parentAccountAccessIssue()
    participant P133 as getReportForAdviser()
    participant P134 as getReportForParent()
    participant P135 as sendParentDeletionScheduledEmail()
    participant P136 as otpHash()
    participant P137 as signingKey()
    participant P138 as deriveClassSession()
    participant P139 as isAdviserIctPair()
    participant P140 as validateSchedule()
    participant P141 as timeToSeconds()
    participant P142 as validateSubmission()
    participant P143 as duplicateResponse()
    participant P144 as isGuidanceIctPair()
    participant P145 as claimJob()
    participant P146 as genericEnrollmentError()
    participant P147 as isPrincipalIctPair()
    participant P148 as getIctName()
    participant P149 as manilaDayBounds()
    participant P150 as uppercasedName()
    participant P151 as trimmed()
    participant P152 as manilaDate()
    participant P153 as sendContactUsNotification()
    participant P154 as sendGuidanceMessageEmail()
    participant P155 as sendAccountDeletionScheduledEmail()
    participant P156 as findAssignedAdviser()
    participant P157 as sendWithEmail()
    participant P158 as hashesMatch()
    participant P159 as adviserFullName()
    participant P160 as validateSingleAttachment()
    participant P161 as positiveInt()
    participant P162 as titleCase()
    participant P163 as normalizePhone()
    participant P164 as isPasswordSet()
    participant P165 as generateTemporaryPassword()
    participant P166 as supabaseErrorMessage()
    participant P167 as normalizeThreadType()
    participant P168 as isTooLong()
    participant P169 as validSecret()
    participant P170 as sendAdviserTempPasswordEmail()
    participant P171 as sendExcuseLetterToAdviserEmail()
    participant P172 as sendGuidanceTempPasswordEmail()
    participant P173 as sendStaffMessageEmail()
    participant P174 as sendIctTempPasswordEmail()
    participant P175 as sendTempPasswordEmail()
    participant P176 as sendPrincipalTempPasswordEmail()
    participant P177 as sendParentReportAdviserEmail()
    participant P178 as sendGuidanceEscalationEmail()
    participant P179 as fullName
    participant P180 as consumePublicRateLimit()
    participant P181 as sendStudentReportAdviserEmail()
    participant P182 as sendStudentConcernParentNotificationEmail()
    participant P183 as sendSubjectTeacherReportNotificationEmail()
    participant P184 as async()
    participant P185 as exportMonthlySF2()
    participant P186 as filesToAttachments()
    participant P187 as sendSms()
    participant P188 as processJob()
    participant P189 as enqueueAttendanceSms()
    participant P190 as processJob()
    participant P191 as restoreDeletionTarget()
    participant P192 as readSignedGuardCookie()
    participant P193 as reconcileParentStudentLinks()
    participant P194 as syncStaffProfile()
    participant P195 as legacyDuplicateMessage()
    participant P196 as claimJob()
    participant P197 as restoreArchivedTarget()
    participant P198 as makeStudents()
    participant P199 as isParentDeletionSuspended()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P3: calls
    P3-->>- P2: return
    P2->>+ P4: calls
    P4-->>- P2: return
    P2->>+ P5: calls
    P5-->>- P2: return
    P2->>+ P0: calls
    P0-->>- P2: return
    P2->>+ P6: calls
    P6-->>- P2: return
    P2->>+ P7: calls
    P7-->>- P2: return
    P2->>+ P8: calls
    P8-->>- P2: return
    P2->>+ P9: calls
    P9-->>- P2: return
    P2->>+ P10: calls
    P10-->>- P2: return
    P2->>+ P11: calls
    P11-->>- P2: return
    P2->>+ P12: calls
    P12-->>- P2: return
    P2->>+ P13: calls
    P13-->>- P2: return
    P2->>+ P14: calls
    P14-->>- P2: return
    P2->>+ P15: calls
    P15-->>- P2: return
    P2->>+ P16: calls
    P16-->>- P2: return
    P2->>+ P17: calls
    P17-->>- P2: return
    P2->>+ P18: calls
    P18-->>- P2: return
    P2->>+ P19: calls
    P19-->>- P2: return
    P2->>+ P20: calls
    P20-->>- P2: return
    P2->>+ P21: calls
    P21-->>- P2: return
    P2->>+ P22: calls
    P22-->>- P2: return
    P2->>+ P23: calls
    P23-->>- P2: return
    P2->>+ P24: calls
    P24-->>- P2: return
    P2->>+ P25: calls
    P25-->>- P2: return
    P2->>+ P26: calls
    P26-->>- P2: return
    P2->>+ P27: calls
    P27-->>- P2: return
    P2->>+ P28: calls
    P28-->>- P2: return
    P2->>+ P29: calls
    P29-->>- P2: return
    P2->>+ P30: calls
    P30-->>- P2: return
    P2->>+ P31: calls
    P31-->>- P2: return
    P2->>+ P32: calls
    P32-->>- P2: return
    P2->>+ P33: calls
    P33-->>- P2: return
    P2->>+ P34: calls
    P34-->>- P2: return
    P2->>+ P35: calls
    P35-->>- P2: return
    P2->>+ P36: calls
    P36-->>- P2: return
    P2->>+ P37: calls
    P37-->>- P2: return
    P2->>+ P38: calls
    P38-->>- P2: return
    P2->>+ P39: calls
    P39-->>- P2: return
    P2->>+ P40: calls
    P40-->>- P2: return
    P2->>+ P41: calls
    P41-->>- P2: return
    P2->>+ P42: calls
    P42-->>- P2: return
    P2->>+ P43: calls
    P43-->>- P2: return
    P2->>+ P44: calls
    P44-->>- P2: return
    P2->>+ P45: calls
    P45-->>- P2: return
    P2->>+ P46: calls
    P46-->>- P2: return
    P2->>+ P47: calls
    P47-->>- P2: return
    P2->>+ P48: calls
    P48-->>- P2: return
    P2->>+ P49: calls
    P49-->>- P2: return
    P2->>+ P50: calls
    P50-->>- P2: return
    P2->>+ P51: calls
    P51-->>- P2: return
    P2->>+ P52: calls
    P52-->>- P2: return
    P2->>+ P53: calls
    P53-->>- P2: return
    P2->>+ P54: calls
    P54-->>- P2: return
    P2->>+ P55: calls
    P55-->>- P2: return
    P2->>+ P56: calls
    P56-->>- P2: return
    P2->>+ P57: calls
    P57-->>- P2: return
    P2->>+ P58: calls
    P58-->>- P2: return
    P2->>+ P59: calls
    P59-->>- P2: return
    P2->>+ P60: calls
    P60-->>- P2: return
    P2->>+ P61: calls
    P61-->>- P2: return
    P2->>+ P62: calls
    P62-->>- P2: return
    P2->>+ P63: calls
    P63-->>- P2: return
    P2->>+ P64: calls
    P64-->>- P2: return
    P2->>+ P65: calls
    P65-->>- P2: return
    P2->>+ P66: calls
    P66-->>- P2: return
    P2->>+ P67: calls
    P67-->>- P2: return
    P2->>+ P68: calls
    P68-->>- P2: return
    P2->>+ P69: calls
    P69-->>- P2: return
    P2->>+ P70: calls
    P70-->>- P2: return
    P2->>+ P71: calls
    P71-->>- P2: return
    P2->>+ P72: calls
    P72-->>- P2: return
    P2->>+ P73: calls
    P73-->>- P2: return
    P2->>+ P74: calls
    P74-->>- P2: return
    P2->>+ P75: calls
    P75-->>- P2: return
    P2->>+ P76: calls
    P76-->>- P2: return
    P2->>+ P77: calls
    P77-->>- P2: return
    P2->>+ P78: calls
    P78-->>- P2: return
    P2->>+ P79: calls
    P79-->>- P2: return
    P2->>+ P80: calls
    P80-->>- P2: return
    P2->>+ P81: calls
    P81-->>- P2: return
    P2->>+ P82: calls
    P82-->>- P2: return
    P2->>+ P83: calls
    P83-->>- P2: return
    P2->>+ P84: calls
    P84-->>- P2: return
    P2->>+ P85: calls
    P85-->>- P2: return
    P2->>+ P86: calls
    P86-->>- P2: return
    P2->>+ P87: calls
    P87-->>- P2: return
    P2->>+ P88: calls
    P88-->>- P2: return
    P1->>+ P4: calls
    P4-->>- P1: return
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P11: calls
    P11-->>- P1: return
    P1->>+ P89: calls
    P89-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P90: calls
    P90-->>- P1: return
    P1->>+ P14: calls
    P14-->>- P1: return
    P1->>+ P15: calls
    P15-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
    P1->>+ P91: calls
    P91-->>- P1: return
    P1->>+ P92: calls
    P92-->>- P1: return
    P1->>+ P17: calls
    P17-->>- P1: return
    P1->>+ P93: calls
    P93-->>- P1: return
    P1->>+ P94: calls
    P94-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P95: calls
    P95-->>- P1: return
    P1->>+ P20: calls
    P20-->>- P1: return
    P1->>+ P22: calls
    P22-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P23: calls
    P23-->>- P1: return
    P1->>+ P96: calls
    P96-->>- P1: return
    P1->>+ P97: calls
    P97-->>- P1: return
    P1->>+ P25: calls
    P25-->>- P1: return
    P1->>+ P24: calls
    P24-->>- P1: return
    P1->>+ P26: calls
    P26-->>- P1: return
    P1->>+ P98: calls
    P98-->>- P1: return
    P1->>+ P99: calls
    P99-->>- P1: return
    P1->>+ P100: calls
    P100-->>- P1: return
    P1->>+ P101: calls
    P101-->>- P1: return
    P1->>+ P102: calls
    P102-->>- P1: return
    P1->>+ P30: calls
    P30-->>- P1: return
    P1->>+ P103: calls
    P103-->>- P1: return
    P1->>+ P104: calls
    P104-->>- P1: return
    P1->>+ P105: calls
    P105-->>- P1: return
    P1->>+ P106: calls
    P106-->>- P1: return
    P1->>+ P31: calls
    P31-->>- P1: return
    P1->>+ P107: calls
    P107-->>- P1: return
    P1->>+ P108: calls
    P108-->>- P1: return
    P1->>+ P109: calls
    P109-->>- P1: return
    P1->>+ P110: calls
    P110-->>- P1: return
    P1->>+ P111: calls
    P111-->>- P1: return
    P1->>+ P34: calls
    P34-->>- P1: return
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P36: calls
    P36-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P38: calls
    P38-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P39: calls
    P39-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
    P1->>+ P45: calls
    P45-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P121: calls
    P121-->>- P1: return
    P1->>+ P122: calls
    P122-->>- P1: return
    P1->>+ P123: calls
    P123-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P50: calls
    P50-->>- P1: return
    P1->>+ P51: calls
    P51-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P60: calls
    P60-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P1->>+ P134: calls
    P134-->>- P1: return
    P1->>+ P135: calls
    P135-->>- P1: return
    P1->>+ P136: calls
    P136-->>- P1: return
    P1->>+ P137: calls
    P137-->>- P1: return
    P1->>+ P138: calls
    P138-->>- P1: return
    P1->>+ P139: calls
    P139-->>- P1: return
    P1->>+ P140: calls
    P140-->>- P1: return
    P1->>+ P141: calls
    P141-->>- P1: return
    P1->>+ P142: calls
    P142-->>- P1: return
    P1->>+ P143: calls
    P143-->>- P1: return
    P1->>+ P144: calls
    P144-->>- P1: return
    P1->>+ P145: calls
    P145-->>- P1: return
    P1->>+ P146: calls
    P146-->>- P1: return
    P1->>+ P147: calls
    P147-->>- P1: return
    P1->>+ P148: calls
    P148-->>- P1: return
    P1->>+ P149: calls
    P149-->>- P1: return
    P1->>+ P150: calls
    P150-->>- P1: return
    P1->>+ P151: calls
    P151-->>- P1: return
    P1->>+ P152: calls
    P152-->>- P1: return
    P1->>+ P153: calls
    P153-->>- P1: return
    P1->>+ P154: calls
    P154-->>- P1: return
    P1->>+ P155: calls
    P155-->>- P1: return
    P1->>+ P156: calls
    P156-->>- P1: return
    P1->>+ P157: calls
    P157-->>- P1: return
    P1->>+ P158: calls
    P158-->>- P1: return
    P1->>+ P159: calls
    P159-->>- P1: return
    P1->>+ P160: calls
    P160-->>- P1: return
    P1->>+ P161: calls
    P161-->>- P1: return
    P1->>+ P162: calls
    P162-->>- P1: return
    P1->>+ P163: calls
    P163-->>- P1: return
    P1->>+ P164: calls
    P164-->>- P1: return
    P1->>+ P165: calls
    P165-->>- P1: return
    P1->>+ P166: calls
    P166-->>- P1: return
    P1->>+ P167: calls
    P167-->>- P1: return
    P1->>+ P168: calls
    P168-->>- P1: return
    P1->>+ P169: calls
    P169-->>- P1: return
    P1->>+ P170: calls
    P170-->>- P1: return
    P1->>+ P171: calls
    P171-->>- P1: return
    P1->>+ P172: calls
    P172-->>- P1: return
    P1->>+ P173: calls
    P173-->>- P1: return
    P1->>+ P174: calls
    P174-->>- P1: return
    P1->>+ P175: calls
    P175-->>- P1: return
    P1->>+ P176: calls
    P176-->>- P1: return
    P1->>+ P177: calls
    P177-->>- P1: return
    P1->>+ P178: calls
    P178-->>- P1: return
    P1->>+ P179: calls
    P179-->>- P1: return
    P1->>+ P180: calls
    P180-->>- P1: return
    P1->>+ P181: calls
    P181-->>- P1: return
    P1->>+ P182: calls
    P182-->>- P1: return
    P1->>+ P183: calls
    P183-->>- P1: return
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P7: calls
    P7-->>- P0: return
    P0->>+ P184: calls
    P184-->>- P0: return
    P0->>+ P11: calls
    P11-->>- P0: return
    P0->>+ P185: calls
    P185-->>- P0: return
    P0->>+ P12: calls
    P12-->>- P0: return
    P0->>+ P186: calls
    P186-->>- P0: return
    P0->>+ P91: calls
    P91-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P187: calls
    P187-->>- P0: return
    P0->>+ P26: calls
    P26-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P25: calls
    P25-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P27: calls
    P27-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P31: calls
    P31-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P29: calls
    P29-->>- P0: return
    P0->>+ P30: calls
    P30-->>- P0: return
    P0->>+ P32: calls
    P32-->>- P0: return
    P0->>+ P106: calls
    P106-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P188: calls
    P188-->>- P0: return
    P0->>+ P36: calls
    P36-->>- P0: return
    P0->>+ P111: calls
    P111-->>- P0: return
    P0->>+ P110: calls
    P110-->>- P0: return
    P0->>+ P189: calls
    P189-->>- P0: return
    P0->>+ P190: calls
    P190-->>- P0: return
    P0->>+ P40: calls
    P40-->>- P0: return
    P0->>+ P118: calls
    P118-->>- P0: return
    P0->>+ P119: calls
    P119-->>- P0: return
    P0->>+ P43: calls
    P43-->>- P0: return
    P0->>+ P44: calls
    P44-->>- P0: return
    P0->>+ P48: calls
    P48-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P125: calls
    P125-->>- P0: return
    P0->>+ P191: calls
    P191-->>- P0: return
    P0->>+ P49: calls
    P49-->>- P0: return
    P0->>+ P124: calls
    P124-->>- P0: return
    P0->>+ P126: calls
    P126-->>- P0: return
    P0->>+ P51: calls
    P51-->>- P0: return
    P0->>+ P50: calls
    P50-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P133: calls
    P133-->>- P0: return
    P0->>+ P59: calls
    P59-->>- P0: return
    P0->>+ P192: calls
    P192-->>- P0: return
    P0->>+ P193: calls
    P193-->>- P0: return
    P0->>+ P194: calls
    P194-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P78: calls
    P78-->>- P0: return
    P0->>+ P195: calls
    P195-->>- P0: return
    P0->>+ P72: calls
    P72-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P73: calls
    P73-->>- P0: return
    P0->>+ P74: calls
    P74-->>- P0: return
    P0->>+ P196: calls
    P196-->>- P0: return
    P0->>+ P197: calls
    P197-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P198: calls
    P198-->>- P0: return
    P0->>+ P199: calls
    P199-->>- P0: return
```

## Connections by Relation

### calls
- [[POST()]] `INFERRED`
- [[GET()]] `INFERRED`
- [[PATCH()]] `INFERRED`
- [[DELETE()]] `INFERRED`
- [[async()]] `INFERRED`
- [[createParentReport()]] `INFERRED`
- [[exportMonthlySF2()]] `INFERRED`
- [[PUT()]] `INFERRED`
- [[filesToAttachments()]] `INFERRED`
- [[logAudit()]] `INFERRED`
- [[sendToParent()]] `INFERRED`
- [[sendGuidanceToParent()]] `INFERRED`
- [[sendSms()]] `INFERRED`
- [[listMessages()]] `INFERRED`
- [[sendToStaff()]] `INFERRED`
- [[parseSheet()]] `INFERRED`
- [[getActiveIct()]] `INFERRED`
- [[generateTempPassword()]] `INFERRED`
- [[recipientsFor()]] `INFERRED`
- [[createPrincipalMessage()]] `INFERRED`

### contains
- [[page.tsx]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*