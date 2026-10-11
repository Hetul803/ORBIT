-- Revoke old public plan links for conversations already suppressed by reporting or a block.
-- Preserve audit rows; only disable the share/check-in surface, without deleting user data.
UPDATE "SafetyPlan" plan SET "deletedAt" = CURRENT_TIMESTAMP
FROM "Introduction" intro, "AgentConversation" conversation
WHERE plan."introductionId" = intro.id AND intro."conversationId" = conversation.id
  AND conversation."suppressedAt" IS NOT NULL AND plan."deletedAt" IS NULL;
