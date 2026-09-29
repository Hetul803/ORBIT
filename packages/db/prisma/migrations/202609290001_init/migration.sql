-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Enable vector retrieval before creating vector-backed columns.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('TRAIT', 'PREFERENCE', 'GOAL', 'CONSTRAINT', 'PERSON', 'EVENT', 'VOICE');

-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('INTERVIEW', 'IMPORT', 'CORRECTION', 'OUTCOME');

-- CreateEnum
CREATE TYPE "IntentKind" AS ENUM ('DATING', 'FRIENDSHIP', 'ROOMMATE', 'COFOUNDER', 'STUDY_PARTNER', 'GYM_PARTNER', 'MENTOR', 'HIRING', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "ExchangeDirection" AS ENUM ('HAVE', 'WANT');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'CONVERSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ENDED_EARLY', 'REDACTION_FAILED', 'MODERATION_FLAGGED');

-- CreateEnum
CREATE TYPE "RevealDecision" AS ENUM ('PENDING', 'REVEAL', 'DECLINE');

-- CreateEnum
CREATE TYPE "InboxTriage" AS ENUM ('AUTO_DECLINED', 'HELD', 'ESCALATED', 'ANSWERED');

-- CreateEnum
CREATE TYPE "ScreeningAction" AS ENUM ('ALLOW', 'HOLD', 'DECLINE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PAUSED_COST_CAP');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('DRAFT', 'VALIDATING', 'ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('CAMPUS', 'CLUB', 'LAB', 'CLASS');

-- CreateEnum
CREATE TYPE "GroupVisibility" AS ENUM ('PRIVATE', 'DOMAIN', 'PUBLIC');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'IMAP', 'S3');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "eduVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "ageVerifiedAt" TIMESTAMP(3),
    "displayName" TEXT NOT NULL,
    "handle" TEXT,
    "campusId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en-US',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "deletionRequestedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identitySeed" TEXT NOT NULL,
    "voiceProfile" JSONB NOT NULL DEFAULT '{}',
    "autonomyDefaults" JSONB NOT NULL DEFAULT '{}',
    "profileSummary" TEXT NOT NULL DEFAULT '',
    "profileEmbedding" vector(1536),
    "lastConsolidatedAt" TIMESTAMP(3),

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryFact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "agentId" TEXT NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" "MemorySource" NOT NULL,
    "embedding" vector(1536),
    "embeddingHash" TEXT,
    "supersededById" TEXT,
    "userEditedAt" TIMESTAMP(3),

    CONSTRAINT "MemoryFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "kind" "IntentKind" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "params" JSONB NOT NULL DEFAULT '{}',
    "pausedUntil" TIMESTAMP(3),

    CONSTRAINT "Intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "direction" "ExchangeDirection" NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "condition" TEXT,
    "description" TEXT NOT NULL,
    "priceLowCents" INTEGER,
    "priceHighCents" INTEGER,
    "willTradeFor" TEXT,
    "urgency" "Urgency" NOT NULL DEFAULT 'NORMAL',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExchangeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchCandidate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "intentKind" "IntentKind" NOT NULL,
    "agentAId" TEXT NOT NULL,
    "agentBId" TEXT NOT NULL,
    "retrievalScore" DOUBLE PRECISION NOT NULL,
    "rerankScore" DOUBLE PRECISION,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,

    CONSTRAINT "MatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "intentKind" "IntentKind" NOT NULL,
    "agentAId" TEXT NOT NULL,
    "agentBId" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'RUNNING',
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "verdict" JSONB,
    "redactionPassed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "conversationId" TEXT NOT NULL,
    "speakerAgentId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "redactedContent" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Introduction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "conversationId" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "userADecision" "RevealDecision" NOT NULL DEFAULT 'PENDING',
    "userBDecision" "RevealDecision" NOT NULL DEFAULT 'PENDING',
    "decidedAAt" TIMESTAMP(3),
    "decidedBAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "revealedFields" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Introduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntroductionOutcome" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "introductionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "met" BOOLEAN NOT NULL,
    "rating" INTEGER,
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntroductionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reveal" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "introductionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reveal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "recipientUserId" TEXT NOT NULL,
    "senderAgentId" TEXT,
    "senderUserId" TEXT,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "triage" "InboxTriage" NOT NULL,
    "agentReply" TEXT,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),

    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningRule" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "matchOn" JSONB NOT NULL,
    "action" "ScreeningAction" NOT NULL,
    "priority" INTEGER NOT NULL,

    CONSTRAINT "ScreeningRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watcher" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "schedule" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),

    CONSTRAINT "Watcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatcherHit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "watcherId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "WatcherHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "skillId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "costCents" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "parentRunId" TEXT,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "ownerUserId" TEXT NOT NULL,
    "groupId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition" JSONB NOT NULL,
    "compiledPlan" JSONB,
    "autonomyPct" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adoptionCount" INTEGER NOT NULL DEFAULT 0,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SkillStatus" NOT NULL DEFAULT 'DRAFT',
    "parentSkillId" TEXT,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillVersion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "skillId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB NOT NULL,
    "correction" TEXT,
    "validation" JSONB NOT NULL,

    CONSTRAINT "SkillVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillDependency" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "parentSkillId" TEXT NOT NULL,
    "childSkillId" TEXT NOT NULL,
    "reuseCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SkillDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningReceipt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "skillId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "reusableSteps" INTEGER NOT NULL,
    "firstRunActions" INTEGER NOT NULL,
    "currentRunActions" INTEGER NOT NULL,
    "firstRunModelCalls" INTEGER NOT NULL,
    "currentRunModelCalls" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL,

    CONSTRAINT "LearningReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillAdoption" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "skillId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adaptedDefinition" JSONB NOT NULL,
    "adoptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillAdoption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "kind" "GroupKind" NOT NULL,
    "name" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "emailDomain" TEXT,
    "visibility" "GroupVisibility" NOT NULL DEFAULT 'PRIVATE',

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "scopes" TEXT[],
    "encryptedTokens" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "requestId" TEXT,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelCall" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "conversationId" TEXT,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costCents" DECIMAL(12,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "requestId" TEXT,

    CONSTRAINT "ModelCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "blockerUserId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "reporterUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "conversationId" TEXT,
    "category" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportId" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "introductionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placeName" TEXT NOT NULL,
    "meetAt" TIMESTAMP(3) NOT NULL,
    "shareToken" TEXT NOT NULL,
    "sharedWithContact" BOOLEAN NOT NULL DEFAULT false,
    "checkInDueAt" TIMESTAMP(3) NOT NULL,
    "checkedInAt" TIMESTAMP(3),

    CONSTRAINT "SafetyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBrief" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "payload" JSONB NOT NULL,
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "DailyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptedApiKey" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "EncryptedApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- CreateIndex
CREATE INDEX "User_campusId_idx" ON "User"("campusId");

-- CreateIndex
CREATE INDEX "User_status_deletionRequestedAt_idx" ON "User"("status", "deletionRequestedAt");

-- CreateIndex
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_identitySeed_key" ON "Agent"("identitySeed");

-- CreateIndex
CREATE INDEX "Agent_userId_idx" ON "Agent"("userId");

-- CreateIndex
CREATE INDEX "MemoryFact_agentId_idx" ON "MemoryFact"("agentId");

-- CreateIndex
CREATE INDEX "MemoryFact_kind_idx" ON "MemoryFact"("kind");

-- CreateIndex
CREATE INDEX "MemoryFact_supersededById_idx" ON "MemoryFact"("supersededById");

-- CreateIndex
CREATE INDEX "MemoryFact_deletedAt_idx" ON "MemoryFact"("deletedAt");

-- CreateIndex
CREATE INDEX "Intent_userId_idx" ON "Intent"("userId");

-- CreateIndex
CREATE INDEX "Intent_kind_active_pausedUntil_idx" ON "Intent"("kind", "active", "pausedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Intent_userId_kind_key" ON "Intent"("userId", "kind");

-- CreateIndex
CREATE INDEX "ExchangeItem_userId_idx" ON "ExchangeItem"("userId");

-- CreateIndex
CREATE INDEX "ExchangeItem_direction_category_active_idx" ON "ExchangeItem"("direction", "category", "active");

-- CreateIndex
CREATE INDEX "ExchangeItem_urgency_idx" ON "ExchangeItem"("urgency");

-- CreateIndex
CREATE INDEX "MatchCandidate_agentAId_idx" ON "MatchCandidate"("agentAId");

-- CreateIndex
CREATE INDEX "MatchCandidate_agentBId_idx" ON "MatchCandidate"("agentBId");

-- CreateIndex
CREATE INDEX "MatchCandidate_intentKind_status_idx" ON "MatchCandidate"("intentKind", "status");

-- CreateIndex
CREATE INDEX "MatchCandidate_rerankScore_idx" ON "MatchCandidate"("rerankScore");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCandidate_intentKind_agentAId_agentBId_key" ON "MatchCandidate"("intentKind", "agentAId", "agentBId");

-- CreateIndex
CREATE INDEX "AgentConversation_agentAId_idx" ON "AgentConversation"("agentAId");

-- CreateIndex
CREATE INDEX "AgentConversation_agentBId_idx" ON "AgentConversation"("agentBId");

-- CreateIndex
CREATE INDEX "AgentConversation_intentKind_status_idx" ON "AgentConversation"("intentKind", "status");

-- CreateIndex
CREATE INDEX "AgentConversation_redactionPassed_idx" ON "AgentConversation"("redactionPassed");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_idx" ON "AgentMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AgentMessage_speakerAgentId_idx" ON "AgentMessage"("speakerAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentMessage_conversationId_turnIndex_key" ON "AgentMessage"("conversationId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Introduction_conversationId_key" ON "Introduction"("conversationId");

-- CreateIndex
CREATE INDEX "Introduction_userAId_idx" ON "Introduction"("userAId");

-- CreateIndex
CREATE INDEX "Introduction_userBId_idx" ON "Introduction"("userBId");

-- CreateIndex
CREATE INDEX "Introduction_expiresAt_idx" ON "Introduction"("expiresAt");

-- CreateIndex
CREATE INDEX "Introduction_revealedAt_idx" ON "Introduction"("revealedAt");

-- CreateIndex
CREATE INDEX "IntroductionOutcome_introductionId_idx" ON "IntroductionOutcome"("introductionId");

-- CreateIndex
CREATE INDEX "IntroductionOutcome_userId_idx" ON "IntroductionOutcome"("userId");

-- CreateIndex
CREATE INDEX "IntroductionOutcome_met_rating_idx" ON "IntroductionOutcome"("met", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "IntroductionOutcome_introductionId_userId_key" ON "IntroductionOutcome"("introductionId", "userId");

-- CreateIndex
CREATE INDEX "Reveal_introductionId_idx" ON "Reveal"("introductionId");

-- CreateIndex
CREATE INDEX "Reveal_userId_idx" ON "Reveal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Reveal_introductionId_userId_field_key" ON "Reveal"("introductionId", "userId", "field");

-- CreateIndex
CREATE INDEX "InboxItem_recipientUserId_triage_idx" ON "InboxItem"("recipientUserId", "triage");

-- CreateIndex
CREATE INDEX "InboxItem_senderAgentId_idx" ON "InboxItem"("senderAgentId");

-- CreateIndex
CREATE INDEX "InboxItem_senderUserId_idx" ON "InboxItem"("senderUserId");

-- CreateIndex
CREATE INDEX "ScreeningRule_userId_priority_idx" ON "ScreeningRule"("userId", "priority");

-- CreateIndex
CREATE INDEX "ScreeningRule_action_idx" ON "ScreeningRule"("action");

-- CreateIndex
CREATE INDEX "Watcher_userId_idx" ON "Watcher"("userId");

-- CreateIndex
CREATE INDEX "Watcher_active_nextRunAt_idx" ON "Watcher"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "WatcherHit_watcherId_seenAt_idx" ON "WatcherHit"("watcherId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatcherHit_watcherId_dedupeKey_key" ON "WatcherHit"("watcherId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Run_userId_createdAt_idx" ON "Run"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_skillId_createdAt_idx" ON "Run"("skillId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_parentRunId_idx" ON "Run"("parentRunId");

-- CreateIndex
CREATE INDEX "Skill_ownerUserId_idx" ON "Skill"("ownerUserId");

-- CreateIndex
CREATE INDEX "Skill_groupId_idx" ON "Skill"("groupId");

-- CreateIndex
CREATE INDEX "Skill_status_idx" ON "Skill"("status");

-- CreateIndex
CREATE INDEX "Skill_parentSkillId_idx" ON "Skill"("parentSkillId");

-- CreateIndex
CREATE INDEX "Skill_adoptionCount_idx" ON "Skill"("adoptionCount");

-- CreateIndex
CREATE INDEX "SkillVersion_skillId_idx" ON "SkillVersion"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillVersion_skillId_version_key" ON "SkillVersion"("skillId", "version");

-- CreateIndex
CREATE INDEX "SkillDependency_parentSkillId_idx" ON "SkillDependency"("parentSkillId");

-- CreateIndex
CREATE INDEX "SkillDependency_childSkillId_idx" ON "SkillDependency"("childSkillId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDependency_parentSkillId_childSkillId_key" ON "SkillDependency"("parentSkillId", "childSkillId");

-- CreateIndex
CREATE INDEX "LearningReceipt_skillId_idx" ON "LearningReceipt"("skillId");

-- CreateIndex
CREATE INDEX "LearningReceipt_runId_idx" ON "LearningReceipt"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningReceipt_skillId_runId_key" ON "LearningReceipt"("skillId", "runId");

-- CreateIndex
CREATE INDEX "SkillAdoption_skillId_idx" ON "SkillAdoption"("skillId");

-- CreateIndex
CREATE INDEX "SkillAdoption_userId_idx" ON "SkillAdoption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillAdoption_skillId_userId_key" ON "SkillAdoption"("skillId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_joinCode_key" ON "Group"("joinCode");

-- CreateIndex
CREATE INDEX "Group_emailDomain_idx" ON "Group"("emailDomain");

-- CreateIndex
CREATE INDEX "Group_kind_visibility_idx" ON "Group"("kind", "visibility");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_userId_key" ON "GroupMember"("groupId", "userId");

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- CreateIndex
CREATE INDEX "Connection_status_idx" ON "Connection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_userId_provider_key" ON "Connection"("userId", "provider");

-- CreateIndex
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_targetType_targetId_idx" ON "ActivityLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ActivityLog_action_idx" ON "ActivityLog"("action");

-- CreateIndex
CREATE INDEX "ActivityLog_requestId_idx" ON "ActivityLog"("requestId");

-- CreateIndex
CREATE INDEX "ModelCall_userId_createdAt_idx" ON "ModelCall"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelCall_runId_idx" ON "ModelCall"("runId");

-- CreateIndex
CREATE INDEX "ModelCall_conversationId_idx" ON "ModelCall"("conversationId");

-- CreateIndex
CREATE INDEX "ModelCall_task_createdAt_idx" ON "ModelCall"("task", "createdAt");

-- CreateIndex
CREATE INDEX "ModelCall_requestId_idx" ON "ModelCall"("requestId");

-- CreateIndex
CREATE INDEX "Block_blockerUserId_idx" ON "Block"("blockerUserId");

-- CreateIndex
CREATE INDEX "Block_blockedUserId_idx" ON "Block"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Block_blockerUserId_blockedUserId_key" ON "Block"("blockerUserId", "blockedUserId");

-- CreateIndex
CREATE INDEX "Report_reporterUserId_idx" ON "Report"("reporterUserId");

-- CreateIndex
CREATE INDEX "Report_subjectUserId_idx" ON "Report"("subjectUserId");

-- CreateIndex
CREATE INDEX "Report_conversationId_idx" ON "Report"("conversationId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAction_reportId_idx" ON "ModerationAction"("reportId");

-- CreateIndex
CREATE INDEX "ModerationAction_moderatorId_idx" ON "ModerationAction"("moderatorId");

-- CreateIndex
CREATE UNIQUE INDEX "SafetyPlan_shareToken_key" ON "SafetyPlan"("shareToken");

-- CreateIndex
CREATE INDEX "SafetyPlan_introductionId_idx" ON "SafetyPlan"("introductionId");

-- CreateIndex
CREATE INDEX "SafetyPlan_userId_idx" ON "SafetyPlan"("userId");

-- CreateIndex
CREATE INDEX "SafetyPlan_checkInDueAt_checkedInAt_idx" ON "SafetyPlan"("checkInDueAt", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_pushToken_key" ON "Device"("pushToken");

-- CreateIndex
CREATE INDEX "Device_userId_idx" ON "Device"("userId");

-- CreateIndex
CREATE INDEX "Device_platform_idx" ON "Device"("platform");

-- CreateIndex
CREATE INDEX "Consent_userId_kind_idx" ON "Consent"("userId", "kind");

-- CreateIndex
CREATE INDEX "Consent_kind_version_idx" ON "Consent"("kind", "version");

-- CreateIndex
CREATE INDEX "DailyBrief_userId_forDate_idx" ON "DailyBrief"("userId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBrief_userId_forDate_key" ON "DailyBrief"("userId", "forDate");

-- CreateIndex
CREATE INDEX "OtpChallenge_email_purpose_expiresAt_idx" ON "OtpChallenge"("email", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_idx" ON "OtpChallenge"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "EncryptedApiKey_userId_idx" ON "EncryptedApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptedApiKey_userId_provider_key" ON "EncryptedApiKey"("userId", "provider");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryFact" ADD CONSTRAINT "MemoryFact_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryFact" ADD CONSTRAINT "MemoryFact_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "MemoryFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intent" ADD CONSTRAINT "Intent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeItem" ADD CONSTRAINT "ExchangeItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCandidate" ADD CONSTRAINT "MatchCandidate_agentAId_fkey" FOREIGN KEY ("agentAId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCandidate" ADD CONSTRAINT "MatchCandidate_agentBId_fkey" FOREIGN KEY ("agentBId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_agentAId_fkey" FOREIGN KEY ("agentAId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_agentBId_fkey" FOREIGN KEY ("agentBId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_speakerAgentId_fkey" FOREIGN KEY ("speakerAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Introduction" ADD CONSTRAINT "Introduction_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroductionOutcome" ADD CONSTRAINT "IntroductionOutcome_introductionId_fkey" FOREIGN KEY ("introductionId") REFERENCES "Introduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntroductionOutcome" ADD CONSTRAINT "IntroductionOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_introductionId_fkey" FOREIGN KEY ("introductionId") REFERENCES "Introduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reveal" ADD CONSTRAINT "Reveal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_senderAgentId_fkey" FOREIGN KEY ("senderAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningRule" ADD CONSTRAINT "ScreeningRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watcher" ADD CONSTRAINT "Watcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatcherHit" ADD CONSTRAINT "WatcherHit_watcherId_fkey" FOREIGN KEY ("watcherId") REFERENCES "Watcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_parentSkillId_fkey" FOREIGN KEY ("parentSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillVersion" ADD CONSTRAINT "SkillVersion_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillDependency" ADD CONSTRAINT "SkillDependency_parentSkillId_fkey" FOREIGN KEY ("parentSkillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillDependency" ADD CONSTRAINT "SkillDependency_childSkillId_fkey" FOREIGN KEY ("childSkillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningReceipt" ADD CONSTRAINT "LearningReceipt_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningReceipt" ADD CONSTRAINT "LearningReceipt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAdoption" ADD CONSTRAINT "SkillAdoption_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillAdoption" ADD CONSTRAINT "SkillAdoption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPlan" ADD CONSTRAINT "SafetyPlan_introductionId_fkey" FOREIGN KEY ("introductionId") REFERENCES "Introduction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyPlan" ADD CONSTRAINT "SafetyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBrief" ADD CONSTRAINT "DailyBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptedApiKey" ADD CONSTRAINT "EncryptedApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cosine indexes for the retrieval path. Embeddings are inserted only after
-- normalization so cosine distance has stable ranking behavior.
CREATE INDEX "Agent_profileEmbedding_hnsw_idx"
ON "Agent" USING hnsw ("profileEmbedding" vector_cosine_ops)
WHERE "profileEmbedding" IS NOT NULL;

CREATE INDEX "MemoryFact_embedding_hnsw_idx"
ON "MemoryFact" USING hnsw ("embedding" vector_cosine_ops)
WHERE "embedding" IS NOT NULL AND "deletedAt" IS NULL;

-- Human-visible actions and moderation actions are receipts. Application code
-- never mutates them, and the database enforces that invariant as defense in depth.
CREATE OR REPLACE FUNCTION orbit_reject_receipt_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ORBIT receipt tables are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_append_only"
BEFORE UPDATE OR DELETE ON "ActivityLog"
FOR EACH ROW EXECUTE FUNCTION orbit_reject_receipt_mutation();

CREATE TRIGGER "ModerationAction_append_only"
BEFORE UPDATE OR DELETE ON "ModerationAction"
FOR EACH ROW EXECUTE FUNCTION orbit_reject_receipt_mutation();
