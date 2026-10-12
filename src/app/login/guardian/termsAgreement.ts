export type TermsScrollPosition = {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
};

export type GuardianTermsState = {
  isOpen: boolean;
  hasReachedEnd: boolean;
  checkboxChecked: boolean;
  termsAccepted: boolean;
};

const SCROLL_END_TOLERANCE_PX = 1;

export function createGuardianTermsState(termsAccepted = false): GuardianTermsState {
  return {
    isOpen: false,
    hasReachedEnd: false,
    checkboxChecked: false,
    termsAccepted,
  };
}

export function openGuardianTerms(state: GuardianTermsState): GuardianTermsState {
  // Reopening is a review action after acceptance. Keep the visible checkbox
  // in sync with the consent that was already recorded for this signup.
  if (state.termsAccepted) {
    return {
      ...state,
      isOpen: true,
      hasReachedEnd: true,
      checkboxChecked: true,
    };
  }
  return {
    ...state,
    isOpen: true,
    hasReachedEnd: false,
    checkboxChecked: false,
  };
}

export function hasReachedTermsEnd({ scrollTop, clientHeight, scrollHeight }: TermsScrollPosition) {
  return scrollHeight <= clientHeight
    || scrollTop + clientHeight >= scrollHeight - SCROLL_END_TOLERANCE_PX;
}

export function updateGuardianTermsScroll(
  state: GuardianTermsState,
  position: TermsScrollPosition,
): GuardianTermsState {
  if (!state.isOpen || state.hasReachedEnd || !hasReachedTermsEnd(position)) return state;
  return { ...state, hasReachedEnd: true };
}

export function setGuardianTermsCheckbox(
  state: GuardianTermsState,
  checked: boolean,
): GuardianTermsState {
  if (!state.hasReachedEnd) return { ...state, checkboxChecked: false };
  return { ...state, checkboxChecked: checked };
}

export function canAcceptGuardianTerms(state: GuardianTermsState) {
  return state.isOpen && state.hasReachedEnd && state.checkboxChecked;
}

export function acceptGuardianTerms(state: GuardianTermsState): GuardianTermsState {
  if (!canAcceptGuardianTerms(state)) return state;
  return {
    ...state,
    isOpen: false,
    hasReachedEnd: true,
    checkboxChecked: true,
    termsAccepted: true,
  };
}

export function closeGuardianTerms(state: GuardianTermsState): GuardianTermsState {
  if (state.termsAccepted) return { ...state, isOpen: false };
  return {
    ...state,
    isOpen: false,
    hasReachedEnd: false,
    checkboxChecked: false,
  };
}

export function canSubmitGuardianSignup(state: GuardianTermsState) {
  return state.termsAccepted;
}
