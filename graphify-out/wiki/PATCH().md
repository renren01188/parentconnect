# PATCH()

> God node · 100 connections · [C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\api\students\[id]\route.ts](file:///C:/Users/RENREN/Documents/Parentconnect/ParentConnect/parentconnect/src/app/api/students/%5Bid%5D/route.ts#L145)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as PATCH()
    participant P1 as GET()
    participant P2 as POST()
    participant P3 as json
    participant P4 as map
    participant P5 as from
    participant P6 as errorMessage()
    participant P7 as DELETE()
    participant P8 as all
    participant P9 as set()
    participant P10 as createParentReport()
    participant P11 as cleanAttachments()
    participant P12 as getToday()
    participant P13 as isMissingAttachmentsColumn()
    participant P14 as isTransientConnectionError()
    participant P15 as isWeekend()
    participant P16 as getCurrentMinutes()
    participant P17 as logAudit()
    participant P18 as now
    participant P19 as currentSession()
    participant P20 as timeToMinutes()
    participant P21 as sendToParent()
    participant P22 as sendGuidanceToParent()
    participant P23 as toAdviserReport()
    participant P24 as requireIct()
    participant P25 as getPrincipalSession()
    participant P26 as roleLabel()
    participant P27 as buildFullName()
    participant P28 as sendToStaff()
    participant P29 as parseSheet()
    participant P30 as getActiveIct()
    participant P31 as getIctFromToken()
    participant P32 as listMessages()
    participant P33 as toParentReport()
    participant P34 as generateTempPassword()
    participant P35 as createPrincipalMessage()
    participant P36 as insertMessage()
    participant P37 as replyToUnifiedStaffConversation()
    participant P38 as staffRecipients()
    participant P39 as checkLoginProtection()
    participant P40 as failedLoginResult()
    participant P41 as cleanNamePart()
    participant P42 as deliverPrincipalAnnouncement()
    participant P43 as getGuidanceSession()
    participant P44 as findRecipient()
    participant P45 as getScheduledSessionStatus()
    participant P46 as studentFromRelation()
    participant P47 as sendUnifiedStaffMessage()
    participant P48 as latestAdviserReplyIdForStaffConversation()
    participant P49 as getStudentApiActor()
    participant P50 as rememberLoginGuard()
    participant P51 as normalizePrincipalAnnouncementAudience()
    participant P52 as getParentSession()
    participant P53 as groupParentDeletionEmails()
    participant P54 as getVerifiedSubjectTeacher()
    participant P55 as normalizeDepEdEmail()
    participant P56 as rootIdFromConversationId()
    participant P57 as isParticipant()
    participant P58 as getErrorMessage()
    participant P59 as getNowTime()
    participant P60 as notifyRecipients()
    participant P61 as fanOutIctAnnouncement()
    participant P62 as replyToParentConversation()
    participant P63 as currentStaff()
    participant P64 as unauthorizedStudentApi()
    participant P65 as getScheduledStudentLrns()
    participant P66 as clearLoginFailures()
    participant P67 as verifyGoogleRecaptcha()
    participant P68 as processAttendanceSmsJobs()
    participant P69 as mapWithConcurrency()
    participant P70 as suspendDeletionTarget()
    participant P71 as archiveTarget()
    participant P72 as isAllowedSubjectTeacherEmail()
    participant P73 as isSchoolHoliday()
    participant P74 as ensureSessionRow()
    participant P75 as getScheduleStatus()
    participant P76 as queueSmsAfterAttendance()
    participant P77 as consumeEnrollmentAttempt()
    participant P78 as isMissingColumn()
    participant P79 as parseRole()
    participant P80 as logSecurityAlert()
    participant P81 as parentAccountAccessIssue()
    participant P82 as getAdviserSession()
    participant P83 as getReportForAdviser()
    participant P84 as getReportForParent()
    participant P85 as sendParentDeletionScheduledEmail()
    participant P86 as otpHash()
    participant P87 as signingKey()
    participant P88 as deriveClassSession()
    participant P89 as isAdviserIctPair()
    participant P90 as validateSchedule()
    participant P91 as timeToSeconds()
    participant P92 as validateSubmission()
    participant P93 as duplicateResponse()
    participant P94 as isGuidanceIctPair()
    participant P95 as claimJob()
    participant P96 as genericEnrollmentError()
    participant P97 as isPrincipalIctPair()
    participant P98 as getIctName()
    participant P99 as manilaDayBounds()
    participant P100 as uppercasedName()
    participant P101 as trimmed()
    participant P102 as manilaDate()
    participant P103 as sendContactUsNotification()
    participant P104 as sendGuidanceMessageEmail()
    participant P105 as sendAccountDeletionScheduledEmail()
    participant P106 as findAssignedAdviser()
    participant P107 as sendWithEmail()
    participant P108 as hashesMatch()
    participant P109 as adviserFullName()
    participant P110 as validateSingleAttachment()
    participant P111 as positiveInt()
    participant P112 as titleCase()
    participant P113 as normalizePhone()
    participant P114 as isPasswordSet()
    participant P115 as generateTemporaryPassword()
    participant P116 as supabaseErrorMessage()
    participant P117 as normalizeThreadType()
    participant P118 as isTooLong()
    participant P119 as validSecret()
    participant P120 as sendAdviserTempPasswordEmail()
    participant P121 as sendExcuseLetterToAdviserEmail()
    participant P122 as sendGuidanceTempPasswordEmail()
    participant P123 as sendStaffMessageEmail()
    participant P124 as sendIctTempPasswordEmail()
    participant P125 as sendTempPasswordEmail()
    participant P126 as sendPrincipalTempPasswordEmail()
    participant P127 as sendParentReportAdviserEmail()
    participant P128 as sendGuidanceEscalationEmail()
    participant P129 as fullName
    participant P130 as consumePublicRateLimit()
    participant P131 as sendStudentReportAdviserEmail()
    participant P132 as sendStudentConcernParentNotificationEmail()
    participant P133 as sendSubjectTeacherReportNotificationEmail()
    participant P134 as fullName()
    participant P135 as PUT()
    participant P136 as isMissingTableError()
    participant P137 as recipientsFor()
    participant P138 as formatDate()
    participant P139 as resolveStaffByRole()
    participant P140 as printMonthlyAttendance()
    participant P141 as attachmentsFromRow()
    participant P142 as middleware()
    participant P143 as getTodayLogs()
    participant P144 as getIctSession()
    participant P145 as collapseAnnouncementNotifications()
    participant P146 as getParentIds()
    participant P147 as resolveParentIdentities()
    participant P148 as getRememberedLoginGuard()
    participant P149 as listGuidanceTickets()
    participant P150 as retrySupabase()
    participant P151 as getFullName()
    participant P152 as formatTime()
    participant P153 as auditActionDatabaseValues()
    participant P154 as auditRoleDatabaseValues()
    participant P155 as getArchivedStudentLrns()
    participant P156 as getClientIp()
    participant P157 as getDaysInMonth()
    participant P158 as getWeekdaysInMonth()
    participant P159 as isRetryableNetworkError()
    participant P160 as isMissingSchemaError()
    participant P161 as getParentSession()
    participant P162 as announcementKey()
    participant P163 as getPhilippineDateParts()
    participant P164 as getWeekRange()
    participant P165 as buildUnifiedStaffConversations()
    participant P166 as isUpstreamUnavailable()
    participant P167 as parentRecipients()
    participant P168 as getScheduledAttendanceLogs()
    participant P169 as getSchedulesForDates()
    participant P170 as notificationRetentionStart()
    participant P171 as getActiveAdviser()
    participant P172 as clientSubject()
    participant P173 as getPrincipalSession()
    participant P174 as initials()
    participant P175 as handleAddSection()
    participant P176 as toAttendanceStatus()
    participant P177 as isMissingColumnError()
    participant P178 as requirePrincipal()
    participant P179 as toDateString()
    participant P180 as adviserRecipientMatch()
    participant P181 as studentName()
    participant P182 as archiveExpiredAuditLogs()
    participant P183 as parseAuditArchiveFilter()
    participant P184 as toGuidanceReport()
    participant P185 as buildStaffStartedThread()
    participant P186 as toPrincipalReport()
    participant P187 as buildAdviserStartedThread()
    participant P188 as unreadGuidanceMessageIds()
    participant P189 as restoreDeletionTarget()
    participant P190 as normalizeMiddleName()
    participant P191 as syncStaffProfile()
    participant P192 as reconcileParentStudentLinks()
    participant P193 as splitClassGrade()
    participant P194 as restoreArchivedTarget()
    participant P195 as toDbStatus()
    participant P196 as toDbStatus()
    participant P197 as isValidPrincipalNotificationKey()
    participant P198 as targetRole()
    participant P199 as sendExcuseLetterStatusEmail()
    participant P200 as sendGuidancePrincipalEscalationEmail()
    participant P201 as statusFromAdviser()
    participant P202 as sendStudentDeletionRevertedEmail()
    participant P203 as sendAccountDeletionRevertedEmail()
    participant P204 as sendStudentDeletionScheduledEmail()
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
    P2->>+ P89: calls
    P89-->>- P2: return
    P2->>+ P90: calls
    P90-->>- P2: return
    P2->>+ P91: calls
    P91-->>- P2: return
    P2->>+ P92: calls
    P92-->>- P2: return
    P2->>+ P93: calls
    P93-->>- P2: return
    P2->>+ P94: calls
    P94-->>- P2: return
    P2->>+ P95: calls
    P95-->>- P2: return
    P2->>+ P96: calls
    P96-->>- P2: return
    P2->>+ P97: calls
    P97-->>- P2: return
    P2->>+ P98: calls
    P98-->>- P2: return
    P2->>+ P99: calls
    P99-->>- P2: return
    P2->>+ P100: calls
    P100-->>- P2: return
    P2->>+ P101: calls
    P101-->>- P2: return
    P2->>+ P102: calls
    P102-->>- P2: return
    P2->>+ P103: calls
    P103-->>- P2: return
    P2->>+ P104: calls
    P104-->>- P2: return
    P2->>+ P105: calls
    P105-->>- P2: return
    P2->>+ P106: calls
    P106-->>- P2: return
    P2->>+ P107: calls
    P107-->>- P2: return
    P2->>+ P108: calls
    P108-->>- P2: return
    P2->>+ P109: calls
    P109-->>- P2: return
    P2->>+ P110: calls
    P110-->>- P2: return
    P2->>+ P111: calls
    P111-->>- P2: return
    P2->>+ P112: calls
    P112-->>- P2: return
    P2->>+ P113: calls
    P113-->>- P2: return
    P2->>+ P114: calls
    P114-->>- P2: return
    P2->>+ P115: calls
    P115-->>- P2: return
    P2->>+ P116: calls
    P116-->>- P2: return
    P2->>+ P117: calls
    P117-->>- P2: return
    P2->>+ P118: calls
    P118-->>- P2: return
    P2->>+ P119: calls
    P119-->>- P2: return
    P2->>+ P120: calls
    P120-->>- P2: return
    P2->>+ P121: calls
    P121-->>- P2: return
    P2->>+ P122: calls
    P122-->>- P2: return
    P2->>+ P123: calls
    P123-->>- P2: return
    P2->>+ P124: calls
    P124-->>- P2: return
    P2->>+ P125: calls
    P125-->>- P2: return
    P2->>+ P126: calls
    P126-->>- P2: return
    P2->>+ P127: calls
    P127-->>- P2: return
    P2->>+ P128: calls
    P128-->>- P2: return
    P2->>+ P129: calls
    P129-->>- P2: return
    P2->>+ P130: calls
    P130-->>- P2: return
    P2->>+ P131: calls
    P131-->>- P2: return
    P2->>+ P132: calls
    P132-->>- P2: return
    P2->>+ P133: calls
    P133-->>- P2: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P3: calls
    P3-->>- P1: return
    P1->>+ P4: calls
    P4-->>- P1: return
    P1->>+ P5: calls
    P5-->>- P1: return
    P1->>+ P6: calls
    P6-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P134: calls
    P134-->>- P1: return
    P1->>+ P8: calls
    P8-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P135: calls
    P135-->>- P1: return
    P1->>+ P12: calls
    P12-->>- P1: return
    P1->>+ P14: calls
    P14-->>- P1: return
    P1->>+ P15: calls
    P15-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P22: calls
    P22-->>- P1: return
    P1->>+ P26: calls
    P26-->>- P1: return
    P1->>+ P24: calls
    P24-->>- P1: return
    P1->>+ P136: calls
    P136-->>- P1: return
    P1->>+ P25: calls
    P25-->>- P1: return
    P1->>+ P27: calls
    P27-->>- P1: return
    P1->>+ P31: calls
    P31-->>- P1: return
    P1->>+ P30: calls
    P30-->>- P1: return
    P1->>+ P32: calls
    P32-->>- P1: return
    P1->>+ P137: calls
    P137-->>- P1: return
    P1->>+ P138: calls
    P138-->>- P1: return
    P1->>+ P139: calls
    P139-->>- P1: return
    P1->>+ P38: calls
    P38-->>- P1: return
    P1->>+ P43: calls
    P43-->>- P1: return
    P1->>+ P140: calls
    P140-->>- P1: return
    P1->>+ P141: calls
    P141-->>- P1: return
    P1->>+ P49: calls
    P49-->>- P1: return
    P1->>+ P142: calls
    P142-->>- P1: return
    P1->>+ P52: calls
    P52-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
    P1->>+ P58: calls
    P58-->>- P1: return
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
    P1->>+ P63: calls
    P63-->>- P1: return
    P1->>+ P64: calls
    P64-->>- P1: return
    P1->>+ P148: calls
    P148-->>- P1: return
    P1->>+ P149: calls
    P149-->>- P1: return
    P1->>+ P65: calls
    P65-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P1->>+ P74: calls
    P74-->>- P1: return
    P1->>+ P150: calls
    P150-->>- P1: return
    P1->>+ P151: calls
    P151-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P152: calls
    P152-->>- P1: return
    P1->>+ P153: calls
    P153-->>- P1: return
    P1->>+ P154: calls
    P154-->>- P1: return
    P1->>+ P82: calls
    P82-->>- P1: return
    P1->>+ P155: calls
    P155-->>- P1: return
    P1->>+ P80: calls
    P80-->>- P1: return
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
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P4: calls
    P4-->>- P0: return
    P0->>+ P5: calls
    P5-->>- P0: return
    P0->>+ P6: calls
    P6-->>- P0: return
    P0->>+ P7: calls
    P7-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P8: calls
    P8-->>- P0: return
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P11: calls
    P11-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P14: calls
    P14-->>- P0: return
    P0->>+ P17: calls
    P17-->>- P0: return
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P19: calls
    P19-->>- P0: return
    P0->>+ P23: calls
    P23-->>- P0: return
    P0->>+ P24: calls
    P24-->>- P0: return
    P0->>+ P25: calls
    P25-->>- P0: return
    P0->>+ P184: calls
    P184-->>- P0: return
    P0->>+ P31: calls
    P31-->>- P0: return
    P0->>+ P185: calls
    P185-->>- P0: return
    P0->>+ P32: calls
    P32-->>- P0: return
    P0->>+ P186: calls
    P186-->>- P0: return
    P0->>+ P30: calls
    P30-->>- P0: return
    P0->>+ P187: calls
    P187-->>- P0: return
    P0->>+ P43: calls
    P43-->>- P0: return
    P0->>+ P42: calls
    P42-->>- P0: return
    P0->>+ P51: calls
    P51-->>- P0: return
    P0->>+ P52: calls
    P52-->>- P0: return
    P0->>+ P56: calls
    P56-->>- P0: return
    P0->>+ P57: calls
    P57-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P63: calls
    P63-->>- P0: return
    P0->>+ P188: calls
    P188-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P189: calls
    P189-->>- P0: return
    P0->>+ P71: calls
    P71-->>- P0: return
    P0->>+ P70: calls
    P70-->>- P0: return
    P0->>+ P190: calls
    P190-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P79: calls
    P79-->>- P0: return
    P0->>+ P191: calls
    P191-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
    P0->>+ P82: calls
    P82-->>- P0: return
    P0->>+ P83: calls
    P83-->>- P0: return
    P0->>+ P85: calls
    P85-->>- P0: return
    P0->>+ P192: calls
    P192-->>- P0: return
    P0->>+ P89: calls
    P89-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P193: calls
    P193-->>- P0: return
    P0->>+ P161: calls
    P161-->>- P0: return
    P0->>+ P97: calls
    P97-->>- P0: return
    P0->>+ P98: calls
    P98-->>- P0: return
    P0->>+ P194: calls
    P194-->>- P0: return
    P0->>+ P105: calls
    P105-->>- P0: return
    P0->>+ P195: calls
    P195-->>- P0: return
    P0->>+ P171: calls
    P171-->>- P0: return
    P0->>+ P196: calls
    P196-->>- P0: return
    P0->>+ P197: calls
    P197-->>- P0: return
    P0->>+ P198: calls
    P198-->>- P0: return
    P0->>+ P199: calls
    P199-->>- P0: return
    P0->>+ P200: calls
    P200-->>- P0: return
    P0->>+ P201: calls
    P201-->>- P0: return
    P0->>+ P202: calls
    P202-->>- P0: return
    P0->>+ P203: calls
    P203-->>- P0: return
    P0->>+ P204: calls
    P204-->>- P0: return
```

## Connections by Relation

### calls
- [[GET()]] `EXTRACTED`
- [[json]] `INFERRED`
- [[map]] `INFERRED`
- [[from]] `INFERRED`
- [[errorMessage()]] `EXTRACTED`
- [[DELETE()]] `INFERRED`
- [[fullName()]] `EXTRACTED`
- [[all]] `INFERRED`
- [[set()]] `INFERRED`
- [[cleanAttachments()]] `EXTRACTED`
- [[isMissingAttachmentsColumn()]] `EXTRACTED`
- [[isTransientConnectionError()]] `EXTRACTED`
- [[logAudit()]] `INFERRED`
- [[now]] `INFERRED`
- [[currentSession()]] `EXTRACTED`
- [[toAdviserReport()]] `INFERRED`
- [[requireIct()]] `EXTRACTED`
- [[getPrincipalSession()]] `EXTRACTED`
- [[toGuidanceReport()]] `INFERRED`
- [[getIctFromToken()]] `EXTRACTED`

### contains
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`
- [[route.ts]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*