# GET()

> God node · 149 connections · [C:\Users\RENREN\Documents\Parentconnect\ParentConnect\parentconnect\src\app\dashboard\adviser\students\standby\route.ts](file:///C:/Users/RENREN/Documents/Parentconnect/ParentConnect/parentconnect/src/app/dashboard/adviser/students/standby/route.ts#L14)

## Call Trace Diagram

```mermaid
sequenceDiagram
    participant P0 as GET()
    participant P1 as POST()
    participant P2 as json
    participant P3 as PATCH()
    participant P4 as DELETE()
    participant P5 as async()
    participant P6 as sendReply()
    participant P7 as createParentReport()
    participant P8 as handleSubmit()
    participant P9 as PUT()
    participant P10 as sendToParent()
    participant P11 as sendGuidanceToParent()
    participant P12 as markReportStatus()
    participant P13 as requireIct()
    participant P14 as handleSend()
    participant P15 as handleConfirm()
    participant P16 as sendToStaff()
    participant P17 as createPrincipalMessage()
    participant P18 as replyToUnifiedStaffConversation()
    participant P19 as sendNewMessage()
    participant P20 as markAdminRead()
    participant P21 as middleware()
    participant P22 as sendUnifiedStaffMessage()
    participant P23 as loadDashboard
    participant P24 as loadProfile()
    participant P25 as handleDelete()
    participant P26 as load()
    participant P27 as loadGuidanceStaffMessages()
    participant P28 as handleSave()
    participant P29 as replyToParentConversation()
    participant P30 as unauthorizedStudentApi()
    participant P31 as fetchMonthlyData()
    participant P32 as refreshOpenConversation()
    participant P33 as sendToParent()
    participant P34 as remove()
    participant P35 as handleSaveAnnouncement()
    participant P36 as decideTicket()
    participant P37 as handleNewMessageSent()
    participant P38 as handleReview()
    participant P39 as handleSubmit()
    participant P40 as sendWithBrevo()
    participant P41 as verifyGoogleRecaptcha()
    participant P42 as parentCanAccess()
    participant P43 as handleScan()
    participant P44 as loadSections
    participant P45 as markGuidanceSeen()
    participant P46 as escalateToPrincipal()
    participant P47 as fetchStudents()
    participant P48 as refresh()
    participant P49 as handleSubmitRequest()
    participant P50 as saveProfile()
    participant P51 as loadAnnouncements()
    participant P52 as processScanned()
    participant P53 as duplicateResponse()
    participant P54 as genericEnrollmentError()
    participant P55 as loadHistory()
    participant P56 as handleRegisterNewRfid()
    participant P57 as loadRecipients()
    participant P58 as confirmStudentResolve()
    participant P59 as submit()
    participant P60 as analyze()
    participant P61 as executeAction()
    participant P62 as handleSaveRFID()
    participant P63 as handleRevokeRFID()
    participant P64 as verifyIctPassword()
    participant P65 as updateScheduledDeletion()
    participant P66 as handleAddSection()
    participant P67 as fetchLetters()
    participant P68 as loadInitialData()
    participant P69 as savePhoto()
    participant P70 as savePassword()
    participant P71 as checkParentEmail()
    participant P72 as fetchJsonWithRetry()
    participant P73 as handleManualSave()
    participant P74 as sendAnnouncement()
    participant P75 as handleSaveAvatar()
    participant P76 as handleRemoveAvatar()
    participant P77 as handleSendApproval()
    participant P78 as handleUpdatePassword()
    participant P79 as importRows()
    participant P80 as save()
    participant P81 as handleRejectSelected()
    participant P82 as handleConfirmedSave()
    participant P83 as sendApprovalRequest()
    participant P84 as fetchSessions()
    participant P85 as saveSchedule()
    participant P86 as confirmUid()
    participant P87 as fetchGrades()
    participant P88 as fetchSchoolYear()
    participant P89 as fetchSections()
    participant P90 as fetchRfidSections()
    participant P91 as schedule()
    participant P92 as runQueueAction()
    participant P93 as handleDeleteSection()
    participant P94 as submit()
    participant P95 as fetchSummary()
    participant P96 as loadPrincipal()
    participant P97 as checkStudentId()
    participant P98 as loadSections()
    participant P99 as map
    participant P100 as from
    participant P101 as errorMessage()
    participant P102 as all
    participant P103 as set()
    participant P104 as cleanAttachments()
    participant P105 as getToday()
    participant P106 as isMissingAttachmentsColumn()
    participant P107 as isTransientConnectionError()
    participant P108 as isWeekend()
    participant P109 as getCurrentMinutes()
    participant P110 as logAudit()
    participant P111 as now
    participant P112 as currentSession()
    participant P113 as timeToMinutes()
    participant P114 as toAdviserReport()
    participant P115 as getPrincipalSession()
    participant P116 as roleLabel()
    participant P117 as buildFullName()
    participant P118 as parseSheet()
    participant P119 as getActiveIct()
    participant P120 as getIctFromToken()
    participant P121 as listMessages()
    participant P122 as toParentReport()
    participant P123 as generateTempPassword()
    participant P124 as insertMessage()
    participant P125 as staffRecipients()
    participant P126 as checkLoginProtection()
    participant P127 as failedLoginResult()
    participant P128 as cleanNamePart()
    participant P129 as deliverPrincipalAnnouncement()
    participant P130 as getGuidanceSession()
    participant P131 as findRecipient()
    participant P132 as getScheduledSessionStatus()
    participant P133 as studentFromRelation()
    participant P134 as latestAdviserReplyIdForStaffConversation()
    participant P135 as getStudentApiActor()
    participant P136 as rememberLoginGuard()
    participant P137 as normalizePrincipalAnnouncementAudience()
    participant P138 as getParentSession()
    participant P139 as groupParentDeletionEmails()
    participant P140 as getVerifiedSubjectTeacher()
    participant P141 as normalizeDepEdEmail()
    participant P142 as rootIdFromConversationId()
    participant P143 as isParticipant()
    participant P144 as getErrorMessage()
    participant P145 as getNowTime()
    participant P146 as notifyRecipients()
    participant P147 as fanOutIctAnnouncement()
    participant P148 as currentStaff()
    participant P149 as getScheduledStudentLrns()
    participant P150 as clearLoginFailures()
    participant P151 as processAttendanceSmsJobs()
    participant P152 as mapWithConcurrency()
    participant P153 as suspendDeletionTarget()
    participant P154 as archiveTarget()
    participant P155 as isAllowedSubjectTeacherEmail()
    participant P156 as isSchoolHoliday()
    participant P157 as ensureSessionRow()
    participant P158 as getScheduleStatus()
    participant P159 as queueSmsAfterAttendance()
    participant P160 as consumeEnrollmentAttempt()
    participant P161 as isMissingColumn()
    participant P162 as parseRole()
    participant P163 as logSecurityAlert()
    participant P164 as parentAccountAccessIssue()
    participant P165 as getAdviserSession()
    participant P166 as getReportForAdviser()
    participant P167 as getReportForParent()
    participant P168 as sendParentDeletionScheduledEmail()
    participant P169 as otpHash()
    participant P170 as signingKey()
    participant P171 as deriveClassSession()
    participant P172 as isAdviserIctPair()
    participant P173 as validateSchedule()
    participant P174 as timeToSeconds()
    participant P175 as validateSubmission()
    participant P176 as isGuidanceIctPair()
    participant P177 as claimJob()
    participant P178 as isPrincipalIctPair()
    participant P179 as getIctName()
    participant P180 as manilaDayBounds()
    participant P181 as uppercasedName()
    participant P182 as trimmed()
    participant P183 as manilaDate()
    participant P184 as sendContactUsNotification()
    participant P185 as sendGuidanceMessageEmail()
    participant P186 as sendAccountDeletionScheduledEmail()
    participant P187 as findAssignedAdviser()
    participant P188 as sendWithEmail()
    participant P189 as hashesMatch()
    participant P190 as adviserFullName()
    participant P191 as validateSingleAttachment()
    participant P192 as positiveInt()
    participant P193 as titleCase()
    participant P194 as normalizePhone()
    participant P195 as isPasswordSet()
    participant P196 as generateTemporaryPassword()
    participant P197 as supabaseErrorMessage()
    participant P198 as normalizeThreadType()
    participant P199 as isTooLong()
    participant P200 as validSecret()
    participant P201 as sendAdviserTempPasswordEmail()
    participant P202 as sendExcuseLetterToAdviserEmail()
    participant P203 as sendGuidanceTempPasswordEmail()
    participant P204 as sendStaffMessageEmail()
    participant P205 as sendIctTempPasswordEmail()
    participant P206 as sendTempPasswordEmail()
    participant P207 as sendPrincipalTempPasswordEmail()
    participant P208 as sendParentReportAdviserEmail()
    participant P209 as sendGuidanceEscalationEmail()
    participant P210 as fullName
    participant P211 as consumePublicRateLimit()
    participant P212 as sendStudentReportAdviserEmail()
    participant P213 as sendStudentConcernParentNotificationEmail()
    participant P214 as sendSubjectTeacherReportNotificationEmail()
    participant P215 as fullName()
    participant P216 as isMissingTableError()
    participant P217 as recipientsFor()
    participant P218 as formatDate()
    participant P219 as resolveStaffByRole()
    participant P220 as printMonthlyAttendance()
    participant P221 as attachmentsFromRow()
    participant P222 as getTodayLogs()
    participant P223 as getIctSession()
    participant P224 as collapseAnnouncementNotifications()
    participant P225 as getParentIds()
    participant P226 as resolveParentIdentities()
    participant P227 as getRememberedLoginGuard()
    participant P228 as listGuidanceTickets()
    participant P229 as retrySupabase()
    participant P230 as getFullName()
    participant P231 as formatTime()
    participant P232 as auditActionDatabaseValues()
    participant P233 as auditRoleDatabaseValues()
    participant P234 as getArchivedStudentLrns()
    participant P235 as getClientIp()
    participant P236 as getDaysInMonth()
    participant P237 as getWeekdaysInMonth()
    participant P238 as isRetryableNetworkError()
    participant P239 as isMissingSchemaError()
    participant P240 as getParentSession()
    participant P241 as announcementKey()
    participant P242 as getPhilippineDateParts()
    participant P243 as getWeekRange()
    participant P244 as buildUnifiedStaffConversations()
    participant P245 as isUpstreamUnavailable()
    participant P246 as parentRecipients()
    participant P247 as getScheduledAttendanceLogs()
    participant P248 as getSchedulesForDates()
    participant P249 as notificationRetentionStart()
    participant P250 as getActiveAdviser()
    participant P251 as clientSubject()
    participant P252 as getPrincipalSession()
    participant P253 as initials()
    participant P254 as toAttendanceStatus()
    participant P255 as isMissingColumnError()
    participant P256 as requirePrincipal()
    participant P257 as toDateString()
    participant P258 as adviserRecipientMatch()
    participant P259 as studentName()
    participant P260 as archiveExpiredAuditLogs()
    participant P261 as parseAuditArchiveFilter()
    P0->>+ P1: calls
    P1-->>- P0: return
    P1->>+ P0: calls
    P0-->>- P1: return
    P1->>+ P2: calls
    P2-->>- P1: return
    P2->>+ P1: calls
    P1-->>- P2: return
    P2->>+ P0: calls
    P0-->>- P2: return
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
    P1->>+ P99: calls
    P99-->>- P1: return
    P1->>+ P100: calls
    P100-->>- P1: return
    P1->>+ P101: calls
    P101-->>- P1: return
    P1->>+ P4: calls
    P4-->>- P1: return
    P1->>+ P102: calls
    P102-->>- P1: return
    P1->>+ P103: calls
    P103-->>- P1: return
    P1->>+ P7: calls
    P7-->>- P1: return
    P1->>+ P104: calls
    P104-->>- P1: return
    P1->>+ P105: calls
    P105-->>- P1: return
    P1->>+ P106: calls
    P106-->>- P1: return
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
    P1->>+ P112: calls
    P112-->>- P1: return
    P1->>+ P113: calls
    P113-->>- P1: return
    P1->>+ P10: calls
    P10-->>- P1: return
    P1->>+ P11: calls
    P11-->>- P1: return
    P1->>+ P114: calls
    P114-->>- P1: return
    P1->>+ P13: calls
    P13-->>- P1: return
    P1->>+ P115: calls
    P115-->>- P1: return
    P1->>+ P116: calls
    P116-->>- P1: return
    P1->>+ P117: calls
    P117-->>- P1: return
    P1->>+ P16: calls
    P16-->>- P1: return
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
    P1->>+ P17: calls
    P17-->>- P1: return
    P1->>+ P124: calls
    P124-->>- P1: return
    P1->>+ P18: calls
    P18-->>- P1: return
    P1->>+ P125: calls
    P125-->>- P1: return
    P1->>+ P126: calls
    P126-->>- P1: return
    P1->>+ P127: calls
    P127-->>- P1: return
    P1->>+ P128: calls
    P128-->>- P1: return
    P1->>+ P129: calls
    P129-->>- P1: return
    P1->>+ P130: calls
    P130-->>- P1: return
    P1->>+ P131: calls
    P131-->>- P1: return
    P1->>+ P132: calls
    P132-->>- P1: return
    P1->>+ P133: calls
    P133-->>- P1: return
    P1->>+ P22: calls
    P22-->>- P1: return
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
    P1->>+ P29: calls
    P29-->>- P1: return
    P1->>+ P148: calls
    P148-->>- P1: return
    P1->>+ P30: calls
    P30-->>- P1: return
    P1->>+ P149: calls
    P149-->>- P1: return
    P1->>+ P150: calls
    P150-->>- P1: return
    P1->>+ P41: calls
    P41-->>- P1: return
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
    P1->>+ P53: calls
    P53-->>- P1: return
    P1->>+ P176: calls
    P176-->>- P1: return
    P1->>+ P177: calls
    P177-->>- P1: return
    P1->>+ P54: calls
    P54-->>- P1: return
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
    P1->>+ P184: calls
    P184-->>- P1: return
    P1->>+ P185: calls
    P185-->>- P1: return
    P1->>+ P186: calls
    P186-->>- P1: return
    P1->>+ P187: calls
    P187-->>- P1: return
    P1->>+ P188: calls
    P188-->>- P1: return
    P1->>+ P189: calls
    P189-->>- P1: return
    P1->>+ P190: calls
    P190-->>- P1: return
    P1->>+ P191: calls
    P191-->>- P1: return
    P1->>+ P192: calls
    P192-->>- P1: return
    P1->>+ P193: calls
    P193-->>- P1: return
    P1->>+ P194: calls
    P194-->>- P1: return
    P1->>+ P195: calls
    P195-->>- P1: return
    P1->>+ P196: calls
    P196-->>- P1: return
    P1->>+ P197: calls
    P197-->>- P1: return
    P1->>+ P198: calls
    P198-->>- P1: return
    P1->>+ P199: calls
    P199-->>- P1: return
    P1->>+ P200: calls
    P200-->>- P1: return
    P1->>+ P201: calls
    P201-->>- P1: return
    P1->>+ P202: calls
    P202-->>- P1: return
    P1->>+ P203: calls
    P203-->>- P1: return
    P1->>+ P204: calls
    P204-->>- P1: return
    P1->>+ P205: calls
    P205-->>- P1: return
    P1->>+ P206: calls
    P206-->>- P1: return
    P1->>+ P207: calls
    P207-->>- P1: return
    P1->>+ P208: calls
    P208-->>- P1: return
    P1->>+ P209: calls
    P209-->>- P1: return
    P1->>+ P210: calls
    P210-->>- P1: return
    P1->>+ P211: calls
    P211-->>- P1: return
    P1->>+ P212: calls
    P212-->>- P1: return
    P1->>+ P213: calls
    P213-->>- P1: return
    P1->>+ P214: calls
    P214-->>- P1: return
    P0->>+ P3: calls
    P3-->>- P0: return
    P0->>+ P2: calls
    P2-->>- P0: return
    P0->>+ P99: calls
    P99-->>- P0: return
    P0->>+ P100: calls
    P100-->>- P0: return
    P0->>+ P101: calls
    P101-->>- P0: return
    P0->>+ P4: calls
    P4-->>- P0: return
    P0->>+ P215: calls
    P215-->>- P0: return
    P0->>+ P102: calls
    P102-->>- P0: return
    P0->>+ P103: calls
    P103-->>- P0: return
    P0->>+ P7: calls
    P7-->>- P0: return
    P0->>+ P9: calls
    P9-->>- P0: return
    P0->>+ P105: calls
    P105-->>- P0: return
    P0->>+ P107: calls
    P107-->>- P0: return
    P0->>+ P108: calls
    P108-->>- P0: return
    P0->>+ P109: calls
    P109-->>- P0: return
    P0->>+ P112: calls
    P112-->>- P0: return
    P0->>+ P11: calls
    P11-->>- P0: return
    P0->>+ P116: calls
    P116-->>- P0: return
    P0->>+ P13: calls
    P13-->>- P0: return
    P0->>+ P216: calls
    P216-->>- P0: return
    P0->>+ P115: calls
    P115-->>- P0: return
    P0->>+ P117: calls
    P117-->>- P0: return
    P0->>+ P120: calls
    P120-->>- P0: return
    P0->>+ P119: calls
    P119-->>- P0: return
    P0->>+ P121: calls
    P121-->>- P0: return
    P0->>+ P217: calls
    P217-->>- P0: return
    P0->>+ P218: calls
    P218-->>- P0: return
    P0->>+ P219: calls
    P219-->>- P0: return
    P0->>+ P125: calls
    P125-->>- P0: return
    P0->>+ P130: calls
    P130-->>- P0: return
    P0->>+ P220: calls
    P220-->>- P0: return
    P0->>+ P221: calls
    P221-->>- P0: return
    P0->>+ P135: calls
    P135-->>- P0: return
    P0->>+ P21: calls
    P21-->>- P0: return
    P0->>+ P138: calls
    P138-->>- P0: return
    P0->>+ P139: calls
    P139-->>- P0: return
    P0->>+ P140: calls
    P140-->>- P0: return
    P0->>+ P144: calls
    P144-->>- P0: return
    P0->>+ P222: calls
    P222-->>- P0: return
    P0->>+ P223: calls
    P223-->>- P0: return
    P0->>+ P224: calls
    P224-->>- P0: return
    P0->>+ P225: calls
    P225-->>- P0: return
    P0->>+ P226: calls
    P226-->>- P0: return
    P0->>+ P148: calls
    P148-->>- P0: return
    P0->>+ P30: calls
    P30-->>- P0: return
    P0->>+ P227: calls
    P227-->>- P0: return
    P0->>+ P228: calls
    P228-->>- P0: return
    P0->>+ P149: calls
    P149-->>- P0: return
    P0->>+ P156: calls
    P156-->>- P0: return
    P0->>+ P157: calls
    P157-->>- P0: return
    P0->>+ P229: calls
    P229-->>- P0: return
    P0->>+ P230: calls
    P230-->>- P0: return
    P0->>+ P162: calls
    P162-->>- P0: return
    P0->>+ P231: calls
    P231-->>- P0: return
    P0->>+ P232: calls
    P232-->>- P0: return
    P0->>+ P233: calls
    P233-->>- P0: return
    P0->>+ P165: calls
    P165-->>- P0: return
    P0->>+ P234: calls
    P234-->>- P0: return
    P0->>+ P163: calls
    P163-->>- P0: return
    P0->>+ P235: calls
    P235-->>- P0: return
    P0->>+ P236: calls
    P236-->>- P0: return
    P0->>+ P237: calls
    P237-->>- P0: return
    P0->>+ P238: calls
    P238-->>- P0: return
    P0->>+ P239: calls
    P239-->>- P0: return
    P0->>+ P240: calls
    P240-->>- P0: return
    P0->>+ P241: calls
    P241-->>- P0: return
    P0->>+ P242: calls
    P242-->>- P0: return
    P0->>+ P243: calls
    P243-->>- P0: return
    P0->>+ P244: calls
    P244-->>- P0: return
    P0->>+ P245: calls
    P245-->>- P0: return
    P0->>+ P246: calls
    P246-->>- P0: return
    P0->>+ P247: calls
    P247-->>- P0: return
    P0->>+ P248: calls
    P248-->>- P0: return
    P0->>+ P249: calls
    P249-->>- P0: return
    P0->>+ P250: calls
    P250-->>- P0: return
    P0->>+ P251: calls
    P251-->>- P0: return
    P0->>+ P252: calls
    P252-->>- P0: return
    P0->>+ P253: calls
    P253-->>- P0: return
    P0->>+ P66: calls
    P66-->>- P0: return
    P0->>+ P254: calls
    P254-->>- P0: return
    P0->>+ P255: calls
    P255-->>- P0: return
    P0->>+ P256: calls
    P256-->>- P0: return
    P0->>+ P257: calls
    P257-->>- P0: return
    P0->>+ P258: calls
    P258-->>- P0: return
    P0->>+ P259: calls
    P259-->>- P0: return
    P0->>+ P260: calls
    P260-->>- P0: return
    P0->>+ P261: calls
    P261-->>- P0: return
```

## Connections by Relation

### calls
- [[POST()]] `EXTRACTED`
- [[PATCH()]] `EXTRACTED`
- [[json]] `INFERRED`
- [[map]] `INFERRED`
- [[from]] `INFERRED`
- [[errorMessage()]] `EXTRACTED`
- [[DELETE()]] `INFERRED`
- [[fullName()]] `EXTRACTED`
- [[all]] `INFERRED`
- [[set()]] `INFERRED`
- [[createParentReport()]] `EXTRACTED`
- [[PUT()]] `EXTRACTED`
- [[getToday()]] `EXTRACTED`
- [[isTransientConnectionError()]] `EXTRACTED`
- [[isWeekend()]] `EXTRACTED`
- [[getCurrentMinutes()]] `EXTRACTED`
- [[currentSession()]] `EXTRACTED`
- [[sendGuidanceToParent()]] `EXTRACTED`
- [[roleLabel()]] `EXTRACTED`
- [[requireIct()]] `EXTRACTED`

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