export type TermsScrollPosition = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

export type ReportSubmissionConfirmation = {
  hasReachedTermsEnd: boolean;
  termsAccepted: boolean;
};

const SCROLL_END_TOLERANCE_PX = 1;

export function createReportSubmissionConfirmation(): ReportSubmissionConfirmation {
  return {
    hasReachedTermsEnd: false,
    termsAccepted: false,
  };
}

export function hasReachedReportTermsEnd({ scrollTop, clientHeight, scrollHeight }: TermsScrollPosition) {
  return scrollHeight <= clientHeight
    || scrollTop + clientHeight >= scrollHeight - SCROLL_END_TOLERANCE_PX;
}

export function updateReportTermsScroll(
  confirmation: ReportSubmissionConfirmation,
  position: TermsScrollPosition,
): ReportSubmissionConfirmation {
  if (confirmation.hasReachedTermsEnd || !hasReachedReportTermsEnd(position)) return confirmation;
  return { ...confirmation, hasReachedTermsEnd: true };
}

export function setReportTermsAccepted(
  confirmation: ReportSubmissionConfirmation,
  termsAccepted: boolean,
): ReportSubmissionConfirmation {
  if (!confirmation.hasReachedTermsEnd) return { ...confirmation, termsAccepted: false };
  return { ...confirmation, termsAccepted };
}

export function canSubmitConfirmedReport(confirmation: ReportSubmissionConfirmation) {
  return confirmation.hasReachedTermsEnd
    && confirmation.termsAccepted;
}
