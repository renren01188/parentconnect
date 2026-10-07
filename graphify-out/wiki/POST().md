# POST()

> God node · 189 connections · [C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\students\transfer-standby\route.ts](file:///C:/Users/RENREN/Documents/Parentconnect/ParentConnect/parentconnect/src/app/dashboard/adviser/students/transfer-standby/route.ts#L25)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as POST()
    participant P1 as GET()
    participant P2 as PATCH()
    participant P3 as json
    participant P4 as map
    participant P5 as from
    participant P6 as errorMessage()
    participant P7 as DELETE()
    participant P8 as fullName()
    participant P9 as all
    participant P10 as set()
    participant P11 as cleanAttachments()
    participant P12 as isMissingAttachmentsColumn()
    participant P13 as isTransientConnectionError()
    participant P14 as logAudit()
    participant P15 as now
    participant P16 as currentSession()
    participant P17 as toAdviserReport()
    participant P18 as requireIct()
    participant P19 as getPrincipalSession()
    participant P20 as toGuidanceReport()
    participant P21 as getIctFromToken()
    participant P22 as buildStaffStartedThread()
    participant P23 as listMessages()
    participant P24 as toPrincipalReport()
    participant P25 as getActiveIct()
    participant P26 as buildAdviserStartedThread()
    participant P27 as getGuidanceSession()
    participant P28 as deliverPrincipalAnnouncement()
    participant P29 as normalizePrincipalAnnouncementAudience()
    participant P30 as getParentSession()
    participant P31 as rootIdFromConversationId()
    participant P32 as isParticipant()
    participant P33 as getIctSession()
    participant P34 as getParentIds()
    participant P35 as currentStaff()
    participant P36 as unreadGuidanceMessageIds()
    participant P37 as listGuidanceTickets()
    participant P38 as restoreDeletionTarget()
    participant P39 as archiveTarget()
    participant P40 as suspendDeletionTarget()
    participant P41 as normalizeMiddleName()
    participant P42 as getFullName()
    participant P43 as parseRole()
    participant P44 as syncStaffProfile()
    participant P45 as getReportForParent()
    participant P46 as getAdviserSession()
    participant P47 as getReportForAdviser()
    participant P48 as sendParentDeletionScheduledEmail()
    participant P49 as reconcileParentStudentLinks()
    participant P50 as isAdviserIctPair()
    participant P51 as isGuidanceIctPair()
    participant P52 as splitClassGrade()
    participant P53 as getParentSession()
    participant P54 as isPrincipalIctPair()
    participant P55 as getIctName()
    participant P56 as restoreArchivedTarget()
    participant P57 as sendAccountDeletionScheduledEmail()
    participant P58 as toDbStatus()
    participant P59 as getActiveAdviser()
    participant P60 as toDbStatus()
    participant P61 as isValidPrincipalNotificationKey()
    participant P62 as targetRole()
    participant P63 as sendExcuseLetterStatusEmail()
    participant P64 as sendGuidancePrincipalEscalationEmail()
    participant P65 as statusFromAdviser()
    participant P66 as sendStudentDeletionRevertedEmail()
    participant P67 as sendAccountDeletionRevertedEmail()
    participant P68 as sendStudentDeletionScheduledEmail()
    participant P69 as createParentReport()
    participant P70 as PUT()
    participant P71 as getToday()
    participant P72 as isWeekend()
    participant P73 as getCurrentMinutes()
    participant P74 as sendGuidanceToParent()
    participant P75 as roleLabel()
    participant P76 as isMissingTableError()
    participant P77 as buildFullName()
    participant P78 as recipientsFor()
    participant P79 as formatDate()
    participant P80 as resolveStaffByRole()
    participant P81 as staffRecipients()
    participant P82 as printMonthlyAttendance()
    participant P83 as attachmentsFromRow()
    participant P84 as getStudentApiActor()
    participant P85 as middleware()
    participant P86 as groupParentDeletionEmails()
    participant P87 as getVerifiedSubjectTeacher()
    participant P88 as getErrorMessage()
    participant P89 as getTodayLogs()
    participant P90 as collapseAnnouncementNotifications()
    participant P91 as resolveParentIdentities()
    participant P92 as unauthorizedStudentApi()
    participant P93 as getRememberedLoginGuard()
    participant P94 as getScheduledStudentLrns()
    participant P95 as isSchoolHoliday()
    participant P96 as ensureSessionRow()
    participant P97 as retrySupabase()
    participant P98 as formatTime()
    participant P99 as auditActionDatabaseValues()
    participant P100 as auditRoleDatabaseValues()
    participant P101 as getArchivedStudentLrns()
    participant P102 as logSecurityAlert()
    participant P103 as getClientIp()
    participant P104 as getDaysInMonth()
    participant P105 as getWeekdaysInMonth()
    participant P106 as isRetryableNetworkError()
    participant P107 as isMissingSchemaError()
    participant P108 as announcementKey()
    participant P109 as getPhilippineDateParts()
    participant P110 as getWeekRange()
    participant P111 as buildUnifiedStaffConversations()
    participant P112 as isUpstreamUnavailable()
    participant P113 as parentRecipients()
    participant P114 as getScheduledAttendanceLogs()
    participant P115 as getSchedulesForDates()
    participant P116 as notificationRetentionStart()
    participant P117 as clientSubject()
    participant P118 as getPrincipalSession()
    participant P119 as initials()
    participant P120 as handleAddSection()
    participant P121 as toAttendanceStatus()
    participant P122 as isMissingColumnError()
    participant P123 as requirePrincipal()
    participant P124 as toDateString()
    participant P125 as adviserRecipientMatch()
    participant P126 as studentName()
    participant P127 as archiveExpiredAuditLogs()
    participant P128 as parseAuditArchiveFilter()
    participant P129 as timeToMinutes()
    participant P130 as sendToParent()
    participant P131 as sendToStaff()
    participant P132 as parseSheet()
    participant P133 as toParentReport()
    participant P134 as generateTempPassword()
    participant P135 as createPrincipalMessage()
    participant P136 as insertMessage()
    participant P137 as replyToUnifiedStaffConversation()
    participant P138 as checkLoginProtection()
    participant P139 as failedLoginResult()
    participant P140 as cleanNamePart()
    participant P141 as findRecipient()
    participant P142 as getScheduledSessionStatus()
    participant P143 as studentFromRelation()
    participant P144 as sendUnifiedStaffMessage()
    participant P145 as latestAdviserReplyIdForStaffConversation()
    participant P146 as rememberLoginGuard()
    participant P147 as normalizeDepEdEmail()
    participant P148 as getNowTime()
    participant P149 as notifyRecipients()
    participant P150 as fanOutIctAnnouncement()
    participant P151 as replyToParentConversation()
    participant P152 as clearLoginFailures()
    participant P153 as verifyGoogleRecaptcha()
    participant P154 as processAttendanceSmsJobs()
    participant P155 as mapWithConcurrency()
    participant P156 as isAllowedSubjectTeacherEmail()
    participant P157 as getScheduleStatus()
    participant P158 as queueSmsAfterAttendance()
    participant P159 as consumeEnrollmentAttempt()
    participant P160 as isMissingColumn()
    participant P161 as parentAccountAccessIssue()
    participant P162 as otpHash()
    participant P163 as signingKey()
    participant P164 as deriveClassSession()
    participant P165 as validateSchedule()
    participant P166 as timeToSeconds()
    participant P167 as validateSubmission()
    participant P168 as duplicateResponse()
    participant P169 as claimJob()
    participant P170 as genericEnrollmentError()
    participant P171 as manilaDayBounds()
    participant P172 as uppercasedName()
    participant P173 as trimmed()
    participant P174 as manilaDate()
    participant P175 as sendContactUsNotification()
    participant P176 as sendGuidanceMessageEmail()
    participant P177 as findAssignedAdviser()
    participant P178 as sendWithEmail()
    participant P179 as hashesMatch()
    participant P180 as adviserFullName()
    participant P181 as validateSingleAttachment()
    participant P182 as positiveInt()
    participant P183 as titleCase()
    participant P184 as normalizePhone()
    participant P185 as isPasswordSet()
    participant P186 as generateTemporaryPassword()
    participant P187 as supabaseErrorMessage()
    participant P188 as normalizeThreadType()
    participant P189 as isTooLong()
    participant P190 as validSecret()
    participant P191 as sendAdviserTempPasswordEmail()
    participant P192 as sendExcuseLetterToAdviserEmail()
    participant P193 as sendGuidanceTempPasswordEmail()
    participant P194 as sendStaffMessageEmail()
    participant P195 as sendIctTempPasswordEmail()
    participant P196 as sendTempPasswordEmail()
    participant P197 as sendPrincipalTempPasswordEmail()
    participant P198 as sendParentReportAdviserEmail()
    participant P199 as sendGuidanceEscalationEmail()
    participant P200 as fullName
    participant P201 as consumePublicRateLimit()
    participant P202 as sendStudentReportAdviserEmail()
    participant P203 as sendStudentConcernParentNotificationEmail()
    participant P204 as sendSubjectTeacherReportNotificationEmail()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
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
    P1->>+ P8: calls
    P8-->>- P1: return
    P1->>+ P9: calls
    P9-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P69: calls
    P69-->>- P1: return
    P1->>+ P70: calls
    P70-->>- P1: return
    P1->>+ P71: calls
    P71-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P72: calls
    P72-->>- P1: return
    P1->>+ P73: calls
    P73-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
    P1->>+ P74: calls
    P74-->>- P1: return
    P1->>+ P75: calls
    P75-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P76: calls
    P76-->>- P1: return
    P1->>+ P19: calls
    P19-->>- P1: return
    P1->>+ P77: calls
    P77-->>- P1: return
    P1->>+ P21: calls
    P21-->>- P1: return
    P1->>+ P25: calls
    P25-->>- P1: return
    P1->>+ P23: calls
    P23-->>- P1: return
    P1->>+ P78: calls
    P78-->>- P1: return
    P1->>+ P79: calls
    P79-->>- P1: return
    P1->>+ P80: calls
    P80-->>- P1: return
    P1->>+ P81: calls
    P81-->>- P1: return
    P1->>+ P27: calls
    P27-->>- P1: return
    P1->>+ P82: calls
    P82-->>- P1: return
    P1->>+ P83: calls
    P83-->>- P1: return
    P1->>+ P84: calls
    P84-->>- P1: return
    P1->>+ P85: calls
    P85-->>- P1: return
    P1->>+ P30: calls
    P30-->>- P1: return
    P1->>+ P86: calls
    P86-->>- P1: return
    P1->>+ P87: calls
    P87-->>- P1: return
    P1->>+ P88: calls
    P88-->>- P1: return
    P1->>+ P89: calls
    P89-->>- P1: return
    P1->>+ P33: calls
    P33-->>- P1: return
    P1->>+ P90: calls
    P90-->>- P1: return
    P1->>+ P34: calls
    P34-->>- P1: return
    P1->>+ P91: calls
    P91-->>- P1: return
    P1->>+ P35: calls
    P35-->>- P1: return
    P1->>+ P92: calls
    P92-->>- P1: return
    P1->>+ P93: calls
    P93-->>- P1: return
    P1->>+ P37: calls
    P37-->>- P1: return
    P1->>+ P94: calls
    P94-->>- P1: return
    P1->>+ P95: calls
    P95-->>- P1: return
    P1->>+ P96: calls
    P96-->>- P1: return
    P1->>+ P97: calls
    P97-->>- P1: return
    P1->>+ P42: calls
    P42-->>- P1: return
    P1->>+ P43: calls
    P43-->>- P1: return
    P1->>+ P98: calls
    P98-->>- P1: return
    P1->>+ P99: calls
    P99-->>- P1: return
    P1->>+ P100: calls
    P100-->>- P1: return
    P1->>+ P46: calls
    P46-->>- P1: return
    P1->>+ P101: calls
    P101-->>- P1: return
    P1->>+ P102: calls
    P102-->>- P1: return
    P1->>+ P103: calls
    P103-->>- P1: return
    P1->>+ P104: calls
    P104-->>- P1: return
    P1->>+ P105: calls
    P105-->>- P1: return
    P1->>+ P106: calls
    P106-->>- P1: return
    P1->>+ P107: calls
    P107-->>- P1: return
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P108: calls
    P108-->>- P1: return
    P1->>+ P109: calls
    P109-->>- P1: return
    P1->>+ P110: calls
    P110-->>- P1: return
    P1->>+ P111: calls
    P111-->>- P1: return
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P59: calls
    P59-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P118: calls
    P118-->>- P1: return
    P1->>+ P119: calls
    P119-->>- P1: return
    P1->>+ P120: calls
    P120-->>- P1: return
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
    P1->>+ P128: calls
    P128-->>- P1: return
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
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P10: calls
    P10-->>- P0: return
    P0->>+ P69: calls
    P69-->>- P0: return
    P0->>+ P11: calls
    P11-->>- P0: return
    P0->>+ P71: calls
    P71-->>- P0: return
    P0->>+ P12: calls
    P12-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P72: calls
    P72-->>- P0: return
    P0->>+ P73: calls
    P73-->>- P0: return
    P0->>+ P14: calls
    P14-->>- P0: return
    P0->>+ P15: calls
    P15-->>- P0: return
    P0->>+ P16: calls
    P16-->>- P0: return
    P0->>+ P129: calls
    P129-->>- P0: return
    P0->>+ P130: calls
    P130-->>- P0: return
    P0->>+ P74: calls
    P74-->>- P0: return
    P0->>+ P17: calls
    P17-->>- P0: return
    P0->>+ P18: calls
    P18-->>- P0: return
    P0->>+ P19: calls
    P19-->>- P0: return
    P0->>+ P75: calls
    P75-->>- P0: return
    P0->>+ P77: calls
    P77-->>- P0: return
    P0->>+ P131: calls
    P131-->>- P0: return
    P0->>+ P132: calls
    P132-->>- P0: return
    P0->>+ P25: calls
    P25-->>- P0: return
    P0->>+ P21: calls
    P21-->>- P0: return
    P0->>+ P23: calls
    P23-->>- P0: return
    P0->>+ P133: calls
    P133-->>- P0: return
    P0->>+ P134: calls
    P134-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P136: calls
    P136-->>- P0: return
    P0->>+ P137: calls
    P137-->>- P0: return
    P0->>+ P81: calls
    P81-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
    P0->>+ P28: calls
    P28-->>- P0: return
    P0->>+ P27: calls
    P27-->>- P0: return
    P0->>+ P141: calls
    P141-->>- P0: return
    P0->>+ P142: calls
    P142-->>- P0: return
    P0->>+ P143: calls
    P143-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P145: calls
    P145-->>- P0: return
    P0->>+ P84: calls
    P84-->>- P0: return
    P0->>+ P146: calls
    P146-->>- P0: return
    P0->>+ P29: calls
    P29-->>- P0: return
    P0->>+ P30: calls
    P30-->>- P0: return
    P0->>+ P86: calls
    P86-->>- P0: return
    P0->>+ P87: calls
    P87-->>- P0: return
    P0->>+ P147: calls
    P147-->>- P0: return
    P0->>+ P31: calls
    P31-->>- P0: return
    P0->>+ P32: calls
    P32-->>- P0: return
    P0->>+ P88: calls
    P88-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P150: calls
    P150-->>- P0: return
    P0->>+ P151: calls
    P151-->>- P0: return
    P0->>+ P35: calls
    P35-->>- P0: return
    P0->>+ P92: calls
    P92-->>- P0: return
    P0->>+ P94: calls
    P94-->>- P0: return
    P0->>+ P152: calls
    P152-->>- P0: return
    P0->>+ P153: calls
    P153-->>- P0: return
    P0->>+ P154: calls
    P154-->>- P0: return
    P0->>+ P155: calls
    P155-->>- P0: return
    P0->>+ P40: calls
    P40-->>- P0: return
    P0->>+ P39: calls
    P39-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P95: calls
    P95-->>- P0: return
    P0->>+ P96: calls
    P96-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P158: calls
    P158-->>- P0: return
    P0->>+ P159: calls
    P159-->>- P0: return
    P0->>+ P160: calls
    P160-->>- P0: return
    P0->>+ P43: calls
    P43-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P161: calls
    P161-->>- P0: return
    P0->>+ P46: calls
    P46-->>- P0: return
    P0->>+ P47: calls
    P47-->>- P0: return
    P0->>+ P45: calls
    P45-->>- P0: return
    P0->>+ P48: calls
    P48-->>- P0: return
    P0->>+ P162: calls
    P162-->>- P0: return
    P0->>+ P163: calls
    P163-->>- P0: return
    P0->>+ P164: calls
    P164-->>- P0: return
    P0->>+ P50: calls
    P50-->>- P0: return
    P0->>+ P165: calls
    P165-->>- P0: return
    P0->>+ P166: calls
    P166-->>- P0: return
    P0->>+ P167: calls
    P167-->>- P0: return
    P0->>+ P168: calls
    P168-->>- P0: return
    P0->>+ P51: calls
    P51-->>- P0: return
    P0->>+ P169: calls
    P169-->>- P0: return
    P0->>+ P170: calls
    P170-->>- P0: return
    P0->>+ P54: calls
    P54-->>- P0: return
    P0->>+ P55: calls
    P55-->>- P0: return
    P0->>+ P171: calls
    P171-->>- P0: return
    P0->>+ P172: calls
    P172-->>- P0: return
    P0->>+ P173: calls
    P173-->>- P0: return
    P0->>+ P174: calls
    P174-->>- P0: return
    P0->>+ P175: calls
    P175-->>- P0: return
    P0->>+ P176: calls
    P176-->>- P0: return
    P0->>+ P57: calls
    P57-->>- P0: return
    P0->>+ P177: calls
    P177-->>- P0: return
    P0->>+ P178: calls
    P178-->>- P0: return
    P0->>+ P179: calls
    P179-->>- P0: return
    P0->>+ P180: calls
    P180-->>- P0: return
    P0->>+ P181: calls
    P181-->>- P0: return
    P0->>+ P182: calls
    P182-->>- P0: return
    P0->>+ P183: calls
    P183-->>- P0: return
    P0->>+ P184: calls
    P184-->>- P0: return
    P0->>+ P185: calls
    P185-->>- P0: return
    P0->>+ P186: calls
    P186-->>- P0: return
    P0->>+ P187: calls
    P187-->>- P0: return
    P0->>+ P188: calls
    P188-->>- P0: return
    P0->>+ P189: calls
    P189-->>- P0: return
    P0->>+ P190: calls
    P190-->>- P0: return
    P0->>+ P191: calls
    P191-->>- P0: return
    P0->>+ P192: calls
    P192-->>- P0: return
    P0->>+ P193: calls
    P193-->>- P0: return
    P0->>+ P194: calls
    P194-->>- P0: return
    P0->>+ P195: calls
    P195-->>- P0: return
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
- [[all]] `INFERRED`
- [[set()]] `INFERRED`
- [[createParentReport()]] `EXTRACTED`
- [[cleanAttachments()]] `EXTRACTED`
- [[getToday()]] `EXTRACTED`
- [[isMissingAttachmentsColumn()]] `EXTRACTED`
- [[isTransientConnectionError()]] `EXTRACTED`
- [[isWeekend()]] `EXTRACTED`
- [[getCurrentMinutes()]] `EXTRACTED`
- [[logAudit()]] `INFERRED`
- [[now]] `INFERRED`
- [[currentSession()]] `EXTRACTED`
- [[timeToMinutes()]] `EXTRACTED`
- [[sendToParent()]] `EXTRACTED`

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