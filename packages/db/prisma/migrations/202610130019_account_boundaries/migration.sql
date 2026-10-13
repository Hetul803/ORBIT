ALTER TYPE "SourceDocumentKind" ADD VALUE 'OUTLOOK_MESSAGE';
ALTER TYPE "SourceDocumentKind" ADD VALUE 'MICROSOFT_CALENDAR_EVENT';

-- Connected sources cannot silently become unbound when a connection is purged.
ALTER TABLE "SourceDocument" DROP CONSTRAINT "SourceDocument_connectionId_fkey";
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION orbit_source_account_boundary() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE account_owner text; account_provider text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW."userId" <> OLD."userId" OR NEW.kind <> OLD.kind
    OR NEW."externalId" <> OLD."externalId" OR (OLD."connectionId" IS NOT NULL AND NEW."connectionId" IS DISTINCT FROM OLD."connectionId")) THEN
    RAISE EXCEPTION 'A source cannot move between accounts or identities' USING ERRCODE = '23514';
  END IF;
  IF NEW."connectionId" IS NULL THEN
    IF NEW.kind::text IN ('OUTLOOK_MESSAGE', 'MICROSOFT_CALENDAR_EVENT') THEN
      RAISE EXCEPTION 'Microsoft sources require an account binding' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT "userId", provider::text INTO account_owner, account_provider
    FROM "Connection" WHERE id = NEW."connectionId";
  IF account_owner IS NULL OR account_owner <> NEW."userId"
    OR (NEW.kind::text IN ('GMAIL_MESSAGE', 'GOOGLE_CALENDAR_EVENT') AND account_provider <> 'GOOGLE')
    OR (NEW.kind::text IN ('OUTLOOK_MESSAGE', 'MICROSOFT_CALENDAR_EVENT') AND account_provider <> 'MICROSOFT') THEN
    RAISE EXCEPTION 'Source owner and provider must match its connected account' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orbit_source_account_boundary
  BEFORE INSERT OR UPDATE OF id, "userId", "connectionId", kind, "externalId" ON "SourceDocument"
  FOR EACH ROW EXECUTE FUNCTION orbit_source_account_boundary();

CREATE FUNCTION orbit_connection_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW."userId" <> OLD."userId" OR NEW.provider <> OLD.provider OR NEW."accountKey" <> OLD."accountKey"
    OR (OLD."accountEmail" IS NOT NULL AND lower(NEW."accountEmail") IS DISTINCT FROM lower(OLD."accountEmail")) THEN
    RAISE EXCEPTION 'A connected account cannot change owner or provider' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orbit_connection_identity_immutable
  BEFORE UPDATE OF id, "userId", provider, "accountKey", "accountEmail" ON "Connection"
  FOR EACH ROW EXECUTE FUNCTION orbit_connection_identity_immutable();
