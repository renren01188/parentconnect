export type ParentReportRoleTab = "Principal" | "Adviser" | "Guidance";
export type ParentReportFilterTab = "All Messages" | "Unread" | ParentReportRoleTab;

export type ParentReportListMessage = {
  sender?: "parent" | "staff";
  threadType?: "adviser" | "guidance" | "principal";
};

export type ParentReportListItem = {
  unread?: boolean;
  categories?: string[];
  latestStaffRole?: "adviser" | "guidance" | "principal";
  threadTypes?: Array<"adviser" | "guidance" | "principal">;
  messages?: ParentReportListMessage[];
};

export function latestStaffRoleTab(item: ParentReportListItem): ParentReportRoleTab | undefined;
export function filterParentReportConversations<T extends ParentReportListItem>(
  conversations: T[],
  options: { tab: ParentReportFilterTab; category?: string },
): T[];
export function countParentReportTabs(
  conversations: ParentReportListItem[],
  options?: { category?: string },
): Record<ParentReportFilterTab, number>;
